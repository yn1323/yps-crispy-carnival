import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { assertDevelopmentSeedEnabled } from "../_lib/config";
import { todayJST } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { generateUUID } from "../_lib/uuid";
import { beginAccountDeletionOrganizationDeletion } from "../organization/mutations";
import { getOrganizationCreationAvailability } from "../setup/service";
import { seedUserOrganizationGraph } from "./builders";
import { assertUserSeedEnabled } from "./guard";
import { seedUserMaxOrganizations, seedUserMaxRecruitment, USER_SEED_MAX_ORGANIZATION_NAME } from "./maxBuilders";
import { isSeedableUser, listUserSeedOrganizations } from "./service";

export const RANDOM_SEED_MAX = 2 ** 31 - 1;

const recruitmentKeyValidator = v.union(
  v.literal("confirmedPast"),
  v.literal("confirmedChanged"),
  v.literal("draft"),
  v.literal("recruiting"),
);

export const recruitmentSummaryValidator = v.object({
  key: recruitmentKeyValidator,
  status: v.union(v.literal("open"), v.literal("confirmed")),
  periodStart: v.string(),
  periodEnd: v.string(),
  submittedCount: v.number(),
  preferenceCount: v.number(),
  noteCount: v.number(),
  assignmentCount: v.number(),
});

/** ログインと初期設定を画面で済ませていない実行先で、確認用データの入れ先として作るユーザーの名前とメールアドレス。 */
const SEED_USER_NAME = "確認用ユーザー";
const SEED_USER_EMAIL = "user-seed-manager@example.com";

function resolveRandomSeed(randomSeed: number | undefined, now: number) {
  const seed = randomSeed ?? now % RANDOM_SEED_MAX;
  if (!Number.isSafeInteger(seed)) throw new Error("randomSeed must be an integer");
  return seed;
}

/**
 * 実行先の環境変数`DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER`が指すClerk利用者の、ユーザーの行を用意する。
 * PR環境はプッシュのたびに作り直されてユーザーの行が消えるため、画面でログインと初期設定をやり直さずに投入できるようにする。
 * 利用者の識別子は引数で受け取らず、返り値にも含めない。コマンドの履歴と出力へ残さないためである。
 * 識別子が実行先のClerkのissuerと合わない場合は拒否する。同じ識別子の行がすでにあれば、新しく作らずにその行を返す。
 * 削除済みか、アカウント削除を受け付けた行は、作り直さずに拒否する。
 * 利用規約などへの同意は、本人の操作ではないため記録しない。
 */
export const ensureSeedUser = internalMutation({
  args: {},
  returns: v.object({ userId: v.id("users"), created: v.boolean() }),
  handler: async (ctx) => {
    assertUserSeedEnabled();
    const { primaryAuthTokenIdentifier } = assertDevelopmentSeedEnabled();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", primaryAuthTokenIdentifier))
      .unique();
    if (existing) {
      if (!isSeedableUser(existing)) throw new Error("User seed target user is deleted");
      return { userId: existing._id, created: false };
    }
    const userId = await ctx.db.insert("users", {
      authTokenIdentifier: primaryAuthTokenIdentifier,
      name: SEED_USER_NAME,
      email: SEED_USER_EMAIL,
      emailNormalized: SEED_USER_EMAIL,
      role: "manager",
      isDeleted: false,
    });
    return { userId, created: true };
  },
});

/**
 * 選んだユーザーが唯一の有効な管理者である組織を、画面からの組織削除と同じ処理で論理削除する。
 * 権限や連絡手段の後片付けは既存のcleanup jobが行う。ほかの管理者がいる組織は消さずに返す。
 */
export const resetUserOrganizations = internalMutation({
  args: { userId: v.id("users") },
  returns: v.object({
    deleted: v.array(v.object({ organizationId: v.id("organizations"), name: v.string() })),
    kept: v.array(v.object({ organizationId: v.id("organizations"), name: v.string(), reason: v.string() })),
  }),
  handler: async (ctx, { userId }) => {
    assertUserSeedEnabled();
    const user = await ctx.db.get(userId);
    if (!isSeedableUser(user)) throw new Error("User seed target user was not found");

    const now = Date.now();
    const deleted: Array<{ organizationId: Id<"organizations">; name: string }> = [];
    const kept: Array<{ organizationId: Id<"organizations">; name: string; reason: string }> = [];
    for (const entry of await listUserSeedOrganizations(ctx, user._id)) {
      if (!entry.canDelete) {
        kept.push({
          organizationId: entry.organization._id,
          name: entry.organization.name,
          reason: entry.reason ?? "",
        });
        continue;
      }
      await beginAccountDeletionOrganizationDeletion(ctx, {
        actor: { organization: entry.organization, person: entry.person, member: entry.member },
        accountUserId: user._id,
        requestId: `user-seed:${generateUUID()}`,
        now,
      });
      deleted.push({ organizationId: entry.organization._id, name: entry.organization.name });
    }
    return { deleted, kept };
  },
});

