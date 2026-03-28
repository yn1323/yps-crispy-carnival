import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../_generated/server";

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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
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
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .first();
    return { ctx: { identity, user }, args: {} };
  },
});

/**
 * managerQuery / managerMutation
 * - Clerk認証 + users + shops 全て必須
 * - 用途: createRecruitment, addStaffs 等の shop スコープ操作
 */
export const managerQuery = customQuery(query, {
  args: {},
  input: async (ctx): Promise<{ ctx: ManagerQueryCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { ctx: { user: null, shop: null }, args: {} };
    }
    const [user, shop] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .first(),
      ctx.db
        .query("shops")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
        .first(),
    ]);
    if (!user || user.isDeleted || !shop || shop.isDeleted) {
      return { ctx: { user: null, shop: null }, args: {} };
    }
    return { ctx: { user, shop }, args: {} };
  },
});

export const managerMutation = customMutation(mutation, {
  args: {},
  input: async (ctx): Promise<{ ctx: ManagerMutationCtx; args: Record<string, never> }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Unauthenticated");
    }
    const [user, shop] = await Promise.all([
      ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .first(),
      ctx.db
        .query("shops")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", identity.subject))
        .first(),
    ]);
    if (!user || user.isDeleted || !shop || shop.isDeleted) {
      throw new ConvexError("Not found");
    }
    return { ctx: { user, shop }, args: {} };
  },
});
