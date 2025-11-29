/**
 * 店舗ドメイン - ミューテーション（書き込み操作）
 *
 * 責務:
 * - 店舗のCRUD操作
 * - スタッフ追加・退職処理
 * - 権限チェックを含むビジネスロジック
 */
import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { SHOP_SUBMIT_FREQUENCY, SHOP_TIME_UNIT } from "../constants";
import {
  getStaff,
  getStaffByEmail,
  isValidTimeFormat,
  requireShop,
  requireShopOwner,
  requireUserByAuthId,
} from "../helpers";

// 店舗作成
export const create = mutation({
  args: {
    shopName: v.string(),
    openTime: v.string(),
    closeTime: v.string(),
    timeUnit: v.number(),
    submitFrequency: v.string(),
    description: v.optional(v.string()),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const trimmedShopName = args.shopName.trim();
    const trimmedAuthId = args.authId.trim();

    // バリデーション
    if (!trimmedShopName) {
      throw new ConvexError({ message: "店舗名は必須です", code: "EMPTY_SHOP_NAME" });
    }
    if (!trimmedAuthId) {
      throw new ConvexError({ message: "認証IDは必須です", code: "EMPTY_AUTH_ID" });
    }
    if (!isValidTimeFormat(args.openTime)) {
      throw new ConvexError({ message: "開店時間の形式が不正です", code: "INVALID_TIME_FORMAT" });
    }
    if (!isValidTimeFormat(args.closeTime)) {
      throw new ConvexError({ message: "閉店時間の形式が不正です", code: "INVALID_TIME_FORMAT" });
    }
    if (!SHOP_TIME_UNIT.includes(args.timeUnit as (typeof SHOP_TIME_UNIT)[number])) {
      throw new ConvexError({ message: "シフト時間単位が不正です", code: "INVALID_TIME_UNIT" });
    }
    if (!SHOP_SUBMIT_FREQUENCY.includes(args.submitFrequency as (typeof SHOP_SUBMIT_FREQUENCY)[number])) {
      throw new ConvexError({ message: "シフト提出頻度が不正です", code: "INVALID_SUBMIT_FREQUENCY" });
    }

    // ユーザー存在確認
    await requireUserByAuthId(ctx, trimmedAuthId);

    // 店舗作成
    const shopId = await ctx.db.insert("shops", {
      shopName: trimmedShopName,
      openTime: args.openTime,
      closeTime: args.closeTime,
      timeUnit: args.timeUnit,
      submitFrequency: args.submitFrequency,
      avatar: "",
      description: args.description,
      createdBy: trimmedAuthId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return {
      success: true,
      data: { shopId, shopName: trimmedShopName },
    };
  },
});

// 店舗情報更新（オーナーのみ）
export const update = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
    shopName: v.optional(v.string()),
    openTime: v.optional(v.string()),
    closeTime: v.optional(v.string()),
    timeUnit: v.optional(v.number()),
    submitFrequency: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    await requireShopOwner(ctx, args.shopId, args.authId);

    const fieldsToUpdate: Partial<{
      shopName: string;
      openTime: string;
      closeTime: string;
      timeUnit: number;
      submitFrequency: string;
      description: string;
    }> = {};

    if (args.shopName) fieldsToUpdate.shopName = args.shopName.trim();
    if (args.openTime) fieldsToUpdate.openTime = args.openTime;
    if (args.closeTime) fieldsToUpdate.closeTime = args.closeTime;
    if (args.timeUnit) fieldsToUpdate.timeUnit = args.timeUnit;
    if (args.submitFrequency) fieldsToUpdate.submitFrequency = args.submitFrequency;
    if (args.description !== undefined) fieldsToUpdate.description = args.description;

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({ message: "更新するフィールドがありません", code: "NO_FIELDS_TO_UPDATE" });
    }

    await ctx.db.patch(args.shopId, fieldsToUpdate);

    return args.shopId;
  },
});

// 店舗削除（オーナーのみ）
export const remove = mutation({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    await requireShopOwner(ctx, args.shopId, args.authId);

    await ctx.db.patch(args.shopId, { isDeleted: true });

    return { success: true };
  },
});

