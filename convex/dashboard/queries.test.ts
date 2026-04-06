import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("dashboard/queries", () => {
  describe("getDashboardData", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getDashboardData, {});
      expect(result).toBeNull();
    });

    it("認証済みだが店舗未登録の場合 shop: null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardData, {});
      expect(result).toEqual({ shop: null, recruitments: [], staffs: [] });
    });

    it("店舗登録済みの場合、店舗情報・募集・スタッフを返す", async () => {
      const t = convexTest(schema, modules);

      // データセットアップ
      const shopId = await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_123",
          name: "テスト管理者",
          email: "test@example.com",
          role: "manager",
          isDeleted: false,
        });
        const id = await ctx.db.insert("shops", {
          name: "テスト店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_123",
          isDeleted: false,
        });
        return id;
      });

      await t.run(async (ctx) => {
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
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          status: "open",
          isDeleted: false,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-03-01",
          periodEnd: "2026-03-07",
          deadline: "2026-02-25",
          status: "confirmed",
          isDeleted: true,
        });
      });

      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardData, {});

      expect(result?.shop).toEqual({ name: "テスト店舗" });
      expect(result?.recruitments).toHaveLength(1);
      expect(result?.recruitments[0].status).toBe("open");
      expect(result?.recruitments[0].responseCount).toBe(0);
      expect(result?.recruitments[0].totalStaffCount).toBe(1);
      expect(result?.staffs).toHaveLength(1);
      expect(result?.staffs[0].name).toBe("田中太郎");
    });

    it("論理削除された店舗は shop: null を返す", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_deleted",
          name: "削除店舗",
          email: "del@example.com",
          role: "manager",
          isDeleted: false,
        });
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
        .query(api.dashboard.queries.getDashboardData, {});
      expect(result).toEqual({ shop: null, recruitments: [], staffs: [] });
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
        // staff1 が2日分提出
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
        // staff2 が1日分提出
        await ctx.db.insert("shiftRequests", {
          recruitmentId,
          staffId: staff2,
          date: "2026-04-01",
          startTime: "10:00",
          endTime: "18:00",
        });
      });

      const result = await t.withIdentity({ subject: "user_rc" }).query(api.dashboard.queries.getDashboardData, {});
      expect(result?.recruitments[0].responseCount).toBe(2);
      expect(result?.recruitments[0].totalStaffCount).toBe(2);
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);

      await t.run(async (ctx) => {
        await ctx.db.insert("users", {
          clerkId: "user_fields",
          name: "管理者",
          email: "m@example.com",
          role: "manager",
          isDeleted: false,
        });
        const shopId = await ctx.db.insert("shops", {
          name: "店舗",
          shiftStartTime: "09:00",
          shiftEndTime: "22:00",
          ownerId: "user_fields",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "スタッフ",
          email: "staff@example.com",
          isDeleted: false,
        });
      });

      const result = await t.withIdentity({ subject: "user_fields" }).query(api.dashboard.queries.getDashboardData, {});
      expect(result).not.toBeNull();
      // shop に shiftStartTime 等が漏れていないこと
      expect(Object.keys(result?.shop ?? {})).toEqual(["name"]);
      // staffs に shopId, isDeleted が漏れていないこと
      expect(Object.keys(result?.staffs[0] ?? {}).sort()).toEqual(["_id", "email", "isOwner", "name"]);
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
