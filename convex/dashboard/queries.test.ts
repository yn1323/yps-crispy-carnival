import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, testAuthTokenIdentifier } from "../_test/seed";
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
        await seedManagerShop(ctx, { subject: "user_123", shopName: "テスト店舗" });
      });

      const result = await t.withIdentity({ subject: "user_123" }).query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toEqual({
        name: "テスト店舗",
        regularClosedDays: [],
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    });

    it("論理削除された店舗は null を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, { subject: "user_deleted", shopName: "削除済み店舗", shopDeleted: true });
      });

      const result = await t
        .withIdentity({ subject: "user_deleted" })
        .query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toBeNull();
    });

    it("削除済みmembershipでは店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_deleted_membership",
          shopName: "削除済みmembership店舗",
          membershipDeleted: true,
        });
      });

      const result = await t
        .withIdentity({ subject: "user_deleted_membership" })
        .query(api.dashboard.queries.getDashboardShop, {});
      expect(result).toBeNull();
    });

    it("返り値に不要なフィールドが含まれない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await seedManagerShop(ctx, { subject: "user_fields", shopName: "店舗" });
      });

      const result = await t.withIdentity({ subject: "user_fields" }).query(api.dashboard.queries.getDashboardShop, {});
      expect(Object.keys(result ?? {}).sort()).toEqual(["name", "regularClosedDays", "submissionPattern"]);
    });
  });

  describe("getActiveDashboardAnnouncement", () => {
    it("未認証の場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getActiveDashboardAnnouncement, {});
      expect(result).toBeNull();
    });

    it("公開中のお知らせがない場合 null を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("dashboardAnnouncements", {
          title: "下書きのお知らせ",
          bodyHtml: "<p>非公開です。</p>",
          displayDate: "2026-06-17",
          isPublished: false,
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "announcement_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncement, {});
      expect(result).toBeNull();
    });

    it("公開中のお知らせを必要なフィールドだけ返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("dashboardAnnouncements", {
          title: "LINE通知の遅延について",
          bodyHtml: "<p>現在、LINE通知の送信に遅延が発生しています。</p>",
          displayDate: "2026-06-17",
          isPublished: true,
          isDeleted: false,
        });
      });

      const result = await t
        .withIdentity({ subject: "announcement_user" })
        .query(api.dashboard.queries.getActiveDashboardAnnouncement, {});

      expect(result).toMatchObject({
        title: "LINE通知の遅延について",
        bodyHtml: "<p>現在、LINE通知の送信に遅延が発生しています。</p>",
        displayDate: "2026-06-17",
      });
      expect(Object.keys(result ?? {}).sort()).toEqual(["_id", "bodyHtml", "displayDate", "title"]);
    });

    it("非公開と削除済みを除外し、公開中の最新1件だけ返す", async () => {
      const t = convexTest(schema, modules);
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-06-17T09:00:00+09:00"));
        await t.run(async (ctx) => {
          await ctx.db.insert("dashboardAnnouncements", {
            title: "非公開のお知らせ",
            bodyHtml: "<p>表示しません。</p>",
            displayDate: "2026-06-19",
            isPublished: false,
            isDeleted: false,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "削除済みのお知らせ",
            bodyHtml: "<p>表示しません。</p>",
            displayDate: "2026-06-18",
            isPublished: true,
            isDeleted: true,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "前日のお知らせ",
            bodyHtml: "<p>古いお知らせです。</p>",
            displayDate: "2026-06-16",
            isPublished: true,
            isDeleted: false,
          });
          await ctx.db.insert("dashboardAnnouncements", {
            title: "同日の先に作ったお知らせ",
            bodyHtml: "<p>同日内では古いお知らせです。</p>",
            displayDate: "2026-06-17",
            isPublished: true,
            isDeleted: false,
          });
        });

        vi.setSystemTime(new Date("2026-06-17T09:00:01+09:00"));
        await t.run(async (ctx) => {
          await ctx.db.insert("dashboardAnnouncements", {
            title: "同日の後に作ったお知らせ",
            bodyHtml: "<p>同日内で最新のお知らせです。</p>",
            displayDate: "2026-06-17",
            isPublished: true,
            isDeleted: false,
          });
        });

        const result = await t
          .withIdentity({ subject: "announcement_user" })
          .query(api.dashboard.queries.getActiveDashboardAnnouncement, {});

        expect(result?.title).toBe("同日の後に作ったお知らせ");
      } finally {
        vi.useRealTimers();
      }
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
        const seeded = await seedManagerShop(ctx, { subject: "user_rec", email: "m@example.com", shopName: "店舗" });
        return seeded.shopId;
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
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });

      const result = await t
        .withIdentity({ subject: "user_rec" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);

      expect(result.page).toHaveLength(1);
      expect(result.page[0].status).toBe("open");
      expect(result.page[0].responseCount).toBe(0);
      expect(result.page[0].totalStaffCount).toBe(1);
    });

    it("論理削除された募集は除外する", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_rec_deleted",
          email: "deleted-rec@example.com",
          shopName: "店舗",
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-07",
          deadline: "2026-04-28",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: true,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });

      const result = await t
        .withIdentity({ subject: "user_rec_deleted" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);

      expect(result.page).toHaveLength(1);
      expect(result.page[0].periodStart).toBe("2026-04-01");
      expect(Object.keys(result.page[0]).sort()).toEqual([
        "_id",
        "confirmedAt",
        "createdAt",
        "deadline",
        "periodEnd",
        "periodStart",
        "responseCount",
        "shopClosedDates",
        "status",
        "totalStaffCount",
      ]);
    });

    it("募集をシフト開始日の降順で返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_rec_period_order",
          email: "period-order@example.com",
          shopName: "店舗",
        });
        for (const periodStart of ["2026-06-01", "2026-08-01", "2026-07-01"]) {
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart,
            periodEnd: periodStart.replace(/-\d{2}$/, "-15"),
            deadline: "2026-05-20",
            shopClosedDates: [],
            status: "open",
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        }
      });

      const result = await t
        .withIdentity({ subject: "user_rec_period_order" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);

      expect(result.page.map((recruitment) => recruitment.periodStart)).toEqual([
        "2026-08-01",
        "2026-07-01",
        "2026-06-01",
      ]);
      expect(result.page[0].createdAt).toBeTypeOf("number");
      expect(result.page[0].confirmedAt).toBeNull();
    });

    it("現在のシフトだけを終了日が近い順に返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_current_rec",
            email: "current-rec@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-06-01",
            shopClosedDates: [],
            status: "confirmed" as const,
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-10",
            periodEnd: "2026-06-20",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-31",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-31",
          });
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart: "2026-06-05",
            periodEnd: "2026-06-25",
            deadline: "2026-06-01",
            shopClosedDates: [],
            status: "open",
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        });

        const result = await t
          .withIdentity({ subject: "user_current_rec" })
          .query(api.dashboard.queries.getDashboardCurrentRecruitments, {});

        expect(result.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-06-20", "2026-06-30"]);
        expect(result.every((recruitment) => recruitment.status === "confirmed")).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("recruitmentStats がない古い募集では responseCount は shiftSubmissions の件数を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_rc",
          email: "rc@example.com",
          shopName: "RC店舗",
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
        await ctx.db.insert("staffs", {
          shopId,
          name: "Deleted Staff",
          email: "deleted@example.com",
          isDeleted: true,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const submission1 = await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: staff1,
          submittedAt: Date.now(),
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission1,
          recruitmentId,
          staffId: staff1,
          date: "2026-04-01",
          startTime: "09:00",
          endTime: "17:00",
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission1,
          recruitmentId,
          staffId: staff1,
          date: "2026-04-02",
          startTime: "09:00",
          endTime: "17:00",
        });
        const submission2 = await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: staff2,
          submittedAt: Date.now(),
        });
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId: submission2,
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
      expect(result.page[0].totalStaffCount).toBe(2);
    });

    it("recruitmentStats がある場合も totalStaffCount は現在の有効スタッフ数を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_stats",
          email: "stats@example.com",
          shopName: "Stats店舗",
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff1",
          email: "s1@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff2",
          email: "s2@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Staff3",
          email: "s3@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "Deleted Staff",
          email: "deleted@example.com",
          isDeleted: true,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-04-01",
          periodEnd: "2026-04-07",
          deadline: "2026-03-28",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitmentStats", {
          recruitmentId,
          shopId,
          submittedCount: 2,
          activeStaffCountSnapshot: 1,
          updatedAt: Date.now(),
        });
      });

      const result = await t
        .withIdentity({ subject: "user_stats" })
        .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      expect(result.page[0].responseCount).toBe(2);
      expect(result.page[0].totalStaffCount).toBe(3);
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
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_staff",
          email: "m@example.com",
          shopName: "店舗",
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
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_sf",
          email: "m@example.com",
          shopName: "店舗",
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
      expect(Object.keys(result.page[0]).sort()).toEqual([
        "_id",
        "email",
        "isLineFollowing",
        "isLineLinked",
        "isManager",
        "name",
      ]);
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
          authTokenIdentifier: testAuthTokenIdentifier("existing_user"),
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
