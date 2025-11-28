/**
 * ユーザードメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - ユーザーのCRUD操作
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";

// ユーザー作成
export const create = mutation({
  args: {
    name: v.string(),
    authId: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.name.trim()) {
      throw new ConvexError({
        message: "名前は必須です",
        code: "EMPTY_NAME",
      });
    }

    // authIdがある場合は本登録、なければ仮登録
    const status = args.status ?? (args.authId ? "active" : "pending");

    const userId = await ctx.db.insert("users", {
      name: args.name.trim(),
      authId: args.authId,
      status,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return {
      success: true,
      data: { userId, authId: args.authId, name: args.name.trim(), status },
    };
  },
});

// ユーザー情報更新
export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;

    const existingUser = await ctx.db.get(id);
    if (!existingUser || existingUser.isDeleted) {
      throw new ConvexError({
        message: "指定されたユーザーが見つかりません",
        code: "USER_NOT_FOUND",
      });
    }

    if (!updates?.name?.trim()) {
      throw new ConvexError({
        message: "名前は空にできません",
        code: "EMPTY_NAME",
      });
    }

    const fieldsToUpdate: Partial<{ name: string }> = {};
    if (updates.name) {
      fieldsToUpdate.name = updates.name.trim();
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({
        message: "更新するフィールドがありません",
        code: "NO_FIELDS_TO_UPDATE",
      });
    }

    await ctx.db.patch(id, fieldsToUpdate);
    return id;
  },
});
