import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireOrganizationReadActor } from "../organization/access";
import {
  type LimitRecoveryCapability,
  requireOrganizationBusinessWrite,
  requireOrganizationBusinessWriteOrLimitRecoveryCapability,
} from "../organizationBilling/service";
import { isShiftTargetStaff } from "../staff/service";
import {
  observedMutation as mutation,
  observedQuery as query,
  registerConvexFunctionErrorContext,
} from "./errorObservability";
import { type StaffAccessKind, sessionMatchesAccessKind, staffAccessKindValidator } from "./staffAccess";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
type IdentityLookupMode = "query" | "mutation";

function authKey(identity: UserIdentity) {
  return identity.tokenIdentifier;
}

async function getUserByIdentity(ctx: DbCtx, identity: UserIdentity, mode: IdentityLookupMode) {
  const key = authKey(identity);
  const users = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", key))
    .take(2);
  if (users.length > 1) {
    if (mode === "mutation") throw new ConvexError("Not found");
    return null;
  }
  return users[0] ?? null;
}

type ManagerAccessMode = "query" | "mutation";

type ManagerShopAccess = {
  shop: Doc<"shops">;
  organization: Doc<"organizations"> | null;
  organizationMember: Doc<"organizationMembers"> | null;
};

async function resolveOrganizationShopAccess(
  ctx: DbCtx,
  user: Doc<"users">,
  shop: Doc<"shops">,
): Promise<ManagerShopAccess | null> {
  if (!shop.organizationId || shop.isDeleted) return null;

  const organization = await ctx.db.get(shop.organizationId);
  if (!organization || organization.isDeleted) return null;

  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_userId_and_organizationId", (q) => q.eq("userId", user._id).eq("organizationId", organization._id))
    .take(2);
  if (memberships.length === 0) {
    // TODO[narrow]: 全deploymentでm029が完走し、verifyLegacyShopMembersの全pageが0件になった後、
    //   このshopMembers fallbackを削除する。organizationMemberが1件でも存在する場合は使用しない。
    const legacyMemberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
        q.eq("userId", user._id).eq("shopId", shop._id).eq("isDeleted", false),
      )
      .take(2);
    return legacyMemberships.length === 1 ? { shop, organization, organizationMember: null } : null;
  }
  if (memberships.length !== 1) return null;

  const organizationMember = memberships[0];
  if (organizationMember.status !== "active") return null;

  const person = await ctx.db.get(organizationMember.personId);
  if (
    !person ||
    person.organizationId !== organization._id ||
    person.userId !== user._id ||
    person.status !== "active"
  ) {
    return null;
  }

  return { shop, organization, organizationMember };
}

async function resolveLegacyShopAccess(
  ctx: DbCtx,
  user: Doc<"users">,
  shop: Doc<"shops">,
): Promise<ManagerShopAccess | null> {
  if (shop.organizationId || shop.isDeleted) return null;

  // TODO[narrow]: 全deploymentでm025/m029が完走し、verifyShops/verifyLegacyShopMembersの
  //   全pageが0件になった後、このshopMembers fallbackを削除する。
  const memberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
      q.eq("userId", user._id).eq("shopId", shop._id).eq("isDeleted", false),
    )
    .take(2);
  return memberships.length === 1 ? { shop, organization: null, organizationMember: null } : null;
}

async function resolveExplicitShopForUser(ctx: DbCtx, user: Doc<"users">, shopId: Id<"shops">) {
  const shop = await ctx.db.get(shopId);
  if (!shop) return null;
  if (shop.organizationId) return await resolveOrganizationShopAccess(ctx, user, shop);
  return await resolveLegacyShopAccess(ctx, user, shop);
}

/**
 * 操作対象の店舗を解決する。
 * - shopId 指定あり: 指定店舗と事業者所属を検証する。
 * - shopId 未指定: 旧クライアント互換として、先頭の利用可能な店舗を返す。
 */
