import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const users = defineTable({
  name: v.string(),
  authId: v.string(),
  createdAt: v.number(),
  isRegistered: v.boolean(),
  isDeleted: v.optional(v.boolean()),
}).index("by_auth_id", ["authId"]);

const posts = defineTable({
  title: v.string(),
  content: v.string(),
  authorId: v.id("users"),
  createdAt: v.number(),
}).index("by_author", ["authorId"]);

const schema = defineSchema({
  users,
  posts,
});

export default schema;
