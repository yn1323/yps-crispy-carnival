/**
 * 必要人員設定 - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 必要人員設定の保存・更新
 * - AI入力情報の保存
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { requireShop } from "../helpers";

// 必要人員設定を保存・更新（曜日単位）
export const upsert = mutation({
  args: {
    shopId: v.id("shops"),
    dayOfWeek: v.number(), // 0=日, 1=月, ..., 6=土, 7=祝
    staffing: v.array(
      v.object({
        hour: v.number(),
        position: v.string(),
        requiredCount: v.number(),
      }),
    ),
    aiInput: v.optional(
      v.object({
        shopType: v.string(),
        customerCount: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    // バリデーション
    if (args.dayOfWeek < 0 || args.dayOfWeek > 7) {
      throw new ConvexError({ message: "曜日の値が不正です", code: "INVALID_DAY_OF_WEEK" });
    }

    // 既存データを検索
    const existing = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect()
      .then((list) => list.find((s) => s.dayOfWeek === args.dayOfWeek));

    const now = Date.now();

    if (existing) {
      // 更新
      await ctx.db.patch(existing._id, {
        staffing: args.staffing,
        aiInput: args.aiInput,
        updatedAt: now,
      });
      return { success: true, id: existing._id, isNew: false };
    }

    // 新規作成
    const id = await ctx.db.insert("requiredStaffing", {
      shopId: args.shopId,
      dayOfWeek: args.dayOfWeek,
      staffing: args.staffing,
      aiInput: args.aiInput,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, id, isNew: true };
  },
});

// 複数曜日に一括で設定をコピー
export const copyToMultipleDays = mutation({
  args: {
    shopId: v.id("shops"),
    sourceDayOfWeek: v.number(),
    targetDaysOfWeek: v.array(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    // コピー元の設定を取得
    const sourceList = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();

    const source = sourceList.find((s) => s.dayOfWeek === args.sourceDayOfWeek);

    if (!source) {
      throw new ConvexError({ message: "コピー元の設定が見つかりません", code: "SOURCE_NOT_FOUND" });
    }

    const now = Date.now();
    const results: { dayOfWeek: number; id: string }[] = [];

    for (const targetDay of args.targetDaysOfWeek) {
      if (targetDay === args.sourceDayOfWeek) continue; // 同じ曜日はスキップ

      const existing = sourceList.find((s) => s.dayOfWeek === targetDay);

      if (existing) {
        await ctx.db.patch(existing._id, {
          staffing: source.staffing,
          peakBands: source.peakBands,
          minimumStaff: source.minimumStaff,
          updatedAt: now,
        });
        results.push({ dayOfWeek: targetDay, id: existing._id });
      } else {
        const id = await ctx.db.insert("requiredStaffing", {
          shopId: args.shopId,
          dayOfWeek: targetDay,
          staffing: source.staffing,
          peakBands: source.peakBands,
          minimumStaff: source.minimumStaff,
          aiInput: source.aiInput,
          createdAt: now,
          updatedAt: now,
        });
        results.push({ dayOfWeek: targetDay, id });
      }
    }

    return { success: true, copiedDays: results };
  },
});

// ピーク帯設定を保存・更新（曜日単位）
export const upsertPeakBands = mutation({
  args: {
    shopId: v.id("shops"),
    dayOfWeek: v.number(),
    peakBands: v.array(
      v.object({
        startTime: v.string(),
        endTime: v.string(),
        requiredCount: v.number(),
      }),
    ),
    minimumStaff: v.number(),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    if (args.dayOfWeek < 0 || args.dayOfWeek > 7) {
      throw new ConvexError({ message: "曜日の値が不正です", code: "INVALID_DAY_OF_WEEK" });
    }

    const existing = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect()
      .then((list) => list.find((s) => s.dayOfWeek === args.dayOfWeek));

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        peakBands: args.peakBands,
        minimumStaff: args.minimumStaff,
        updatedAt: now,
      });
      return { success: true, id: existing._id, isNew: false };
    }

    const id = await ctx.db.insert("requiredStaffing", {
      shopId: args.shopId,
      dayOfWeek: args.dayOfWeek,
      staffing: [],
      peakBands: args.peakBands,
      minimumStaff: args.minimumStaff,
      createdAt: now,
      updatedAt: now,
    });

    return { success: true, id, isNew: true };
  },
});

// 全曜日分をまとめて保存（初回設定用）
export const saveAll = mutation({
  args: {
    shopId: v.id("shops"),
    settings: v.array(
      v.object({
        dayOfWeek: v.number(),
        staffing: v.array(
          v.object({
            hour: v.number(),
            position: v.string(),
            requiredCount: v.number(),
          }),
        ),
      }),
    ),
    aiInput: v.optional(
      v.object({
        shopType: v.string(),
        customerCount: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);

    const now = Date.now();

    // 既存データを取得
    const existingList = await ctx.db
      .query("requiredStaffing")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .collect();

    const existingMap = new Map(existingList.map((s) => [s.dayOfWeek, s]));

    for (const setting of args.settings) {
      const existing = existingMap.get(setting.dayOfWeek);

      if (existing) {
        await ctx.db.patch(existing._id, {
          staffing: setting.staffing,
          aiInput: args.aiInput,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("requiredStaffing", {
          shopId: args.shopId,
          dayOfWeek: setting.dayOfWeek,
          staffing: setting.staffing,
          aiInput: args.aiInput,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return { success: true };
  },
});