async function resolveShopForUser(
  ctx: DbCtx,
  user: Doc<"users">,
  shopId: Id<"shops"> | undefined,
): Promise<ManagerShopAccess | null> {
  if (shopId) return await resolveExplicitShopForUser(ctx, user, shopId);

  const allowedStatuses = ["active"] as const;
  for (const status of allowedStatuses) {
    const memberships = ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", user._id).eq("status", status));
    for await (const membership of memberships) {
      const shop = await ctx.db
        .query("shops")
        .withIndex("by_organizationId_and_isDeleted", (q) =>
          q.eq("organizationId", membership.organizationId).eq("isDeleted", false),
        )
        .first();
      if (shop) {
        const access = await resolveOrganizationShopAccess(ctx, user, shop);
        if (access) return access;
      }
    }
  }

  // TODO[narrow]: 全deploymentでm025/m029が完走し、verifyShops/verifyLegacyShopMembersの全pageが0件、
  //   shopId必須のクライアント配布も完了した後、このshopMembers探索を削除する。
  const legacyMemberships = ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false));
  for await (const membership of legacyMemberships) {
    const access = await resolveExplicitShopForUser(ctx, user, membership.shopId);
    if (access) return access;
  }
  return null;
}

// Query用: 全フィールド nullable（throw しないため）
type AuthenticatedQueryCtx = {
  identity: UserIdentity | null;
  user: Doc<"users"> | null;
};

type ManagerQueryCtx = {
  user: Doc<"users"> | null;
  shop: Doc<"shops"> | null;
  organization: Doc<"organizations"> | null;
  organizationMember: Doc<"organizationMembers"> | null;
};

// Mutation用: throw 後は non-null が保証される
type AuthenticatedMutationCtx = {
  identity: UserIdentity;
  user: Doc<"users"> | null;
};

type OrganizationQueryCtx = {
  user: Doc<"users">;
  organization: Doc<"organizations">;
  organizationPerson: Doc<"organizationPeople">;
  organizationMember: Doc<"organizationMembers">;
};

type OrganizationMutationCtx = {
  user: Doc<"users">;
  organization: Doc<"organizations">;
  organizationPerson: Doc<"organizationPeople">;
  organizationMember: Doc<"organizationMembers">;
};

type ManagerMutationCtx = {
  user: Doc<"users">;
  shop: Doc<"shops">;
  organization: Doc<"organizations"> | null;
  organizationMember: Doc<"organizationMembers"> | null;
};

/**
 * authenticatedQuery / authenticatedMutation
 * - Clerk認証のみ。user は optional（新規ユーザーは users テーブルに未登録）
 * - 用途: getDashboardData（shop未作成でも動作）、createShop（shop未作成状態で呼ぶ）
 */
export const authenticatedQuery = customQuery(query, {
  args: {},
  input: async (ctx): Promise<{ ctx: AuthenticatedQueryCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ctx: { identity: null, user: null }, args: {} };
    }
    const user = await getUserByIdentity(ctx, identity, "query");
    if (user) {
      registerConvexFunctionErrorContext(ctx, { actorKind: "authenticated", actorUserId: user._id });
    }
    return { ctx: { identity, user }, args: {} };
  },
});

export const authenticatedMutation = customMutation(mutation, {
  args: {},
  input: async (ctx): Promise<{ ctx: AuthenticatedMutationCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthenticated");
    }
    const user = await getUserByIdentity(ctx, identity, "mutation");
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "authenticated",
      ...(user ? { actorUserId: user._id } : {}),
    });
    return { ctx: { identity, user }, args: {} };
  },
});

/**
 * organizationQuery
 * - Clerk identityからcanonicalな組織所属を直接検証する
 * - activeの通常readだけを許可し、店舗やshopMembersへfallbackしない
 */
