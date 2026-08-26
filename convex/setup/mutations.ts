import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { getPromotionComplimentaryProCode } from "../_lib/config";
import { authenticatedMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { submissionPatternValidator } from "../_lib/submissionPattern";
import { normalizeEmail } from "../_lib/validation";
import { recordUserLegalConsent } from "../legal/service";
import { requireOrganizationReadActor } from "../organization/access";
import { updateShopSettingsSchema } from "../shop/schemas";
import { isPromotionCode, normalizePromotionCode, PROMOTION_CODE_INVALID_ERROR_CODE } from "./constants";
import { setupShopAndManagerSchema } from "./schemas";
import {
  createOrganizationWithFirstShop,
  getOrganizationCreationAvailability,
  ORGANIZATION_CREATE_UNAVAILABLE_MESSAGE,
} from "./service";

const WEEKDAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const PRIOR_OPERATION_ERROR = "以前の操作結果を確認できません。";
const MANAGER_AUTHORITY_SCAN_LIMIT = 50;

function invalidPromotionCode(): never {
  throw new ConvexError({ code: PROMOTION_CODE_INVALID_ERROR_CODE });
}

function resolveInitialSetupBillingMode(promotionCode: string | undefined): "trial" | "complimentaryPro" {
  if (!promotionCode) return "trial";
  const configuredCode = getPromotionComplimentaryProCode();
  if (!configuredCode || !isPromotionCode(configuredCode) || configuredCode !== promotionCode) {
    return invalidPromotionCode();
  }
  return "complimentaryPro";
}

type InitialSetupCtx = MutationCtx & { user: Doc<"users"> | null };

async function assertInitialSetupEligibility(ctx: InitialSetupCtx): Promise<void> {
  const currentUser = ctx.user;
  if (currentUser?.isDeleted || currentUser?.accountDeletionRequestedAt !== undefined) {
    throw new ConvexError("無効になったアカウントでは、初期設定を開始できません。");
  }
  if (!currentUser) return;

  const currentMemberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", currentUser._id).eq("status", "active"))
    .take(2);
  for (const membership of currentMemberships) {
    const organization = await ctx.db.get(membership.organizationId);
    if (organization && !organization.isDeleted) {
      throw new ConvexError("すでに組織へ所属しています。");
    }
  }
  const activePeople = await ctx.db
    .query("organizationPeople")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", currentUser._id).eq("status", "active"))
    .take(2);
  for (const person of activePeople) {
    const organization = await ctx.db.get(person.organizationId);
    if (organization && !organization.isDeleted) {
      throw new ConvexError("すでに組織へ所属しています。");
    }
  }

  const selfCreatedOrganizations = await ctx.db
    .query("organizations")
    .withIndex("by_createdByUserId_and_isDeleted", (q) =>
      q.eq("createdByUserId", currentUser._id).eq("isDeleted", false),
    )
    .take(2);
  if (selfCreatedOrganizations.length > 1) {
    throw new ConvexError(
      "作成済みの組織情報を確認できません。\n画面を更新しても解消しない場合は、お問い合わせください。",
    );
  }
  if (selfCreatedOrganizations.length === 1) {
    throw new ConvexError("自分で作成できる組織は1つまでです。");
  }

  // TODO[narrow]: 全deploymentでm025/m029が完走し、verifyShops/verifyLegacyShopMembersの
  //   全pageが0件になった後、このlegacy shopMembers guardを削除する。
  const legacyMemberships = ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", currentUser._id).eq("isDeleted", false));
  for await (const membership of legacyMemberships) {
    const legacyShop = await ctx.db.get(membership.shopId);
    if (!legacyShop || legacyShop.isDeleted) continue;
    if (!legacyShop.organizationId) {
      throw new ConvexError("すでに店舗が登録されています。");
    }
    const organization = await ctx.db.get(legacyShop.organizationId);
    if (organization && !organization.isDeleted) {
      throw new ConvexError("すでに組織へ所属しています。");
    }
  }
}

export const verifyPromotionCode = authenticatedMutation({
  args: { promotionCode: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await assertInitialSetupEligibility(ctx);
    resolveInitialSetupBillingMode(normalizePromotionCode(args.promotionCode));
    return null;
  },
});

const additionalOrganizationArgs = {
  shopName: v.string(),
  sourceShopId: v.optional(v.id("shops")),
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
};

const appAdditionalOrganizationArgs = {
  organizationId: v.id("organizations"),
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
};

type AdditionalOrganizationArgs = {
  shopName: string;
  sourceShopId?: Id<"shops">;
  regularClosedDays?: (typeof WEEKDAY_ORDER)[number][];
  submissionPattern: typeof submissionPatternValidator.type;
  requestId: string;
};

export const setupShopAndManager = authenticatedMutation({
  args: {
    shopName: v.string(),
    submissionPattern: submissionPatternValidator,
    managerName: v.string(),
    managerEmail: v.string(),
    promotionCode: v.optional(v.string()),
    acceptedLegal: v.literal(true),
  },
  returns: v.id("shops"),
  handler: async (ctx, args) => {
    const parsed = setupShopAndManagerSchema.safeParse(args);
    if (!parsed.success) {
      if (parsed.error.issues.some((issue) => issue.path[0] === "promotionCode")) invalidPromotionCode();
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }
    const input = parsed.data;
    const currentUser = ctx.user;
    await assertInitialSetupEligibility(ctx);

    const billingMode = resolveInitialSetupBillingMode(input.promotionCode);
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
      shopName: input.shopName,
      regularClosedDays: [],
      submissionPattern: input.submissionPattern,
      billingMode,
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
 * 既に管理者として利用している人が、二つ目以降の組織を作る。
 *
 * 初回セットアップと違い、users行と利用規約の同意状態は既にあるため変更しない。
 * 追加組織はフリープランで始める。
 */
export const createOrganization = authenticatedMutation({
  args: additionalOrganizationArgs,
  returns: v.object({ shopId: v.id("shops"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const user = ctx.user;
    if (!user) throw new ConvexError("組織を作成する前に、初期設定を完了してください。");
    const result = await createAdditionalOrganization(ctx, user, args);
    return { shopId: result.shopId, created: result.created };
  },
});

/** app navigation用。作成した組織をURL authorityへ採用できるようorganizationIdも返す。 */
export const createOrganizationForApp = authenticatedMutation({
  args: appAdditionalOrganizationArgs,
  returns: v.object({
    organizationId: v.id("organizations"),
    shopId: v.id("shops"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = ctx.user;
    if (!user) throw new ConvexError("組織を作成する前に、初期設定を完了してください。");
    const actor = await requireOrganizationReadActor(ctx, {
      user,
      organizationId: args.organizationId,
    });
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    return await createAdditionalOrganization(
      ctx,
      user,
      {
        shopName: args.shopName,
        regularClosedDays: args.regularClosedDays,
        submissionPattern: args.submissionPattern,
        requestId: args.requestId,
      },
      {
        name: actor.person.name,
        email: actor.person.email,
        source: "canonicalPerson",
      },
    );
  },
});

async function createAdditionalOrganization(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: AdditionalOrganizationArgs,
  managerProfileOverride?: {
    name: string;
    email: string;
    source: "canonicalPerson";
  },
) {
  if (user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
    throw new ConvexError(ORGANIZATION_CREATE_UNAVAILABLE_MESSAGE);
  }

  const managerProfile =
    managerProfileOverride ?? (await resolveOrganizationCreationManagerProfile(ctx, user, args.sourceShopId));
  const requestKey = await toAuditRequestKey(args.requestId);
  const correlationId = `user:${user._id}:organization:create:${requestKey}`;
  const prior = await findPriorCreatedOrganizationShop(ctx, { correlationId, userId: user._id });
  if (prior) return { ...prior, created: false };

  const [shortLimit, dailyLimit] = await Promise.all([
    rateLimit(ctx, { name: "organizationCreateShort", key: user._id }),
    rateLimit(ctx, { name: "organizationCreateDaily", key: user._id }),
  ]);
  if (!shortLimit.ok || !dailyLimit.ok) {
    throw new ConvexError("組織の作成処理が進行中です。\n少し時間をおいてから、もう一度お試しください。");
  }

  const availability = await getOrganizationCreationAvailability(ctx, user);
  if (!availability.canCreate) throw new ConvexError(availability.reason);
  const parsed = updateShopSettingsSchema.safeParse({
    shopName: args.shopName,
    regularClosedDays: args.regularClosedDays ?? [],
    submissionPattern: args.submissionPattern,
  });
  if (!parsed.success) throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");

  const created = await createOrganizationWithFirstShop(ctx, {
    userId: user._id,
    managerName: managerProfile.name,
    managerEmail: managerProfile.email,
    managerProfileSource: managerProfile.source,
    shopName: parsed.data.shopName,
    regularClosedDays: WEEKDAY_ORDER.filter((day) => parsed.data.regularClosedDays.includes(day)),
    submissionPattern: parsed.data.submissionPattern,
    correlationId,
    billingMode: "free",
    now: Date.now(),
  });
  return { organizationId: created.organizationId, shopId: created.shopId, created: true };
}

async function resolveOrganizationCreationManagerProfile(
  ctx: MutationCtx,
  user: { _id: Id<"users">; name: string; email: string },
  sourceShopId: Id<"shops"> | undefined,
): Promise<{
  name: string;
  email: string;
  source: "canonicalPerson" | "legacySourceUserSnapshot" | "omittedSourceUserSnapshot";
}> {
  if (!sourceShopId) {
    // 旧frontendのsource省略は連絡先だけusers snapshotへfallbackする。
    // 組織を追加できるauthorityまでusers行の存在へfallbackさせない。
    if (!(await hasOrganizationCreationManagerAuthority(ctx, user._id))) throw new ConvexError("Not found");
    return { name: user.name, email: user.email, source: "omittedSourceUserSnapshot" };
  }

  const shop = await ctx.db.get(sourceShopId);
  if (!shop || shop.isDeleted) throw new ConvexError("Not found");

  const sourceOrganizationId = shop.organizationId;
  if (!sourceOrganizationId) {
    const legacyMemberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
        q.eq("userId", user._id).eq("shopId", sourceShopId).eq("isDeleted", false),
      )
      .take(2);
    if (legacyMemberships.length !== 1) throw new ConvexError("Not found");
    return { name: user.name, email: user.email, source: "legacySourceUserSnapshot" };
  }

  const [organization, memberships, people, legacyMemberships] = await Promise.all([
    ctx.db.get(sourceOrganizationId),
    ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_organizationId", (q) =>
        q.eq("userId", user._id).eq("organizationId", sourceOrganizationId),
      )
      .take(2),
    ctx.db
      .query("organizationPeople")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", sourceOrganizationId).eq("userId", user._id),
      )
      .take(2),
    ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
        q.eq("userId", user._id).eq("shopId", sourceShopId).eq("isDeleted", false),
      )
      .take(2),
  ]);
  if (!organization || organization.isDeleted) {
    throw new ConvexError("Not found");
  }

  if (memberships.length === 0) {
    if (legacyMemberships.length !== 1 || people.length > 1) throw new ConvexError("Not found");
    const person = people[0];
    if (!person) {
      return { name: user.name, email: user.email, source: "legacySourceUserSnapshot" };
    }
    if (
      person.organizationId !== organization._id ||
      person.userId !== user._id ||
      person.status !== "active" ||
      normalizeEmail(person.email) !== person.emailNormalized
    ) {
      throw new ConvexError("Not found");
    }
    return { name: person.name, email: person.email, source: "canonicalPerson" };
  }
  if (memberships.length !== 1 || memberships[0].status !== "active" || people.length !== 1) {
    throw new ConvexError("Not found");
  }

  const person = await ctx.db.get(memberships[0].personId);
  if (
    !person ||
    people[0]._id !== person._id ||
    person.organizationId !== organization._id ||
    person.userId !== user._id ||
    person.status !== "active" ||
    normalizeEmail(person.email) !== person.emailNormalized
  ) {
    throw new ConvexError("Not found");
  }
  return { name: person.name, email: person.email, source: "canonicalPerson" };
}

async function hasOrganizationCreationManagerAuthority(ctx: MutationCtx, userId: Id<"users">): Promise<boolean> {
  const activeMemberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .take(MANAGER_AUTHORITY_SCAN_LIMIT + 1);
  if (activeMemberships.length > MANAGER_AUTHORITY_SCAN_LIMIT) return false;

  for (const membership of activeMemberships) {
    const [organization, person, membershipsForOrganization, peopleForOrganization] = await Promise.all([
      ctx.db.get(membership.organizationId),
      ctx.db.get(membership.personId),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) =>
          q.eq("userId", userId).eq("organizationId", membership.organizationId),
        )
        .take(2),
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", membership.organizationId).eq("userId", userId),
        )
        .take(2),
    ]);
    if (
      organization &&
      !organization.isDeleted &&
      person &&
      person.organizationId === organization._id &&
      person.userId === userId &&
      person.status === "active" &&
      membershipsForOrganization.length === 1 &&
      membershipsForOrganization[0]._id === membership._id &&
      peopleForOrganization.length === 1 &&
      peopleForOrganization[0]._id === person._id
    ) {
      return true;
    }
  }

  // TODO[narrow]: 全deploymentでm025/m029が完走し、旧frontend互換期間も終了した後に削除する。
  const legacyMemberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .take(MANAGER_AUTHORITY_SCAN_LIMIT + 1);
  if (legacyMemberships.length > MANAGER_AUTHORITY_SCAN_LIMIT) return false;
  const membershipCountByShopId = new Map<Id<"shops">, number>();
  for (const membership of legacyMemberships) {
    membershipCountByShopId.set(membership.shopId, (membershipCountByShopId.get(membership.shopId) ?? 0) + 1);
  }
  for (const membership of legacyMemberships) {
    if (membershipCountByShopId.get(membership.shopId) !== 1) continue;
    const shop = await ctx.db.get(membership.shopId);
    if (!shop || shop.isDeleted) continue;
    if (!shop.organizationId) return true;
    const organizationId = shop.organizationId;

    const [organization, canonicalMemberships, canonicalPeople] = await Promise.all([
      ctx.db.get(organizationId),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", userId).eq("organizationId", organizationId))
        .take(2),
      ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_userId", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
        .take(2),
    ]);
    if (!organization || organization.isDeleted || canonicalMemberships.length !== 0 || canonicalPeople.length > 1) {
      continue;
    }
    const person = canonicalPeople[0];
    if (
      person &&
      (person.organizationId !== organization._id || person.userId !== userId || person.status !== "active")
    ) {
      continue;
    }
    return true;
  }
  return false;
}

/**
 * 同じrequestIdでの再実行を、二つ目の組織を増やさずに収束させる。
 *
 * 監査には作成した組織を記録するため、返す店舗はその組織の最初の店舗から引く。
 */
async function findPriorCreatedOrganizationShop(
  ctx: MutationCtx,
  args: { correlationId: string; userId: Id<"users"> },
): Promise<{ organizationId: Id<"organizations">; shopId: Id<"shops"> } | null> {
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
  return { organizationId: organization._id, shopId: shop._id };
}
