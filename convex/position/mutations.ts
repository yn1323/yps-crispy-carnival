/**
 * ポジションドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - ポジションの追加・更新・削除
 * - 店舗作成時のデフォルトポジション初期化
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { DEFAULT_POSITIONS, POSITION_COLORS, SKILL_LEVELS } from "../constants";
import { requireShop } from "../helpers";

// ポジション作成
export const create = mutation({
  args: {
    shopId: v.id("shops"),
    name: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({ message: "ポジション名は必須です", code: "EMPTY_NAME" });
    }

    // 重複チェック
    const existing = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop_and_name", (q) => q.eq("shopId", args.shopId).eq("name", trimmedName))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .first();

    if (existing) {
      throw new ConvexError({ message: "同じ名前のポジションが既に存在します", code: "DUPLICATE_NAME" });
    }

    // 最大orderを取得
    const positions = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    const maxOrder = positions.length > 0 ? Math.max(...positions.map((p) => p.order)) : -1;

    const positionId = await ctx.db.insert("shopPositions", {
      shopId: args.shopId,
      name: trimmedName,
      color: POSITION_COLORS[(maxOrder + 1) % POSITION_COLORS.length],
      order: maxOrder + 1,
      isDeleted: false,
      createdAt: Date.now(),
    });

    return { success: true, positionId };
  },
});

// ポジション名更新
export const updateName = mutation({
  args: {
    positionId: v.id("shopPositions"),
    name: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position || position.isDeleted) {
      throw new ConvexError({ message: "ポジションが見つかりません", code: "NOT_FOUND" });
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({ message: "ポジション名は必須です", code: "EMPTY_NAME" });
    }

    // 重複チェック（自分以外）
    const existing = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop_and_name", (q) => q.eq("shopId", position.shopId).eq("name", trimmedName))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("_id"), args.positionId)))
      .first();

    if (existing) {
      throw new ConvexError({ message: "同じ名前のポジションが既に存在します", code: "DUPLICATE_NAME" });
    }

    await ctx.db.patch(args.positionId, { name: trimmedName });

    return { success: true };
  },
});

// ポジションカラー更新
export const updateColor = mutation({
  args: {
    positionId: v.id("shopPositions"),
    color: v.string(),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position || position.isDeleted) {
      throw new ConvexError({ message: "ポジションが見つかりません", code: "NOT_FOUND" });
    }

    await ctx.db.patch(args.positionId, { color: args.color });

    return { success: true };
  },
});

// ポジション削除（論理削除）
export const remove = mutation({
  args: {
    positionId: v.id("shopPositions"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const position = await ctx.db.get(args.positionId);
    if (!position || position.isDeleted) {
      throw new ConvexError({ message: "ポジションが見つかりません", code: "NOT_FOUND" });
    }

    // このポジションに紐づくスキルも論理削除
    const skills = await ctx.db
      .query("staffSkills")
      .withIndex("by_position", (q) => q.eq("positionId", args.positionId))
      .collect();

    for (const skill of skills) {
      await ctx.db.delete(skill._id);
    }

    await ctx.db.patch(args.positionId, { isDeleted: true });

    return { success: true };
  },
});

// ポジションの並び順更新
export const updateOrder = mutation({
  args: {
    positionIds: v.array(v.id("shopPositions")),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    for (let i = 0; i < args.positionIds.length; i++) {
      await ctx.db.patch(args.positionIds[i], { order: i });
    }

    return { success: true };
  },
});

// 店舗作成時にデフォルトポジションを初期化
export const initializeDefaultPositions = mutation({
  args: {
    shopId: v.id("shops"),
  },
  handler: async (ctx, args) => {
    const positionIds: string[] = [];

    for (let i = 0; i < DEFAULT_POSITIONS.length; i++) {
      const positionId = await ctx.db.insert("shopPositions", {
        shopId: args.shopId,
        name: DEFAULT_POSITIONS[i],
        color: POSITION_COLORS[i % POSITION_COLORS.length],
        order: i,
        isDeleted: false,
        createdAt: Date.now(),
      });
      positionIds.push(positionId);
    }

    return { success: true, positionIds };
  },
});

// スタッフ追加時に全ポジションを「未経験」で初期化
export const initializeStaffSkills = mutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
    const positions = await ctx.db
      .query("shopPositions")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    for (const position of positions) {
      await ctx.db.insert("staffSkills", {
        staffId: args.staffId,
        positionId: position._id,
        level: SKILL_LEVELS[0], // "未経験"
        updatedAt: Date.now(),
      });
    }

    return { success: true };
  },
});
