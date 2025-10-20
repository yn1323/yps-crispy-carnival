import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  name: v.string(),
  authId: v.optional(v.string()), // 仮登録時はundefined
  createdAt: v.number(),
  isDeleted: v.optional(v.boolean()),
  isActivated: v.optional(v.boolean()), // 本登録済みかどうか
}).index("by_auth_id", ["authId"]);

const posts = defineTable({
  title: v.string(),
  content: v.string(),
  authorId: v.id("users"),
  createdAt: v.number(),
}).index("by_author", ["authorId"]);

const shops = defineTable({
  shopName: v.string(),
  openTime: v.string(),
  closeTime: v.string(),
  timeUnit: v.number(),
  submitFrequency: v.string(),
  avatar: v.optional(v.string()),
  useTimeCard: v.boolean(),
  description: v.optional(v.string()),
  createdBy: v.string(),
  createdAt: v.number(),
  isDeleted: v.boolean(),
}).index("by_created_by", ["createdBy"]);

const shopUserBelongings = defineTable({
  shopId: v.id("shops"),
  userId: v.id("users"),
  role: v.string(), // owner, manager, staff
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_user", ["userId"])
  .index("by_shop_and_user", ["shopId", "userId"]);

const inviteTokens = defineTable({
  token: v.string(),
  shopId: v.id("shops"),
  tempUserId: v.id("users"), // 仮登録ユーザー
  role: v.string(), // "manager" | "staff"
  status: v.string(), // "active" | "used" | "cancelled" | "expired"
  createdAt: v.number(),
  expiresAt: v.number(), // 作成日+30日
  usedAt: v.optional(v.number()),
  createdBy: v.string(), // authId
})
  .index("by_token", ["token"])
  .index("by_shop", ["shopId"])
  .index("by_temp_user", ["tempUserId"]);

const schema = defineSchema({
  users,
  posts,
  shops,
  shopUserBelongings,
  inviteTokens,
});

export default schema;
