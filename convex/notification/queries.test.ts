import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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

    it("日付選択の確定通知データでは時間ではなく出勤として返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "日付選択店舗");
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

    it("勤務パターンの確定通知データではパターン名つきで返す", async () => {
      const t = convexTest(schema, modules);
      const recruitmentId = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "勤務パターン店舗");
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

    describe("ポジション名と休憩", () => {
      type Pattern =
        | { kind: "time"; startTime: string; endTime: string }
        | { kind: "dateOnly" }
        | {
            kind: "shiftType";
            options: Array<{ id: string; name: string; startTime: string; endTime: string; sortOrder: number }>;
          };
      type SeedAssignment = {
        date: string;
        startTime: string;
        endTime: string;
        position: "default" | "hall" | "kitchen";
        optionId?: string;
        breaks?: Array<{ startTime: string; endTime: string }>;
      };

      /** 確定済みの募集（2026-01-20〜21）と、1人分の割当を用意する。 */
      async function seedConfirmedShifts(
        t: ReturnType<typeof convexTest>,
        args: {
          positions: Array<{ key: "default" | "hall" | "kitchen"; name: string; isDeleted?: boolean }>;
          submissionPattern?: Pattern;
          assignments: SeedAssignment[];
        },
      ) {
        return await t.run(async (ctx) => {
          const shopId = await seedShop(ctx, "ポジション通知店舗");
          const staffId = await seedStaff(ctx, { shopId, name: "田中太郎", email: "tanaka@example.com" });
          const recruitmentId = await ctx.db.insert("recruitments", {
            shopId,
            periodStart: "2026-01-20",
            periodEnd: "2026-01-21",
            deadline: "2026-01-17",
            shopClosedDates: [],
            status: "confirmed",
            confirmedAt: Date.now(),
            isDeleted: false,
            submissionPattern: args.submissionPattern ?? { kind: "time", startTime: "09:00", endTime: "22:00" },
          });
          const positionIds = new Map<string, Id<"positions">>();
          for (const [index, position] of args.positions.entries()) {
            positionIds.set(
              position.key,
              await ctx.db.insert("positions", {
                shopId,
                name: position.name,
                color: "#3b82f6",
                sortOrder: index,
                isDefault: position.key === "default",
                isDeleted: position.isDeleted ?? false,
              }),
            );
          }
          for (const { position, ...assignment } of args.assignments) {
            const positionId = positionIds.get(position);
            if (!positionId) throw new Error(`position fixture ${position} is missing`);
            await ctx.db.insert("shiftAssignments", { recruitmentId, staffId, positionId, ...assignment });
          }
          // t.runの返り値はConvexの値に限られるため、Mapではなくobjectで返す。
          return { recruitmentId, staffId, positionIds: Object.fromEntries(positionIds) };
        });
      }

      it("ポジションが2つ以上の店舗では、時刻の後ろへポジション名と休憩を添え、snapshotにも休憩を持つ", async () => {
        const t = convexTest(schema, modules);
        const ids = await seedConfirmedShifts(t, {
          positions: [
            { key: "default", name: "シフト" },
            { key: "hall", name: "ホール" },
            { key: "kitchen", name: "キッチン" },
          ],
          assignments: [
            {
              date: "2026-01-20",
              startTime: "10:00",
              endTime: "19:00",
              position: "hall",
              breaks: [{ startTime: "14:00", endTime: "15:00" }],
            },
            { date: "2026-01-21", startTime: "13:00", endTime: "18:00", position: "default" },
            {
              date: "2026-01-21",
              startTime: "09:00",
              endTime: "12:00",
              position: "kitchen",
              breaks: [
                { startTime: "11:00", endTime: "11:15" },
                { startTime: "10:00", endTime: "10:15" },
              ],
            },
          ],
        });

        const result = await t.query(internal.notification.queries.getConfirmationEmailData, {
          recruitmentId: ids.recruitmentId,
        });

        expect(result?.staffEntries).toHaveLength(1);
        expect(result?.staffEntries[0].shifts).toEqual([
          { date: "1/20(火)", timeLabel: "10:00-19:00 ホール（休憩 14:00-15:00）" },
          { date: "1/21(水)", timeLabel: "09:00-12:00 キッチン（休憩 10:00-10:15、11:00-11:15） / 13:00-18:00 シフト" },
        ]);
        expect(result?.staffEntries[0].snapshotAssignments).toEqual([
          {
            date: "2026-01-20",
            startTime: "10:00",
            endTime: "19:00",
            positionId: ids.positionIds.hall,
            breaks: [{ startTime: "14:00", endTime: "15:00" }],
          },
          {
            date: "2026-01-21",
            startTime: "09:00",
            endTime: "12:00",
            positionId: ids.positionIds.kitchen,
            breaks: [
              { startTime: "10:00", endTime: "10:15" },
              { startTime: "11:00", endTime: "11:15" },
            ],
          },
          { date: "2026-01-21", startTime: "13:00", endTime: "18:00", positionId: ids.positionIds.default },
        ]);
      });

      it.each([
        {
          name: "日付選択",
          submissionPattern: { kind: "dateOnly" as const },
          assignment: {
            startTime: "09:00",
            endTime: "22:00",
            breaks: [{ startTime: "14:00", endTime: "15:00" }],
          },
          timeLabel: "出勤 ホール（休憩 14:00-15:00）",
        },
        {
          name: "パターン選択",
          submissionPattern: {
            kind: "shiftType" as const,
            options: [
              { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
            ],
          },
          assignment: {
            startTime: "15:00",
            endTime: "22:00",
            optionId: "late",
            breaks: [{ startTime: "18:00", endTime: "18:30" }],
          },
          timeLabel: "遅番（15:00-22:00） ホール（休憩 18:00-18:30）",
        },
      ])(
        "ポジションが2つ以上の店舗では、$name の確定通知にもポジション名と休憩を添える",
        async ({ submissionPattern, assignment, timeLabel }) => {
          const t = convexTest(schema, modules);
          const ids = await seedConfirmedShifts(t, {
            positions: [
              { key: "default", name: "シフト" },
              { key: "hall", name: "ホール" },
            ],
            submissionPattern,
            assignments: [{ date: "2026-01-20", position: "hall", ...assignment }],
          });

          const result = await t.query(internal.notification.queries.getConfirmationEmailData, {
            recruitmentId: ids.recruitmentId,
          });

          expect(result?.staffEntries).toHaveLength(1);
          expect(result?.staffEntries[0].shifts).toEqual([
            { date: "1/20(火)", timeLabel },
            { date: "1/21(水)", timeLabel: null },
          ]);
        },
      );

      it("有効なポジションが1つだけの店舗では、削除済みのポジションが残っていても従来の文面のままである", async () => {
        const t = convexTest(schema, modules);
        const ids = await seedConfirmedShifts(t, {
          positions: [
            { key: "default", name: "シフト" },
            { key: "hall", name: "ホール", isDeleted: true },
          ],
          assignments: [
            { date: "2026-01-20", startTime: "10:00", endTime: "19:00", position: "default" },
            { date: "2026-01-21", startTime: "10:00", endTime: "15:00", position: "hall" },
          ],
        });

        const result = await t.query(internal.notification.queries.getConfirmationEmailData, {
          recruitmentId: ids.recruitmentId,
        });

        expect(result?.staffEntries).toHaveLength(1);
        expect(result?.staffEntries[0].shifts).toEqual([
          { date: "1/20(火)", timeLabel: "10:00-19:00" },
          { date: "1/21(水)", timeLabel: "10:00-15:00" },
        ]);
      });

      it("削除したポジションの勤務は、シフト表と同じく既定のポジションの名前で伝える", async () => {
        const t = convexTest(schema, modules);
        const ids = await seedConfirmedShifts(t, {
          positions: [
            { key: "default", name: "シフト" },
            { key: "hall", name: "ホール" },
            { key: "kitchen", name: "キッチン", isDeleted: true },
          ],
          assignments: [{ date: "2026-01-20", startTime: "10:00", endTime: "15:00", position: "kitchen" }],
        });

        const result = await t.query(internal.notification.queries.getConfirmationEmailData, {
          recruitmentId: ids.recruitmentId,
        });

        expect(result?.staffEntries).toHaveLength(1);
        expect(result?.staffEntries[0].shifts).toEqual([
          { date: "1/20(火)", timeLabel: "10:00-15:00 シフト" },
          { date: "1/21(水)", timeLabel: null },
        ]);
      });

      // 休憩だけを変えた再通知で本文に違いが出るよう、休憩はポジションの数にかかわらず伝える。
      it("ポジションが1つだけの店舗では、ポジション名を出さず、休憩だけを時刻の後ろへ添える", async () => {
        const t = convexTest(schema, modules);
        const ids = await seedConfirmedShifts(t, {
          positions: [{ key: "default", name: "シフト" }],
          assignments: [
            {
              date: "2026-01-20",
              startTime: "10:00",
              endTime: "19:00",
              position: "default",
              breaks: [{ startTime: "14:00", endTime: "15:00" }],
            },
          ],
        });

        const result = await t.query(internal.notification.queries.getConfirmationEmailData, {
          recruitmentId: ids.recruitmentId,
        });

        expect(result?.staffEntries).toHaveLength(1);
        expect(result?.staffEntries[0].shifts).toEqual([
          { date: "1/20(火)", timeLabel: "10:00-19:00（休憩 14:00-15:00）" },
          { date: "1/21(水)", timeLabel: null },
        ]);
      });
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
