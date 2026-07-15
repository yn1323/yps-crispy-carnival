import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedShop, seedShopMembership, seedUser, testAuthTokenIdentifier } from "../_test/seed";
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

    it("先頭の所属店舗が削除済みの場合、次の有効店舗を返す", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "user_deleted_first");
        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId });

        const activeShopId = await seedShop(ctx, "残っている店舗");
        await seedShopMembership(ctx, { userId, shopId: activeShopId });
      });

      const result = await t
        .withIdentity({ subject: "user_deleted_first" })
        .query(api.dashboard.queries.getDashboardShop, {});

      expect(result?.name).toBe("残っている店舗");
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

    it("論理削除済みユーザーには所属店舗情報を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { userId } = await seedManagerShop(ctx, {
          subject: "deleted_dashboard_user",
          shopName: "削除ユーザー所属店舗",
        });
        await ctx.db.patch(userId, { isDeleted: true });
      });

      await expect(
        t.withIdentity({ subject: "deleted_dashboard_user" }).query(api.dashboard.queries.getDashboardShop, {}),
      ).resolves.toBeNull();
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

  describe("getMyShops", () => {
    it("未認証またはユーザー未登録の場合は空配列を返す", async () => {
      const unauthenticated = convexTest(schema, modules);
      const unregistered = convexTest(schema, modules);

      await expect(unauthenticated.query(api.dashboard.queries.getMyShops, {})).resolves.toEqual([]);
      await expect(
        unregistered.withIdentity({ subject: "unregistered_user" }).query(api.dashboard.queries.getMyShops, {}),
      ).resolves.toEqual([]);
    });

    it("本人の有効な所属店舗だけを最小DTOで返す", async () => {
      const t = convexTest(schema, modules);
      const { activeShopIds } = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "multi_shop_user");
        const firstShopId = await seedShop(ctx, "有効店舗A");
        const secondShopId = await seedShop(ctx, "有効店舗B");
        await seedShopMembership(ctx, { userId, shopId: firstShopId });
        await seedShopMembership(ctx, { userId, shopId: secondShopId });

        const deletedShopId = await seedShop(ctx, "削除済み店舗");
        await ctx.db.patch(deletedShopId, { isDeleted: true });
        await seedShopMembership(ctx, { userId, shopId: deletedShopId });

        const deletedMembershipShopId = await seedShop(ctx, "所属解除済み店舗");
        await seedShopMembership(ctx, {
          userId,
          shopId: deletedMembershipShopId,
          isDeleted: true,
        });

        const otherUserId = await seedUser(ctx, "other_shop_user");
        const otherShopId = await seedShop(ctx, "他ユーザーの店舗");
        await seedShopMembership(ctx, { userId: otherUserId, shopId: otherShopId });

        return { activeShopIds: [firstShopId, secondShopId] };
      });

      const result = await t.withIdentity({ subject: "multi_shop_user" }).query(api.dashboard.queries.getMyShops, {});

      expect([...result].sort((a, b) => a.shopName.localeCompare(b.shopName, "ja"))).toEqual([
        { shopId: activeShopIds[0], shopName: "有効店舗A" },
        { shopId: activeShopIds[1], shopName: "有効店舗B" },
      ]);
    });

    it("論理削除済みユーザーの場合は所属店舗を返さない", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        const { userId } = await seedManagerShop(ctx, {
          subject: "deleted_user",
          shopName: "所属店舗",
        });
        await ctx.db.patch(userId, { isDeleted: true });
      });

      const result = await t.withIdentity({ subject: "deleted_user" }).query(api.dashboard.queries.getMyShops, {});

      expect(result).toEqual([]);
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
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-20T00:00:00+09:00"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("未認証の場合、空ページを返す（ログアウト時の再実行でエラーにしない）", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
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

    it("Dashboard向け候補を現在・要シフト調整・募集中・未来確定の順で返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_rec_dashboard_order",
            email: "dashboard-order@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
            deadline: "2026-05-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            deadline: "2026-06-10",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-08",
            periodEnd: "2026-07-20",
            deadline: "2026-06-18",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-08-01",
            periodEnd: "2026-08-15",
            deadline: "2026-07-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-15",
            deadline: "2026-04-20",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
        });

        const result = await t
          .withIdentity({ subject: "user_rec_dashboard_order" })
          .query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);

        expect(result.page.map((recruitment) => recruitment.periodStart)).toEqual([
          "2026-06-01",
          "2026-07-01",
          "2026-07-08",
          "2026-08-01",
        ]);
        expect(result.page[0].createdAt).toBeTypeOf("number");
        expect(result.page[1].confirmedAt).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it("未確定シフトは終了日当日まで返し、翌日から初期取得ではなく過去取得で返す", async () => {
      vi.setSystemTime(new Date("2026-07-07T00:00:00+09:00"));
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_open_ended",
          email: "open-ended@example.com",
          shopName: "店舗",
        });
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-07",
          deadline: "2026-06-30",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });
      const asManager = t.withIdentity({ subject: "user_open_ended" });

      const onPeriodEnd = await asManager.query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      expect(onPeriodEnd.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);

      vi.setSystemTime(new Date("2026-07-08T00:00:00+09:00"));
      const nextDay = await asManager.query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      const past = await asManager.query(api.dashboard.queries.getDashboardPastRecruitments, PAGINATION_FIRST_PAGE);

      expect(nextDay.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
    });

    it("終了済みの未確定シフトは締切日が未来でも初期取得で返さない", async () => {
      vi.setSystemTime(new Date("2026-07-07T00:00:00+09:00"));
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_ended_before_deadline",
          email: "ended-before-deadline@example.com",
          shopName: "店舗",
        });
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-06",
          deadline: "2026-07-10",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });
      const asManager = t.withIdentity({ subject: "user_ended_before_deadline" });

      const active = await asManager.query(api.dashboard.queries.getDashboardRecruitments, PAGINATION_FIRST_PAGE);
      const past = await asManager.query(api.dashboard.queries.getDashboardPastRecruitments, PAGINATION_FIRST_PAGE);

      expect(active.page).toEqual([]);
      expect(past.page.map((recruitment) => recruitment._id)).toEqual([recruitmentId]);
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

  describe("hasDashboardPastRecruitments", () => {
    it("終了済みシフトが未確定でも true を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_has_past",
            email: "has-past@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-04-20",
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-05-01",
            periodEnd: "2026-05-15",
            status: "open",
          });
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-04-01",
            periodEnd: "2026-04-15",
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: true,
          });
        });

        const result = await t
          .withIdentity({ subject: "user_has_past" })
          .query(api.dashboard.queries.hasDashboardPastRecruitments, {});

        expect(result).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("終了済みシフトがない場合は false を返す", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_no_past",
            email: "no-past@example.com",
            shopName: "店舗",
          });
          await ctx.db.insert("recruitments", {
            shopId,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            deadline: "2026-06-20",
            shopClosedDates: [],
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
        });

        const result = await t
          .withIdentity({ subject: "user_no_past" })
          .query(api.dashboard.queries.hasDashboardPastRecruitments, {});

        expect(result).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getDashboardPastRecruitments", () => {
    it("未確定と確定済みの過去シフトを終了日が新しい順にページング取得する", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-16T00:00:00+09:00"));
      try {
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const { shopId } = await seedManagerShop(ctx, {
            subject: "user_past_page",
            email: "past-page@example.com",
            shopName: "店舗",
          });
          const base = {
            shopId,
            deadline: "2026-04-20",
            shopClosedDates: [],
            isDeleted: false,
            submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
          };
          for (const [periodStart, periodEnd, status] of [
            ["2026-05-16", "2026-05-31", "open"],
            ["2026-05-01", "2026-05-15", "confirmed"],
            ["2026-04-16", "2026-04-30", "open"],
          ] as const) {
            await ctx.db.insert("recruitments", {
              ...base,
              periodStart,
              periodEnd,
              status,
              ...(status === "confirmed" ? { confirmedAt: Date.now() } : {}),
            });
          }
          await ctx.db.insert("recruitments", {
            ...base,
            periodStart: "2026-07-01",
            periodEnd: "2026-07-15",
            status: "confirmed",
            confirmedAt: Date.now(),
          });
        });

        const firstPage = await t
          .withIdentity({ subject: "user_past_page" })
          .query(api.dashboard.queries.getDashboardPastRecruitments, { paginationOpts: { numItems: 2, cursor: null } });
        const secondPage = await t
          .withIdentity({ subject: "user_past_page" })
          .query(api.dashboard.queries.getDashboardPastRecruitments, {
            paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
          });

        expect(firstPage.page.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-05-31", "2026-05-15"]);
        expect(firstPage.isDone).toBe(false);
        expect(secondPage.page.map((recruitment) => recruitment.periodEnd)).toEqual(["2026-04-30"]);
        expect(secondPage.isDone).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getDashboardStaffs", () => {
    it("未認証の場合、空ページを返す（ログアウト時の再実行でエラーにしない）", async () => {
      const t = convexTest(schema, modules);
      const result = await t.query(api.dashboard.queries.getDashboardStaffs, PAGINATION_FIRST_PAGE);
      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
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
        "excludedFromShift",
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
