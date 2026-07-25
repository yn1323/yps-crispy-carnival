import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { isOrganizationCreationEnabled } from "../_lib/config";
import { authenticatedMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { normalizeEmail } from "../_lib/validation";
import { recordUserLegalConsent } from "../legal/service";
import { updateShopSettingsSchema } from "../shop/schemas";
import { setupShopAndManagerSchema } from "./schemas";
import { createOrganizationWithFirstShop, getOrganizationCreationAvailability } from "./service";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const PRIOR_OPERATION_ERROR = "以前の操作結果を確認できません";
const ORGANIZATION_CREATION_UNAVAILABLE_MESSAGE = "新しいグループの作成は現在ご利用いただけません";

export const setupShopAndManager = authenticatedMutation({
  args: {
    shopName: v.string(),
    submissionPattern: submissionPatternValidator,
    managerName: v.string(),
    managerEmail: v.string(),
    acceptedLegal: v.literal(true),
  },
  returns: v.id("shops"),
  handler: async (ctx, args) => {
    const parsed = setupShopAndManagerSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const currentUser = ctx.user;
    if (currentUser?.isDeleted || currentUser?.accountDeletionRequestedAt !== undefined) {
      throw new ConvexError("無効になったアカウントでは初期設定を開始できません");
    }
    if (currentUser) {
      const selfCreatedOrganizations = await ctx.db
        .query("organizations")
        .withIndex("by_createdByUserId_and_isDeleted", (q) =>
          q.eq("createdByUserId", currentUser._id).eq("isDeleted", false),
        )
        .take(2);
      if (selfCreatedOrganizations.length > 1) {
        throw new ConvexError("作成済みのグループを一意に確認できません");
      }
      if (selfCreatedOrganizations.length === 1) {
        throw new ConvexError("自分で作成できるグループは一つまでです");
      }

      // TODO[narrow]: develop/prodでm009_shops_to_organizationsと
      //   m010_shop_members_to_organization_membersが完走していることを
      //   `pnpm convex:migrate:status`（state: done）で確認後、このlegacy shopMembers guardを削除する。
      //   事業者へ招待された所属は自分で作成した事業者ではないため、org付き店舗はここで拒否しない。
      const legacyMemberships = ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", currentUser._id).eq("isDeleted", false));
      for await (const membership of legacyMemberships) {
        const legacyShop = await ctx.db.get(membership.shopId);
        if (legacyShop && !legacyShop.isDeleted && !legacyShop.organizationId) {
          throw new ConvexError("既に店舗が登録されています");
        }
      }
    }

    const now = Date.now();
    const managerEmailNormalized = normalizeEmail(input.managerEmail);
    const userId = currentUser
      ? currentUser._id
      : await ctx.db.insert("users", {
          authTokenIdentifier: ctx.identity.tokenIdentifier,
          name: input.managerName,
          email: input.managerEmail,
          emailNormalized: managerEmailNormalized,
          role: "manager",
          isDeleted: false,
        });
    if (currentUser) {
      await ctx.db.patch(currentUser._id, {
        name: input.managerName,
        email: input.managerEmail,
        emailNormalized: managerEmailNormalized,
      });
    }

    const { shopId } = await createOrganizationWithFirstShop(ctx, {
      userId,
      managerName: input.managerName,
      managerEmail: input.managerEmail,
      organizationName: input.shopName,
      shopName: input.shopName,
      regularClosedDays: [],
      submissionPattern: input.submissionPattern,
      // 初回セットアップだけが支払い不要Businessで始まる。追加作成はFreeで始める。
      billingState: { kind: "complimentary", plan: "business" },
      now,
    });

    await recordUserLegalConsent(ctx, {
      userId,
      shopId,
      method: "manager_setup",
    });

    return shopId;
  },
});

/**
 * 既に管理者として利用している人が、二つ目以降のグループを作る。
 *
 * 初回セットアップと違い、users行と利用規約の同意状態は既にあるため変更しない。
 * 支払い不要Businessは初回だけの提供であり、ここで作るグループはFreeで始まる。
 */
export const createOrganization = authenticatedMutation({
  args: {
    shopName: v.string(),
    regularClosedDays: v.optional(
      v.array(
        v.union(
          v.literal("sun"),
          v.literal("mon"),
          v.literal("tue"),
          v.literal("wed"),
          v.literal("thu"),
          v.literal("fri"),
          v.literal("sat"),
        ),
      ),
    ),
    submissionPattern: submissionPatternValidator,
    requestId: v.string(),
  },
  returns: v.object({ shopId: v.id("shops"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.user;
    if (!user) throw new ConvexError("グループを作成する前に、初期設定を完了してください");

    // 冪等recordとrate limit budgetより前に判定し、閉じている間はどちらも消費しない。
    if (!isOrganizationCreationEnabled()) throw new ConvexError(ORGANIZATION_CREATION_UNAVAILABLE_MESSAGE);

    const requestKey = await toAuditRequestKey(args.requestId);
    const correlationId = `user:${user._id}:organization:create:${requestKey}`;
    const priorShopId = await findPriorCreatedOrganizationShop(ctx, { correlationId, userId: user._id });
    if (priorShopId) return { shopId: priorShopId, created: false };

    const [shortLimit, dailyLimit] = await Promise.all([
      rateLimit(ctx, { name: "organizationCreateShort", key: user._id }),
      rateLimit(ctx, { name: "organizationCreateDaily", key: user._id }),
    ]);
    if (!shortLimit.ok || !dailyLimit.ok) {
      throw new ConvexError("グループの作成が続いています。時間をおいてお試しください");
    }

    const availability = await getOrganizationCreationAvailability(ctx, user);
    if (!availability.canCreate) throw new ConvexError(availability.reason);

    const parsed = updateShopSettingsSchema.safeParse({
      shopName: args.shopName,
      regularClosedDays: args.regularClosedDays ?? [],
      submissionPattern: args.submissionPattern,
    });
    if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");

    const { shopId } = await createOrganizationWithFirstShop(ctx, {
      userId: user._id,
      managerName: user.name,
      managerEmail: user.email,
      organizationName: parsed.data.shopName,
      shopName: parsed.data.shopName,
      regularClosedDays: WEEKDAY_ORDER.filter((day) => parsed.data.regularClosedDays.includes(day)),
      submissionPattern: parsed.data.submissionPattern,
      billingState: { kind: "active", plan: "free" },
      correlationId,
      now: Date.now(),
    });

    return { shopId, created: true };
  },
});

/**
 * 同じrequestIdでの再実行を、二つ目のグループを増やさずに収束させる。
 *
 * 監査には作成したグループを記録するため、返す店舗はそのグループの最初の店舗から引く。
 */
async function findPriorCreatedOrganizationShop(
  ctx: MutationCtx,
  args: { correlationId: string; userId: Id<"users"> },
): Promise<Id<"shops"> | null> {
  const audit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .first();
  if (!audit) return null;
  if (audit.action !== "organization.created" || audit.targetKind !== "organization") {
    throw new ConvexError(PRIOR_OPERATION_ERROR);
  }
  if (audit.actorUserId !== args.userId) throw new ConvexError(PRIOR_OPERATION_ERROR);

  const organization = await ctx.db.get(audit.organizationId);
  if (!organization || organization.isDeleted || organization.createdByUserId !== args.userId) {
    throw new ConvexError(PRIOR_OPERATION_ERROR);
  }

  const shop = await ctx.db
    .query("shops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
    .first();
  if (!shop || shop.isDeleted) throw new ConvexError(PRIOR_OPERATION_ERROR);
  return shop._id;
}
