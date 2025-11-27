import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  name: v.string(),
  authId: v.optional(v.string()),
  status: v.string(), // "pending" | "active"
  createdAt: v.number(),
  isDeleted: v.optional(v.boolean()),
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
  displayName: v.string(),
  role: v.string(), // owner, manager, staff
  status: v.string(), // "pending" | "active" | "resigned"
  inviteToken: v.optional(v.string()),
  inviteExpiresAt: v.optional(v.number()),
  invitedBy: v.optional(v.id("users")),
  resignedAt: v.optional(v.number()),
  resignationReason: v.optional(v.string()),
  // スタッフ管理用フィールド（owner/managerのみ閲覧・編集可能）
  memo: v.optional(v.string()), // スタッフメモ（管理者用）
  workStyleNote: v.optional(v.string()), // 働き方メモ（AIシフト作成用）
  maxWorkingHoursPerMonth: v.optional(v.number()), // 最大勤務時間/月
  hourlyWage: v.optional(v.number()), // 時給
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_user", ["userId"])
  .index("by_shop_and_user", ["shopId", "userId"])
  .index("by_invite_token", ["inviteToken"]);

const schema = defineSchema({
  users,
  posts,
  shops,
  shopUserBelongings,
});

export default schema;
