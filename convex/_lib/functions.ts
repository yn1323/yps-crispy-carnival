import type { UserIdentity } from "convex/server";
import { ConvexError, v } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc, Id } from "../_generated/dataModel";
import { type MutationCtx, mutation, type QueryCtx, query } from "../_generated/server";
import { sessionMatchesAccessKind, staffAccessKindValidator } from "./staffAccess";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

function authKey(identity: UserIdentity) {
  return identity.tokenIdentifier;
}

async function getUserByIdentity(ctx: DbCtx, identity: UserIdentity) {
  const key = authKey(identity);
  const byToken = await ctx.db
    .query("users")
    .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", key))
    .first();
  if (byToken) return byToken;
  return null;
}

async function getShopByUser(ctx: DbCtx, user: Doc<"users">) {
  const membership = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
    .first();
  if (membership) {
    return await ctx.db.get(membership.shopId);
  }
  return null;
}

/**
 * 操作対象の店舗を解決する。
 * - shopId 指定あり: その店舗にユーザーが所属しているかを検証して返す（未所属なら null）
 * - shopId 未指定: 先頭の所属店舗にフォールバック（後方互換）
 *
 * 複数店舗に所属するマネージャーが、フロントから操作対象店舗を明示できるようにするための入口。
 */
async function resolveShopForUser(ctx: DbCtx, user: Doc<"users">, shopId?: Id<"shops">) {
  if (!shopId) {
    return await getShopByUser(ctx, user);
  }
  const membership = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_shopId_and_isDeleted", (q) =>
      q.eq("userId", user._id).eq("shopId", shopId).eq("isDeleted", false),
    )
    .first();
  if (!membership) return null;
  return await ctx.db.get(shopId);
}

// Query用: 全フィールド nullable（throw しないため）
type AuthenticatedQueryCtx = {
  identity: UserIdentity | null;
  user: Doc<"users"> | null;
};

type ManagerQueryCtx = {
  user: Doc<"users"> | null;
  shop: Doc<"shops"> | null;
};

// Mutation用: throw 後は non-null が保証される
type AuthenticatedMutationCtx = {
  identity: UserIdentity;
  user: Doc<"users"> | null;
};

type ManagerMutationCtx = {
  user: Doc<"users">;
  shop: Doc<"shops">;
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
    const user = await getUserByIdentity(ctx, identity);
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
    const user = await getUserByIdentity(ctx, identity);
    return { ctx: { identity, user }, args: {} };
  },
});

/**
 * managerQuery / managerMutation
 * - Clerk認証 + users + shops 全て必須
 * - 用途: createRecruitment, addStaffs 等の shop スコープ操作
 */
export const managerQuery = customQuery(query, {
  args: { shopId: v.optional(v.id("shops")) },
  input: async (ctx, { shopId }): Promise<{ ctx: ManagerQueryCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ctx: { user: null, shop: null }, args: {} };
    }
    const user = await getUserByIdentity(ctx, identity);
    const shop = user ? await resolveShopForUser(ctx, user, shopId) : null;
    if (!user || user.isDeleted || !shop || shop.isDeleted) {
      return { ctx: { user: null, shop: null }, args: {} };
    }
    return { ctx: { user, shop }, args: {} };
  },
});

export const managerMutation = customMutation(mutation, {
  args: { shopId: v.optional(v.id("shops")) },
  input: async (ctx, { shopId }): Promise<{ ctx: ManagerMutationCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthenticated");
    }
    const user = await getUserByIdentity(ctx, identity);
    const shop = user ? await resolveShopForUser(ctx, user, shopId) : null;
    if (!user || user.isDeleted || !shop || shop.isDeleted) {
      throw new ConvexError("Not found");
    }
    return { ctx: { user, shop }, args: {} };
  },
});

// ========================================
// スタッフセッション認証（マジックリンク経由）
// ========================================

type StaffSessionQueryCtx = {
  staff: Doc<"staffs"> | null;
  shop: Doc<"shops"> | null;
  session: Doc<"sessions"> | null;
};

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
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
      .first();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < Date.now() ||
      !sessionMatchesAccessKind(session, accessKind)
    ) {
      return { ctx: { staff: null, shop: null, session: null }, args: {} };
    }
    const [staff, shop] = await Promise.all([ctx.db.get(session.staffId), ctx.db.get(session.shopId)]);
    if (!staff || staff.isDeleted || !shop || shop.isDeleted) {
      return { ctx: { staff: null, shop: null, session: null }, args: {} };
    }
    return { ctx: { staff, shop, session }, args: {} };
  },
});

type StaffSessionMutationCtx = {
  staff: Doc<"staffs">;
  shop: Doc<"shops">;
  session: Doc<"sessions">;
};

/**
 * staffSessionMutation
 * - sessionToken でスタッフセッションを検証（mutation版）
 * - 無効/期限切れの場合は ConvexError を throw する
 */
export const staffSessionMutation = customMutation(mutation, {
  args: { sessionToken: v.string(), accessKind: staffAccessKindValidator },
  input: async (
    ctx,
    { sessionToken, accessKind },
  ): Promise<{ ctx: StaffSessionMutationCtx; args: Record<string, never> }> => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", sessionToken))
      .first();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < Date.now() ||
      !sessionMatchesAccessKind(session, accessKind)
    ) {
      throw new ConvexError("Session expired");
    }
    const [staff, shop] = await Promise.all([ctx.db.get(session.staffId), ctx.db.get(session.shopId)]);
    if (!staff || staff.isDeleted || !shop || shop.isDeleted) {
      throw new ConvexError("Not found");
    }
    return { ctx: { staff, shop, session }, args: {} };
  },
});