/**
 * 選んだユーザーに、Trialの組織と3つの集め方の店舗を作り、確認に使うデータを入れる。
 * `randomSeed`を省くと実行時刻から決め、使った値を結果に返す。
 */
export const seedUserOrganization = internalMutation({
  args: { userId: v.id("users"), randomSeed: v.optional(v.number()) },
  returns: v.object({
    organizationId: v.id("organizations"),
    organizationName: v.string(),
    randomSeed: v.number(),
    noteMismatchCount: v.number(),
    shops: v.array(
      v.object({
        name: v.string(),
        staffCount: v.number(),
        recruitments: v.array(recruitmentSummaryValidator),
      }),
    ),
  }),
  handler: async (ctx, { userId, randomSeed }) => {
    assertUserSeedEnabled();
    const user = await ctx.db.get(userId);
    if (!isSeedableUser(user)) throw new Error("User seed target user was not found");
    const availability = await getOrganizationCreationAvailability(ctx, user);
    if (!availability.canCreate) throw new Error(availability.reason);

    const now = Date.now();
    const seed = resolveRandomSeed(randomSeed, now);
    return await seedUserOrganizationGraph(ctx, { user, today: todayJST(), now, randomSeed: seed });
  },
});

/**
 * 上限の確認用データの1段目。選んだユーザーに、作れる上限の数だけ組織を作る。
 * 上限いっぱいの組織の募集は件数が多いため、このあと`seedMaxRecruitment`で募集ごとに入れる。
 * 通しで実行するときは`userSeed/actions:seedMaxUserOrganizations`を使う。
 */
export const seedMaxOrganizations = internalMutation({
  args: { userId: v.id("users"), randomSeed: v.optional(v.number()) },
  returns: v.object({
    today: v.string(),
    randomSeed: v.number(),
    noteMismatchCount: v.number(),
    organizations: v.array(
      v.object({
        organizationId: v.id("organizations"),
        name: v.string(),
        isMax: v.boolean(),
        shops: v.array(
          v.object({
            shopId: v.id("shops"),
            name: v.string(),
            staffCount: v.number(),
            recruitments: v.array(recruitmentSummaryValidator),
          }),
        ),
      }),
    ),
  }),
  handler: async (ctx, { userId, randomSeed }) => {
    assertUserSeedEnabled();
    const user = await ctx.db.get(userId);
    if (!isSeedableUser(user)) throw new Error("User seed target user was not found");

    const now = Date.now();
    const today = todayJST();
    const seed = resolveRandomSeed(randomSeed, now);
    const result = await seedUserMaxOrganizations(ctx, { user, today, now, randomSeed: seed });
    return { today, randomSeed: seed, ...result };
  },
});

/**
 * 上限の確認用データの2段目。上限いっぱいの組織の店舗1つに、募集1つとその中身を入れる。
 * 選んだユーザーが`seedMaxOrganizations`で作った組織の店舗にだけ書く。
 */
export const seedMaxRecruitment = internalMutation({
  args: {
    userId: v.id("users"),
    shopId: v.id("shops"),
    recruitmentKey: recruitmentKeyValidator,
    today: v.string(),
    randomSeed: v.number(),
  },
  returns: v.object({ summary: recruitmentSummaryValidator, noteMismatchCount: v.number() }),
  handler: async (ctx, { userId, shopId, recruitmentKey, today, randomSeed }) => {
    assertUserSeedEnabled();
    const user = await ctx.db.get(userId);
    if (!isSeedableUser(user)) throw new Error("User seed target user was not found");
    const shop = await ctx.db.get(shopId);
    const organization = shop && !shop.isDeleted ? await ctx.db.get(shop.organizationId) : null;
    if (
      !shop ||
      !organization ||
      organization.isDeleted ||
      organization.createdByUserId !== user._id ||
      organization.name !== USER_SEED_MAX_ORGANIZATION_NAME
    ) {
      throw new Error("User seed max shop was not found");
    }
    if (!Number.isSafeInteger(randomSeed)) throw new Error("randomSeed must be an integer");

    return await seedUserMaxRecruitment(ctx, { user, shop, recruitmentKey, today, now: Date.now(), randomSeed });
  },
});