// スタッフを店舗に追加（オーナーのみ）
export const addStaff = mutation({
  args: {
    shopId: v.id("shops"),
    email: v.string(),
    displayName: v.string(),
    authId: v.string(),
    skills: v.optional(
      v.array(
        v.object({
          position: v.string(),
          level: v.string(),
        }),
      ),
    ),
    maxWeeklyHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    await requireShopOwner(ctx, args.shopId, args.authId);

    const trimmedEmail = args.email.trim().toLowerCase();
    const trimmedDisplayName = args.displayName.trim();

    if (!trimmedEmail) {
      throw new ConvexError({ message: "メールアドレスは必須です", code: "EMPTY_EMAIL" });
    }
    if (!trimmedDisplayName) {
      throw new ConvexError({ message: "表示名は必須です", code: "EMPTY_DISPLAY_NAME" });
    }

    // 同じ店舗に同じメールアドレスのスタッフがいないかチェック
    const existingStaff = await getStaffByEmail(ctx, args.shopId, trimmedEmail);
    if (existingStaff) {
      throw new ConvexError({ message: "このメールアドレスは既に登録されています", code: "EMAIL_ALREADY_EXISTS" });
    }

    const staffId = await ctx.db.insert("staffs", {
      shopId: args.shopId,
      email: trimmedEmail,
      displayName: trimmedDisplayName,
      status: "pending",
      skills: args.skills,
      maxWeeklyHours: args.maxWeeklyHours,
      invitedBy: args.authId,
      createdAt: Date.now(),
      isDeleted: false,
    });

    return { success: true, staffId };
  },
});

// スタッフを退職処理（オーナーのみ）
export const resignStaff = mutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
    resignationReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireShop(ctx, args.shopId);
    await requireShopOwner(ctx, args.shopId, args.authId);

    const staff = await getStaff(ctx, args.staffId);
    if (!staff || staff.shopId !== args.shopId) {
      throw new ConvexError({ message: "スタッフが見つかりません", code: "STAFF_NOT_FOUND" });
    }

    if (staff.status === "resigned") {
      throw new ConvexError({ message: "このスタッフは既に退職済みです", code: "ALREADY_RESIGNED" });
    }

    await ctx.db.patch(args.staffId, {
      status: "resigned",
      resignedAt: Date.now(),
      resignationReason: args.resignationReason,
    });

    return { success: true };
  },
});

// スタッフ情報更新（オーナーのみ）
export const updateStaffInfo = mutation({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
    displayName: v.optional(v.string()),
    skills: v.optional(
      v.array(
        v.object({
          position: v.string(),
          level: v.string(),
        }),
      ),
    ),
    maxWeeklyHours: v.optional(v.union(v.number(), v.null())),
    memo: v.optional(v.string()),
    workStyleNote: v.optional(v.string()),
    hourlyWage: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireShopOwner(ctx, args.shopId, args.authId);

    const staff = await getStaff(ctx, args.staffId);
    if (!staff || staff.shopId !== args.shopId) {
      throw new ConvexError({ message: "スタッフが見つかりません", code: "STAFF_NOT_FOUND" });
    }

    const fieldsToUpdate: Partial<{
      displayName: string;
      skills: { position: string; level: string }[];
      maxWeeklyHours: number | undefined;
      memo: string;
      workStyleNote: string;
      hourlyWage: number | undefined;
    }> = {};

    if (args.displayName !== undefined) {
      fieldsToUpdate.displayName = args.displayName.trim();
    }
    if (args.skills !== undefined) {
      fieldsToUpdate.skills = args.skills;
    }
    if (args.maxWeeklyHours !== undefined) {
      fieldsToUpdate.maxWeeklyHours = args.maxWeeklyHours ?? undefined;
    }
    if (args.memo !== undefined) {
      fieldsToUpdate.memo = args.memo;
    }
    if (args.workStyleNote !== undefined) {
      fieldsToUpdate.workStyleNote = args.workStyleNote;
    }
    if (args.hourlyWage !== undefined) {
      fieldsToUpdate.hourlyWage = args.hourlyWage ?? undefined;
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      throw new ConvexError({ message: "更新するフィールドがありません", code: "NO_FIELDS_TO_UPDATE" });
    }

    await ctx.db.patch(args.staffId, fieldsToUpdate);

    return { success: true };
  },
});
