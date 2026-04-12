import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

const PAGINATION_FIRST_PAGE = { paginationOpts: { numItems: 10, cursor: null } };

describe("dashboard/queries", () => {
  describe("getDashboardShop", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toBeNull();
    });

    it("認証済みだが店舗未登録の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toBeNull();
    });

    it("店舗登録済みの場合、店舗情報を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_123",
          isDeleted: false,
        });
      });

      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toEqual({ name: "テスト店舗", shiftStartTime: "09:00", shiftEndTime: "22:00" });
    });

    it("論理削除された店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("shops", {
          name: "削除済み店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_deleted",
          isDeleted: true,
        });
      });

      const result = await t
        .withIdentity({ subject: "user_deleted" })
        .query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toBeNull();
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("shops", {
          name: "店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_fields",
          isDeleted: false,
        });
      });

      const result = await t.withIdentity({ subject: "user_fields" }).query(api.dashboard.queries.getDashboardShop, {});
      expect(Object.keys(result ?? {}).sort()).toEqual(["name", "shiftEndTime", "shiftStartTime"]);
    });
  });

  describe("getDashboardRecruitments", () => {
    it("未認証の場合、エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE)).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("募集をページネーションで返す", async () => {
      const t = convexTest(schema, modules);
      const shopId = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_rec",
          name: "管理者",
          email: "m@example.com",
          role: "manager",
          isDeleted: false,
        });
        const id = await ctx.db.insert("shops", {
          name: "店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_rec",
          isDeleted: false,
        });
        return id;
      });

      await t.run(async (ctx) => {
        await ctx.db.insert("staffs", {
          shopId,
          name: "スタッフ1",
          email: "s1@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          status: "open",
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "user_rec" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);

      expect(result.page).toHaveLength(1);
      expect(result.page[0].status).toBe("open");
      expect(result.page[0].responseCount).toBe(0);
    });

    it("responseCount は shiftRequests の staffId ユニーク数を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_rc",
          name: "RC管理者",
          email: "rc@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "RC店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_rc",
          isDeleted: false,
        });
        const staff1 = await ctx.db.insert("staffs", {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
          isDeleted: false,
        });
        const staff2 = await ctx.db.insert("staffs", {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          status: "open",
          isDeleted: false,
        });
        await ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId: staff1,
          date: "2026-04-01",
          startTime: "09:00",
          endTime: "17:00",
        });
        await ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId: staff1,
          date: "2026-04-02",
          startTime: "09:00",
          endTime: "17:00",
        });
        await ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId: staff2,
          date: "2026-04-01",
          startTime: "10:00",
          endTime: "18:00",
        });
      });

      const result = await t
        .withIdentity({ subject: "user_rc" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      expect(result.page[0].responseCount).toBe(2);
    });
  });

  describe("getDashboardStaffs", () => {
    it("未認証の場合、エラーをthrowする", async () => {
      const t = convexTest(schema, modules);
      await expect(t.query(api.dashboard.queries.getDashboardStaffs, PAGINATION_FIRST_PAGE)).rejects.toThrow(
        "Unauthenticated",
      );
    });

    it("認証済みだが店舗未登録の場合、空ページを返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t
        .withIdentity({ subject: "user_no_shop" })
        .query(api.dashboard.queries.getDashboardStaffs, PAGINATION_FIRST_PAGE);
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    });

    it("スタッフをページネーションで返し、削除済みは除外される", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_staff",
          name: "管理者",
          email: "m@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_staff",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "削除済みスタッフ",
          email: "deleted@example.com",
          isDeleted: true,
        });
      });

      const result = await t
        .withIdentity({ subject: "user_staff" })
        .query(api.dashboard.queries.getDashboardStaffs, PAGINATION_FIRST_PAGE);

      expect(result.page).toHaveLength(1);
      expect(result.page[0].name).toBe("田中太郎");
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_sf",
          name: "管理者",
          email: "m@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_sf",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "スタッフ",
          email: "staff@example.com",
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "user_sf" })
        .query(api.dashboard.queries.getDashboardStaffs, PAGINATION_FIRST_PAGE);
      expect(Object.keys(result.page[0]).sort()).toEqual(["_id", "email", "isOwner", "name"]);
    });
  });

  describe("getCurrentUser", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toBeNull();
    });

    it("新規ユーザーは isNewUser: true を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t
        .withIdentity({ subject: "new_user", name: "New User", email: "new@example.com" })
        .query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toEqual({ isNewUser: true, name: "New User", email: "new@example.com" });
    });

    it("既存ユーザーは isNewUser: false を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "existing_user",
          name: "既存ユーザー",
          email: "existing@example.com",
          role: "manager",
          isDeleted: false,
        });
      });
      const result = await t.withIdentity({ subject: "existing_user" }).query(api.dashboard.queries.getCurrentUser, {});
      expect(result).toEqual({ isNewUser: false, name: "既存ユーザー", email: "existing@example.com" });
    });
  });
});
