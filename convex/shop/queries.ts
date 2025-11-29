/**
 * 店舗ドメイン - クエリ（読み取り操作）
 *
 * 責務:
 * - 店舗情報の取得
 * - 店舗一覧の取得
 * - スタッフ一覧の取得
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { getUserByAuthId, isShopOwner } from "../helpers";

// 店舗IDで取得（単純なCRUD）
export const getById = query({
  args: { shopId: v.id("shops") },
  handler: async (ctx, args) => {
    const shop = await ctx.db.get(args.shopId);
    if (!shop || shop.isDeleted) {
      return null;
    }
    return shop;
  },
});

// authIdで所有店舗一覧取得（スタッフ人数付き）
export const listByAuthId = query({
  args: { authId: v.string() },
  handler: async (ctx, args) => {
    const user = await getUserByAuthId(ctx, args.authId);

    if (!user) {
      return [];
    }

    // ユーザーが作成した店舗を取得
    const shops = await ctx.db
      .query("shops")
      .withIndex("by_created_by", (q) => q.eq("createdBy", args.authId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // 各店舗のスタッフ数を取得
    const shopsWithStaffCount = await Promise.all(
      shops.map(async (shop) => {
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_shop", (q) => q.eq("shopId", shop._id))
          .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.neq(q.field("status"), "resigned")))
          .collect();

        return {
          ...shop,
          staffCount: staffs.length,
        };
      }),
    );

    return shopsWithStaffCount;
  },
});

// 店舗スタッフ一覧取得
export const listStaffs = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // オーナーのみスタッフ一覧を閲覧可能
    const ownerCheck = await isShopOwner(ctx, args.shopId, args.authId);
    if (!ownerCheck) {
      return [];
    }

    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // userId の有無で isManager を判定
    const staffsWithRole = staffs.map((staff) => ({
      _id: staff._id,
      email: staff.email,
      displayName: staff.displayName,
      status: staff.status,
      skills: staff.skills ?? [],
      maxWeeklyHours: staff.maxWeeklyHours,
      createdAt: staff.createdAt,
      isManager: !!staff.userId,
    }));

    return staffsWithRole;
  },
});

// スタッフ詳細情報取得（オーナーのみ）
export const getStaffInfo = query({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    // オーナーのみ閲覧可能
    const ownerCheck = await isShopOwner(ctx, args.shopId, args.authId);
    if (!ownerCheck) {
      return null;
    }

    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.isDeleted || staff.shopId !== args.shopId) {
      return null;
    }

    return {
      _id: staff._id,
      email: staff.email,
      displayName: staff.displayName,
      status: staff.status,
      skills: staff.skills ?? [],
      maxWeeklyHours: staff.maxWeeklyHours,
      memo: staff.memo ?? "",
      workStyleNote: staff.workStyleNote ?? "",
      hourlyWage: staff.hourlyWage ?? null,
      resignedAt: staff.resignedAt,
      resignationReason: staff.resignationReason,
      createdAt: staff.createdAt,
    };
  },
});
