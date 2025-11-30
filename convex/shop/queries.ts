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
import { getUserByAuthId } from "../helpers";

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

    // ユーザーが所属する店舗を取得（staffsテーブル経由）
    const staffRecords = await ctx.db
      .query("staffs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.and(q.neq(q.field("isDeleted"), true), q.eq(q.field("status"), "active")))
      .collect();

    // 各店舗情報とスタッフ数を取得
    const shopsWithStaffCount = await Promise.all(
      staffRecords.map(async (staffRecord) => {
        const shop = await ctx.db.get(staffRecord.shopId);
        if (!shop || shop.isDeleted) {
          return null;
        }

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

    return shopsWithStaffCount.filter((shop) => shop !== null);
  },
});

// 店舗スタッフ一覧取得
export const listStaffs = query({
  args: {
    shopId: v.id("shops"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
    const staffs = await ctx.db
      .query("staffs")
      .withIndex("by_shop", (q) => q.eq("shopId", args.shopId))
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect();

    // role で isManager を判定（pending状態でも正しくマネージャー判定される）
    const staffsWithRole = staffs.map((staff) => ({
      _id: staff._id,
      email: staff.email,
      displayName: staff.displayName,
      status: staff.status,
      skills: staff.skills ?? [],
      maxWeeklyHours: staff.maxWeeklyHours,
      createdAt: staff.createdAt,
      isManager: staff.role === "manager" || staff.role === "owner",
    }));

    return staffsWithRole;
  },
});

// スタッフ詳細情報取得
export const getStaffInfo = query({
  args: {
    shopId: v.id("shops"),
    staffId: v.id("staffs"),
    authId: v.string(),
  },
  handler: async (ctx, args) => {
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
      isManager: staff.role === "manager" || staff.role === "owner",
    };
  },
});
