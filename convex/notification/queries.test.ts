import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { SHIFT_ASSIGNMENT_LIMIT } from "../constants";

describe("notification/queries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-20T12:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("getOpenRecruitmentNotificationDataForStaff", () => {
    it("open募集は開始前かつ提出期限前の募集だけ通知対象にする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "募集通知店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "募集通知スタッフ",
          email: "join@example.com",
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

    it("通知宛先はstaff snapshotではなくactive personの氏名とメールを使う", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "canonical宛先店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "正本スタッフ",
          email: "canonical-recipient@example.com",
        });
        await ctx.db.patch(staffId, {
          name: "古いstaff snapshot",
          email: "stale-staff@example.com",
          emailNormalized: "stale-staff@example.com",
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-25",
          periodEnd: "2026-01-28",
          deadline: "2026-01-23",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return { staffId };
      });

      await expect(
        t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
          staffId: ids.staffId,
        }),
      ).resolves.toMatchObject({
        staff: {
          name: "正本スタッフ",
          email: "canonical-recipient@example.com",
          emailNormalized: "canonical-recipient@example.com",
        },
      });
    });

    it("removed personのstaffには通知データを返さない", async () => {
      const t = convexTest(schema, modules);
      const staffId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "removed person店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "removed personスタッフ",
          email: "removed-person@example.com",
        });
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
        await ctx.db.patch(staff.organizationPersonId, { status: "removed", updatedAt: Date.now() });
        return staffId;
      });

      await expect(
        t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, { staffId }),
      ).resolves.toBeNull();
    });

    it("両canonical ID欠損staffは保存済みメールがあっても新規通知データへ戻さない", async () => {
      const t = convexTest(schema, modules);
      const staffId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "未解決staff通知店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "未解決staff",
          email: "stored-unresolved@example.com",
        });
        await ctx.db.patch(staffId, { organizationId: undefined, organizationPersonId: undefined });
        return staffId;
      });

      await expect(
        t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, { staffId }),
      ).resolves.toBeNull();
    });

    it("シフト対象外スタッフには募集通知データを返さない", async () => {
      const t = convexTest(schema, modules);
      const staffId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "募集通知店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "対象外スタッフ",
          email: "excluded@example.com",
          excludedFromShift: true,
        });
        await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-25",
          periodEnd: "2026-01-28",
          deadline: "2026-01-23",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        return staffId;
      });

      const result = await t.query(internal.notification.queries.getOpenRecruitmentNotificationDataForStaff, {
        staffId,
      });
      expect(result).toBeNull();
    });
  });

  describe("getRecruitmentEmailData（シフト対象外の除外）", () => {
    it("シフト対象外スタッフを募集メールの宛先から除外する", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "募集メール店舗");
        await seedStaff(ctx, {
          shopId,
          name: "通常スタッフ",
          email: "normal@example.com",
        });
        await seedStaff(ctx, {
          shopId,
          name: "対象外スタッフ",
          email: "excluded@example.com",
          excludedFromShift: true,
        });
        return await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-25",
          periodEnd: "2026-01-28",
          deadline: "2026-01-23",
          shopClosedDates: [],
          status: "open",
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
      });

      const result = await t.query(internal.notification.queries.getRecruitmentEmailData, { recruitmentId });
      expect(result?.staffEntries.map((entry) => entry.email)).toEqual(["normal@example.com"]);
    });
  });

  describe("getConfirmationEmailData", () => {
    it("同じ日の完全隣接セグメントだけを統合し、正の空白は表示へ残す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
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
          startTime: "14:00",
          endTime: "15:00",
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

      expect(result?.staffEntries[0].shifts).toEqual([{ date: "1/20(火)", timeLabel: "10:00-15:00 / 17:00-22:00" }]);
      expect(result?.staffEntries[0].snapshotAssignments).toHaveLength(2);
    });

    it("対象staffの割当が上限を超える場合は通知データを部分生成しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "通知割当上限店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "通知割当上限スタッフ",
          email: "notification-assignment-overflow@example.com",
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
        for (let index = 0; index <= SHIFT_ASSIGNMENT_LIMIT; index += 1) {
          await ctx.db.insert("shiftAssignments", {
            recruitmentId,
            staffId,
            date: "2026-01-20",
            startTime: "10:00",
            endTime: "11:00",
            positionId,
          });
        }
        return { recruitmentId, staffId };
      });

      await expect(
        t.query(internal.notification.queries.getConfirmationEmailData, {
          recruitmentId: ids.recruitmentId,
          targetStaffIds: [ids.staffId],
        }),
      ).rejects.toThrow("Shift assignment scope exceeds the supported limit");
      await expect(
        t.query(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, {
          staffId: ids.staffId,
        }),
      ).resolves.toBeNull();
    });

    it("確定通知データでは定休日を定休日として返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "テスト店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
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
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
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
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "田中太郎",
          email: "tanaka@example.com",
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

  describe("getCurrentConfirmationEmailDataForStaff compatibility", () => {
    it("旧return shapeで現在の確定内容を返し、dirtyな募集はfail closedする", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "rolling compatibility店舗");
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "rolling compatibilityスタッフ",
          email: "rolling-compatibility@example.com",
        });
        const positionId = await ctx.db.insert("positions", {
          shopId,
          name: "通常",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-21",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: 1_000,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        return { shopId, staffId, recruitmentId };
      });

      await expect(
        t.query(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, { staffId: ids.staffId }),
      ).resolves.toMatchObject({
        shopId: ids.shopId,
        staff: {
          staffId: ids.staffId,
          name: "rolling compatibilityスタッフ",
          email: "rolling-compatibility@example.com",
        },
        recruitments: [
          {
            recruitmentId: ids.recruitmentId,
            staffEntry: {
              staffId: ids.staffId,
              shifts: [
                { date: "1/20(火)", timeLabel: "10:00-18:00" },
                { date: "1/21(水)", timeLabel: null },
              ],
            },
          },
        ],
      });

      await t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { draftSavedAt: 2_000 }));
      await expect(
        t.query(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, { staffId: ids.staffId }),
      ).resolves.toBeNull();
    });
  });
});
