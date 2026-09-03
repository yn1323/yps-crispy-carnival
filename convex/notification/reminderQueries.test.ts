import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedCanonicalStaffLineRecipient, seedShop } from "../_test/seed";
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
        const submittedStaffId = await seedStaff(ctx, {
          shopId,
          name: "提出済み",
          email: "submitted@example.com",
        });
        const unsubmittedStaffId = await seedStaff(ctx, {
          shopId,
          name: "未提出",
          email: "unsubmitted@example.com",
        });
        await ctx.db.insert("shiftSubmissions", {
          recruitmentId,
          staffId: submittedStaffId,
          firstSubmittedAt: Date.now(),
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
        await seedStaff(ctx, {
          shopId,
          name: "メアドなし",
          email: "",
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
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "LINEスタッフ",
          email: "",
        });
        await seedCanonicalStaffLineRecipient(ctx, {
          staffId,
          lineUserId: "U_reminder_line_only",
          following: true,
        });
        return { recruitmentId, staffId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result?.staffEntries).toHaveLength(1);
      expect(result?.staffEntries[0]).toMatchObject({
        staffId,
        lineUserId: "U_reminder_line_only",
        lineRecipient: { lineUserId: "U_reminder_line_only", following: true },
      });
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
        await seedStaff(ctx, {
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

    it("removed personのstaffはstaff snapshotにメールがあっても除外する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "removed person催促店舗");
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
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "removed personスタッフ",
          email: "removed-reminder@example.com",
        });
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
        await ctx.db.patch(staff.organizationPersonId, { status: "removed", updatedAt: Date.now() });
        return { recruitmentId };
      });

      const result = await t.query(internal.notification.reminderQueries.getReminderEmailData, { recruitmentId });

      expect(result?.staffEntries).toEqual([]);
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
