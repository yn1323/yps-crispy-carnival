import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedShop, seedStaffLineAccount } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("notification/reminderQueries", () => {
  const reminderScheduledAt = new Date("2026-04-24T17:00:00+09:00").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T18:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("getReminderEmailData", () => {
    it("未提出のスタッフのみ返す", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, submittedStaffId, unsubmittedStaffId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-15",
          deadline: "2026-04-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          reminderScheduledAt,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const submittedStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "提出済み",
          email: "submitted@example.com",
          isDeleted: false,
        });
        const unsubmittedStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "未提出",
          email: "unsubmitted@example.com",
          isDeleted: false,
        });
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: submittedStaffId,
          submittedAt: Date.now(),
        });
        return { recruitmentId, submittedStaffId, unsubmittedStaffId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result).not.toBeNull();
      expect(result?.staffEntries).toHaveLength(1);
      expect(result?.staffEntries[0].staffId).toBe(unsubmittedStaffId);
      expect(result?.staffEntries.find((s) => s.staffId === submittedStaffId)).toBeUndefined();
    });

    it("連絡手段がないスタッフは除外する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-15",
          deadline: "2026-04-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          reminderScheduledAt,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "メアドなし",
          email: "",
          isDeleted: false,
        });
        return { recruitmentId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result?.staffEntries).toHaveLength(0);
    });

    it("メールなしでもLINE連携済みなら対象にする", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-15",
          deadline: "2026-04-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          reminderScheduledAt,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "LINEスタッフ",
          email: "",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, {
          shopId,
          staffId,
          lineUserId: "U_reminder_line_only",
          following: true,
        });
        return { recruitmentId, staffId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result?.staffEntries).toHaveLength(1);
      expect(result?.staffEntries[0]).toMatchObject({ staffId, lineUserId: "U_reminder_line_only" });
    });

    it("論理削除済みスタッフは除外する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-15",
          deadline: "2026-04-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          reminderScheduledAt,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("staffs", {
          shopId,
          name: "削除済み",
          email: "deleted@example.com",
          isDeleted: true,
        });
        return { recruitmentId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result?.staffEntries).toHaveLength(0);
    });

    it("削除済みrecruitmentでは null を返す", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-05-01",
          periodEnd: "2026-05-15",
          deadline: "2026-04-25",
          shopClosedDates: [],
          status: "open",
          isDeleted: true,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { recruitmentId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result).toBeNull();
    });
  });
});
