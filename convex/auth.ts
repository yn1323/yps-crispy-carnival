import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ユーザープロフィール型定義
export type UserProfile = {
  _id: string;
  name: string;
  authId: string;
  hasProfile: boolean;
  createdAt: number;
};

// AuthIDでユーザーを取得
export const getUserByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }

    return await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .unique();
  },
});

// プロフィール作成（初回登録）
export const createProfile = mutation({
  args: {
    name: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    // 既存ユーザーチェック
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_auth_id", (q) => q.eq("authId", args.authId))
      .unique();

    if (existingUser) {
      throw new Error("User already exists");
    }

    const userId = await ctx.db.insert("users", {
      name: args.name,
      authId: args.authId,
      hasProfile: true,
      createdAt: Date.now(),
    });

    return userId;
  },
});

// プロフィール更新
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Not authenticated");
    }

    await ctx.db.patch(args.userId, {
      name: args.name,
      hasProfile: true,
    });

    return args.userId;
  },
});