export const organizationQuery = customQuery(query, {
  args: { organizationId: v.id("organizations") },
  input: async (ctx, { organizationId }): Promise<{ ctx: OrganizationQueryCtx; args: Record<string, never> }> => {
    registerConvexFunctionErrorContext(ctx, { requestedOrganizationId: organizationId });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not found");

    const user = await getUserByIdentity(ctx, identity, "query");
    if (!user || user.isDeleted) throw new ConvexError("Not found");
    registerConvexFunctionErrorContext(ctx, { actorKind: "manager", actorUserId: user._id });

    const actor = await requireOrganizationReadActor(ctx, { user, organizationId });
    registerConvexFunctionErrorContext(ctx, {
      actorPersonId: actor.person._id,
      organizationId: actor.organization._id,
    });
    return {
      ctx: {
        user,
        organization: actor.organization,
        organizationPerson: actor.person,
        organizationMember: actor.member,
      },
      args: {},
    };
  },
});

/**
 * organizationMutation
 * - canonicalなactive組織所属を直接検証する
 * - 通常の組織業務writeだけを許可し、店舗やshopMembersへfallbackしない
 */
export const organizationMutation = customMutation(mutation, {
  args: { organizationId: v.id("organizations") },
  input: async (ctx, { organizationId }): Promise<{ ctx: OrganizationMutationCtx; args: Record<string, never> }> => {
    registerConvexFunctionErrorContext(ctx, { requestedOrganizationId: organizationId });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Unauthenticated");

    const user = await getUserByIdentity(ctx, identity, "mutation");
    if (!user || user.isDeleted) throw new ConvexError("Not found");
    registerConvexFunctionErrorContext(ctx, { actorKind: "manager", actorUserId: user._id });

    const actor = await requireOrganizationReadActor(ctx, { user, organizationId });
    registerConvexFunctionErrorContext(ctx, {
      actorPersonId: actor.person._id,
      organizationId: actor.organization._id,
    });
    if (actor.member.status !== "active") throw new ConvexError("Not found");
    await requireOrganizationBusinessWrite(ctx, actor.organization._id);
    return {
      ctx: {
        user,
        organization: actor.organization,
        organizationPerson: actor.person,
        organizationMember: actor.member,
      },
      args: {},
    };
  },
});

/**
 * managerQuery / managerMutation
 * - Clerk認証 + users + shops 全て必須
 * - 用途: createRecruitment, addStaffs 等の shop スコープ操作
 */
export const managerQuery = customQuery(query, {
  // optional は旧フロントとの段階リリース互換。現行フロントは必ず shopId を指定する。
  args: {
    shopId: v.optional(v.id("shops")),
    expectedOrganizationId: v.optional(v.id("organizations")),
  },
  input: async (
    ctx,
    { shopId, expectedOrganizationId },
  ): Promise<{ ctx: ManagerQueryCtx; args: Record<string, never> }> => {
    registerConvexFunctionErrorContext(ctx, {
      ...(shopId ? { requestedShopId: shopId } : {}),
      ...(expectedOrganizationId ? { requestedExpectedOrganizationId: expectedOrganizationId } : {}),
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ctx: { user: null, shop: null, organization: null, organizationMember: null }, args: {} };
    }
    const user = await getUserByIdentity(ctx, identity, "query");
    if (user) registerConvexFunctionErrorContext(ctx, { actorKind: "manager", actorUserId: user._id });
    const access = user && !user.isDeleted ? await resolveShopForUser(ctx, user, shopId) : null;
    if (!user || user.isDeleted || !access) {
      return { ctx: { user: null, shop: null, organization: null, organizationMember: null }, args: {} };
    }
    if (
      expectedOrganizationId &&
      (access.organization?._id !== expectedOrganizationId || access.organizationMember === null)
    ) {
      return { ctx: { user: null, shop: null, organization: null, organizationMember: null }, args: {} };
    }
    registerConvexFunctionErrorContext(ctx, {
      shopId: access.shop._id,
      ...(access.organization ? { organizationId: access.organization._id } : {}),
      ...(access.organizationMember ? { actorPersonId: access.organizationMember.personId } : {}),
    });
    return { ctx: { user, ...access }, args: {} };
  },
});

