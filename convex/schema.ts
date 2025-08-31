import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // 認証システム用のユーザーテーブル
  users: defineTable({
    name: v.string(),
    authId: v.string(),
    hasProfile: v.boolean(),
    createdAt: v.number(),
  }).index("by_auth_id", ["authId"]),

  // 例: 投稿テーブル
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
    createdAt: v.number(),
  }).index("by_author", ["authorId"]),
});
