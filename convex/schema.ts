import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  name: v.string(),
  authId: v.string(),
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
  role: v.string(), // owner, manager, general
  createdAt: v.number(),
  isDeleted: v.boolean(),
})
  .index("by_shop", ["shopId"])
  .index("by_user", ["userId"])
  .index("by_shop_and_user", ["shopId", "userId"]);

const schema = defineSchema({
  users,
  posts,
  shops,
  shopUserBelongings,
});

export default schema;
