/**
 * ユーザードメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 管理者ユーザー情報の取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getUserByAuthId as getUserByAuthIdHelper } from "../helpers";

// authIdでユーザー取得
export const getByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    return await getUserByAuthIdHelper(ctx, args.authId);
  },
});

// すべてのユーザー取得（管理用）
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("users")
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .order("desc")
      .collect();
  },
});

// ユーザーIDで取得
export const getById = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || user.isDeleted) {
      return null;
    }
    return user;
  },
});