type ManagerMutationScope = {
  shopId?: Id<"shops">;
  expectedOrganizationId?: Id<"organizations">;
};

async function resolveManagerMutationInput(
  ctx: MutationCtx,
  { shopId, expectedOrganizationId }: ManagerMutationScope,
  limitRecoveryCapability?: LimitRecoveryCapability,
): Promise<{ ctx: ManagerMutationCtx; args: Record<string, never> }> {
  registerConvexFunctionErrorContext(ctx, {
    ...(shopId ? { requestedShopId: shopId } : {}),
    ...(expectedOrganizationId ? { requestedExpectedOrganizationId: expectedOrganizationId } : {}),
  });
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Unauthenticated");
  }
  const user = await getUserByIdentity(ctx, identity, "mutation");
  if (user) registerConvexFunctionErrorContext(ctx, { actorKind: "manager", actorUserId: user._id });
  const access = user && !user.isDeleted ? await resolveShopForUser(ctx, user, shopId) : null;
  if (!user || user.isDeleted || !access) {
    throw new ConvexError("Not found");
  }
  if (
    expectedOrganizationId &&
    (access.organization?._id !== expectedOrganizationId || access.organizationMember === null)
  ) {
    throw new ConvexError("Not found");
  }
  if (access.organization) {
    if (limitRecoveryCapability && access.organizationMember) {
      await requireOrganizationBusinessWriteOrLimitRecoveryCapability(ctx, {
        organizationId: access.organization._id,
        personId: access.organizationMember.personId,
        capability: limitRecoveryCapability,
      });
    } else {
      await requireOrganizationBusinessWrite(ctx, access.organization._id);
    }
  }
  registerConvexFunctionErrorContext(ctx, {
    shopId: access.shop._id,
    ...(access.organization ? { organizationId: access.organization._id } : {}),
    ...(access.organizationMember ? { actorPersonId: access.organizationMember.personId } : {}),
  });
  return { ctx: { user, ...access }, args: {} };
}

export const managerMutation = customMutation(mutation, {
  // optional は旧フロントとの段階リリース互換。現行フロントは必ず shopId を指定する。
  args: {
    shopId: v.optional(v.id("shops")),
    expectedOrganizationId: v.optional(v.id("organizations")),
  },
  input: async (ctx, scope) => await resolveManagerMutationInput(ctx, scope),
});

/**
 * 利用上限の超過・評価不能中でも、利用量を増やさない指定済みの整理操作だけを許可する。
 * canonical organization memberを解決できない旧shopMembership経路は、通常writeの互換判定へ閉じる。
 */
export function managerLimitRecoveryMutation(capability: LimitRecoveryCapability) {
  return customMutation(mutation, {
    args: {
      shopId: v.optional(v.id("shops")),
      expectedOrganizationId: v.optional(v.id("organizations")),
    },
    input: async (ctx, scope) => await resolveManagerMutationInput(ctx, scope, capability),
  });
}

// ========================================
// スタッフセッション認証（マジックリンク経由）
// ========================================

type StaffSessionQueryCtx = {
  staff: Doc<"staffs"> | null;
  shop: Doc<"shops"> | null;
  session: Doc<"sessions"> | null;
};

type StaffSessionCtx = {
  staff: Doc<"staffs">;
  shop: Doc<"shops">;
  session: Doc<"sessions">;
};

type StaffSessionResolution =
  | { status: "ok"; ctx: StaffSessionCtx }
  | { status: "sessionExpired" }
  | { status: "notFound" };

