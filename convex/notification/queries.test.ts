import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notification/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("getOpenRecruitmentNotificationDataForStaff", () => {
    it("open募集は開始前かつ締切前の募集だけ通知対象にする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "募集通知店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "募集通知スタッフ",
          email: "join@example.com",
          isDeleted: false,
        });
        const futureOpenRecruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-22",
          periodEnd: "2026-01-25",
          deadline: "2026-01-21",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-19",
          periodEnd: "2026-01-21",
          deadline: "2026-01-21",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-23",
          periodEnd: "2026-01-26",
          deadline: "2026-01-19",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { staffId, futureOpenRecruitmentId };
      });

      const result = await t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
        staffId: ids.staffId,
      });

      expect(result?.recruitments.map((recruitment) => recruitment.recruitmentId)).toEqual([
        ids.futureOpenRecruitmentId,
      ]);
    });
  });

  describe("getConfirmationEmailData", () => {
    it("同じ日の複数確定セグメントを1日の表示ラベルにまとめる", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-20",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "17:00",
          endTime: "22:00",
          positionId,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "14:00",
          positionId,
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([{ date: "1/20(火)", timeLabel: "10:00-14:00 / 17:00-22:00" }]);
    });

    it("確定通知データでは定休日を定休日として返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-21",
          deadline: "2026-01-17",
          shopClosedDates: ["2026-01-21"],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "14:00",
          positionId,
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([
        { date: "1/20(火)", timeLabel: "10:00-14:00" },
        { date: "1/21(水)", timeLabel: "定休日" },
      ]);
    });

    it("日ごとの確定通知データでは時間ではなく出勤として返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "日ごと店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-20",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "dateOnly" },
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "09:00",
          endTime: "22:00",
          positionId,
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([{ date: "1/20(火)", timeLabel: "出勤" }]);
    });

    it("勤務区分の確定通知データでは区分名つきで返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "勤務区分店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-20",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
            ],
          },
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });

        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "15:00",
          endTime: "22:00",
          positionId,
          optionId: "late",
        });

        return recruitmentId;
      });

      const result = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });

      expect(result?.staffEntries[0].shifts).toEqual([{ date: "1/20(火)", timeLabel: "遅番（15:00-22:00）" }]);
    });
  });
});
