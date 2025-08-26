import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ユーザー関連のクエリ・ミューテーション
export const getUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

export const getUserByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const createUser = mutation({
  args: {
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      createdAt: Date.now(),
    });
    return userId;
  },
});

// 投稿関連のクエリ・ミューテーション
export const getPosts = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("posts").collect();
  },
});

export const getPostsByAuthor = query({
  args: { authorId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("posts")
      .withIndex("by_author", (q) => q.eq("authorId", args.authorId))
      .collect();
  },
});

export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    authorId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const postId = await ctx.db.insert("posts", {
      title: args.title,
      content: args.content,
      authorId: args.authorId,
      createdAt: Date.now(),
    });
    return postId;
  },
});