async function resolveStaffSession(
  ctx: DbCtx,
  sessionToken: string,
  accessKind: StaffAccessKind,
  mode: ManagerAccessMode,
): Promise<StaffSessionResolution> {
  const sessions = await ctx.db
    .query("sessions")
    .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
    .take(2);
  const session = sessions.length === 1 ? sessions[0] : null;
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= Date.now() ||
    !sessionMatchesAccessKind(session, accessKind)
  ) {
    return { status: "sessionExpired" };
  }

  const [staff, shop] = await Promise.all([ctx.db.get(session.staffId), ctx.db.get(session.shopId)]);
  // シフト対象外スタッフは、削除済みスタッフと同じくシフト画面の認証境界で拒否する。
  if (!staff || !isShiftTargetStaff(staff) || staff.shopId !== session.shopId || !shop || shop.isDeleted) {
    return { status: "notFound" };
  }

  if (!shop.organizationId) {
    return { status: "notFound" };
  }
  const organization = await ctx.db.get(shop.organizationId);
  if (!organization || organization.isDeleted) {
    return { status: "notFound" };
  }

  // TODO[narrow]: 全deploymentでm050完走・verifyStaffs全異常0・未解消staff conflict 0を確認後、
  //   両canonical ID欠損staffの既存session互換を削除する。片側だけの欠損は常にfail closed。
  const isUnresolvedStaff = staff.organizationId === undefined && staff.organizationPersonId === undefined;
  if (!isUnresolvedStaff) {
    if (
      staff.organizationId === undefined ||
      staff.organizationPersonId === undefined ||
      staff.organizationId !== organization._id
    ) {
      return { status: "notFound" };
    }
    const person = await ctx.db.get(staff.organizationPersonId);
    if (
      person?.status !== "active" ||
      person.organizationId !== organization._id ||
      (staff.userId !== undefined && person.userId !== staff.userId)
    ) {
      return { status: "notFound" };
    }
  }

  if (mode === "mutation") {
    await requireOrganizationBusinessWrite(ctx, organization._id);
  }

  return { status: "ok", ctx: { staff, shop, session } };
}

/**
 * staffSessionQuery
 * - sessionToken でスタッフセッションを検証
 * - Clerk認証不要（スタッフはClerkアカウントを持たない）
 * - 無効/期限切れの場合は null を返す（throwしない）
 */
export const staffSessionQuery = customQuery(query, {
  args: { sessionToken: v.string(), accessKind: staffAccessKindValidator },
  input: async (
    ctx,
    { sessionToken, accessKind },
  ): Promise<{ ctx: StaffSessionQueryCtx; args: Record<string, never> }> => {
    const result = await resolveStaffSession(ctx, sessionToken, accessKind, "query");
    if (result.status !== "ok") {
      return { ctx: { staff: null, shop: null, session: null }, args: {} };
    }
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "staff",
      staffId: result.ctx.staff._id,
      shopId: result.ctx.shop._id,
      ...(result.ctx.shop.organizationId ? { organizationId: result.ctx.shop.organizationId } : {}),
      ...(result.ctx.staff.organizationPersonId ? { actorPersonId: result.ctx.staff.organizationPersonId } : {}),
    });
    return { ctx: result.ctx, args: {} };
  },
});

/**
 * staffSessionMutation
 * - sessionToken でスタッフセッションを検証（mutation版）
 * - 無効/期限切れの場合は ConvexError を throw する
 */
export const staffSessionMutation = customMutation(mutation, {
  args: { sessionToken: v.string(), accessKind: staffAccessKindValidator },
  input: async (ctx, { sessionToken, accessKind }): Promise<{ ctx: StaffSessionCtx; args: Record<string, never> }> => {
    const result = await resolveStaffSession(ctx, sessionToken, accessKind, "mutation");
    if (result.status === "sessionExpired") {
      throw new ConvexError("Session expired");
    }
    if (result.status === "notFound") {
      throw new ConvexError("Not found");
    }
    registerConvexFunctionErrorContext(ctx, {
      actorKind: "staff",
      staffId: result.ctx.staff._id,
      shopId: result.ctx.shop._id,
      ...(result.ctx.shop.organizationId ? { organizationId: result.ctx.shop.organizationId } : {}),
      ...(result.ctx.staff.organizationPersonId ? { actorPersonId: result.ctx.staff.organizationPersonId } : {}),
    });
    return { ctx: result.ctx, args: {} };
  },
});
