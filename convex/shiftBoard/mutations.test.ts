import { ConvexError } from "convex/values";
import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { type AssignmentIssueCode, parseShiftAssignmentValidationError } from "./validation";

/** 構造化バリデーションエラーがthrowされ、期待したissuesを全件含むことを検証する */
async function expectValidationIssues(
  promise: Promise<unknown>,
  expected: Array<{ code: AssignmentIssueCode; date: string; staffId: string }>,
) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ConvexError);
  const issues = parseShiftAssignmentValidationError(error);
  expect(issues).not.toBeNull();
  expect(issues?.map(({ code, date, staffId }) => ({ code, date, staffId }))).toEqual(expected);
}

/** テスト用にshop + user + recruitment + staffsをセットアップ */
async function setupTestData(t: TestConvex<typeof schema>, options?: { shopClosedDates?: string[] }) {
  const result = await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_manager",
      email: "manager@example.com",
      shopName: "テスト店舗",
    });
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-01-20",
      periodEnd: "2026-01-26",
      deadline: "2026-01-17",
      shopClosedDates: options?.shopClosedDates ?? [],
      status: "open",
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const staffId1 = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    const staffId2 = await ctx.db.insert("staffs", {
      shopId,
      name: "佐藤花子",
      email: "sato@example.com",
      isDeleted: false,
    });
    return { shopId, recruitmentId, staffId1, staffId2 };
  });

  return result;
}

describe("shiftBoard/mutations", () => {
  describe("saveShiftAssignments", () => {
    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId: "invalid" as Id<"recruitments">,
          assignments: [],
        }),
      ).rejects.toThrow();
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      // 別のshop+userを作成
      await t.run(async (ctx) => {
        const { shopId } = await seedManagerShop(ctx, {
          subject: "user_other",
          email: "other@example.com",
          shopName: "他店舗",
        });
        return shopId;
      });

      await expect(
        t.withIdentity({ subject: "user_other" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [],
        }),
      ).rejects.toThrow(ConvexError);
    });

    it("正常にシフト割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].staffId).toBe(staffId1);
      expect(assignments[0].startTime).toBe("10:00");
    });

    it("勤務区分IDつきのシフト割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "17:00", endTime: "21:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          {
            staffId: staffId1,
            date: "2026-01-20",
            startTime: "09:00",
            endTime: "13:00",
            optionId: "morning",
          },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].optionId).toBe("morning");
    });

    it("勤務区分募集では勤務区分IDなしの割当を保存できない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "09:00",
              endTime: "13:00",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_REQUIRED", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("存在しない勤務区分IDは保存できない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "09:00",
              endTime: "13:00",
              optionId: "late",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_NOT_FOUND", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("勤務区分IDと時間が一致しない割当は保存できない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [{ id: "morning", name: "早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 }],
          },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            {
              staffId: staffId1,
              date: "2026-01-20",
              startTime: "10:00",
              endTime: "14:00",
              optionId: "morning",
            },
          ],
        }),
        [{ code: "SHIFT_TYPE_TIME_MISMATCH", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト時間の境界内なら保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "05:30", endTime: "06:30" },
          { staffId: staffId2, date: "2026-01-20", startTime: "21:30", endTime: "22:30" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
    });

    it("空のassignmentsで保存できる（全員休み）", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(0);
      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.draftSavedAt).toBeTypeOf("number");
    });

    it("保存時にdraftSavedAtを更新する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
      });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.draftSavedAt).toBeTypeOf("number");
    });

    it("既存の割当がある場合は全削除して置き換える", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1, staffId2 } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        if (!recruitment) throw new Error("missing recruitment");
        const positionId = await ctx.db.insert("positions", {
          shopId: recruitment.shopId,
          name: "既存ポジション",
          color: "#64748b",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId1,
          date: "2026-01-20",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId2,
          date: "2026-01-20",
          startTime: "11:00",
          endTime: "19:00",
          positionId,
        });
      });

      await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "17:00" }],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
          .collect(),
      );
      expect(assignments).toHaveLength(1);
      expect(assignments[0].startTime).toBe("09:00");
    });

    it("同一スタッフ×同一日の時間が重ならない複数割当を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "14:00" },
          { staffId: staffId1, date: "2026-01-20", startTime: "15:00", endTime: "18:00" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
    });

    it("勤務区分募集では同一スタッフ×同一日の隣接する勤務区分を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "early", name: "早番", startTime: "09:00", endTime: "12:00", sortOrder: 0 },
              { id: "late", name: "遅番", startTime: "12:00", endTime: "15:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "09:00", endTime: "12:00", optionId: "early" },
          { staffId: staffId1, date: "2026-01-20", startTime: "12:00", endTime: "15:00", optionId: "late" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
      expect(assignments.map((assignment) => assignment.optionId).sort()).toEqual(["early", "late"]);
    });

    it("勤務区分募集では同一スタッフ×同一日の重なる別勤務区分を保存できる", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: {
            kind: "shiftType",
            options: [
              { id: "early", name: "早番", startTime: "10:00", endTime: "15:00", sortOrder: 0 },
              { id: "middle", name: "中番", startTime: "13:00", endTime: "18:00", sortOrder: 1 },
            ],
          },
        });
      });

      await t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
        recruitmentId,
        assignments: [
          { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "15:00", optionId: "early" },
          { staffId: staffId1, date: "2026-01-20", startTime: "13:00", endTime: "18:00", optionId: "middle" },
        ],
      });

      const assignments = await t.run(async (ctx) =>
        ctx.db
          .query("shiftAssignments")
          .withIndex("by_recruitmentId_staffId", (q) => q.eq("recruitmentId", recruitmentId).eq("staffId", staffId1))
          .collect(),
      );
      expect(assignments).toHaveLength(2);
      expect(assignments.map((assignment) => assignment.optionId).sort()).toEqual(["early", "middle"]);
    });

    it("同一スタッフ×同一日の時間が重なる割当でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            { staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "15:00" },
            { staffId: staffId1, date: "2026-01-20", startTime: "14:00", endTime: "18:00" },
          ],
        }),
        [{ code: "OVERLAP", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("募集期間外の日付でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-27", startTime: "10:00", endTime: "18:00" }],
        }),
        [{ code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: staffId1 }],
      );
    });

    it("定休日の日付ではシフト割当を保存できない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t, { shopClosedDates: ["2026-01-21"] });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-21", startTime: "10:00", endTime: "18:00" }],
        }),
        [{ code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 }],
      );
    });

    it("開始時間が終了時間以降でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "18:00", endTime: "10:00" }],
        }),
        [{ code: "INVALID_TIME_ORDER", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("開始時間と終了時間が同じでエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "10:00", endTime: "10:00" }],
        }),
        [{ code: "INVALID_TIME_ORDER", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("店舗のシフト時間外でエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "07:00", endTime: "15:00" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト開始時刻より前ならエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "05:00", endTime: "06:30" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("分つきシフト終了時刻より後ならエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, {
          submissionPattern: { kind: "time", startTime: "05:30", endTime: "22:30" },
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: staffId1, date: "2026-01-20", startTime: "21:30", endTime: "23:00" }],
        }),
        [{ code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId1 }],
      );
    });

    it("複数の違反がある場合は全issuesをまとめて返す", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1, staffId2 } = await setupTestData(t, { shopClosedDates: ["2026-01-21"] });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [
            { staffId: staffId1, date: "2026-01-27", startTime: "10:00", endTime: "18:00" },
            { staffId: staffId1, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
            { staffId: staffId2, date: "2026-01-20", startTime: "07:00", endTime: "15:00" },
          ],
        }),
        [
          { code: "OUT_OF_PERIOD", date: "2026-01-27", staffId: staffId1 },
          { code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 },
          { code: "OUT_OF_BOARD_RANGE", date: "2026-01-20", staffId: staffId2 },
        ],
      );
    });

    it("削除済みスタッフでエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      const deletedStaffId = await t.run(async (ctx) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_authTokenIdentifier", (q) =>
            q.eq("authTokenIdentifier", testAuthTokenIdentifier("user_manager")),
          )
          .first();
        if (!user) throw new Error("user not found");
        const membership = await ctx.db
          .query("shopMembers")
          .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", user._id).eq("isDeleted", false))
          .first();
        if (!membership) throw new Error("shop not found");
        return await ctx.db.insert("staffs", {
          shopId: membership.shopId,
          name: "削除済み",
          email: "deleted@example.com",
          isDeleted: true,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
          recruitmentId,
          assignments: [{ staffId: deletedStaffId, date: "2026-01-20", startTime: "10:00", endTime: "18:00" }],
        }),
      ).rejects.toThrow(ConvexError);
    });
  });

  describe("confirmRecruitment", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("未認証の場合エラーをthrow", async () => {
      const t = convexTest(schema, modules);
      await expect(
        t.mutation(api.shiftBoard.mutations.confirmRecruitment, {
          recruitmentId: "invalid" as Id<"recruitments">,
        }),
      ).rejects.toThrow();
    });

    it("正常にステータスとconfirmedAtを更新する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t
        .withIdentity({ subject: "user_manager" })
        .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });

      const recruitment = await t.run(async (ctx) => ctx.db.get(recruitmentId));
      expect(recruitment?.status).toBe("confirmed");
      expect(recruitment?.confirmedAt).toBeTypeOf("number");
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")).toHaveLength(
        1,
      );
      expect(scheduled[0].args[0]?.isResend).toBe(false);
    });

    it("確定済み募集へのconfirm intentは通知を増やさない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, intent: "confirm" });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendShiftConfirmationEmails")).toHaveLength(
        1,
      );
    });

    it("確定済み募集へのresend intentは再通知として予約する", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);
      const asManager = t.withIdentity({ subject: "user_manager" });

      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });
      await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId, intent: "resend" });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      const confirmationJobs = scheduled.filter(
        (job) => job.name === "notification/actions:sendShiftConfirmationEmails",
      );
      expect(confirmationJobs).toHaveLength(2);
      expect(confirmationJobs.map((job) => job.args[0]?.isResend)).toEqual([false, true]);
    });

    it("未確定募集へのresend intentはエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await expect(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          recruitmentId,
          intent: "resend",
        }),
      ).rejects.toThrow("確定済みのシフトだけ再通知できます");
    });

    it("定休日に既存シフトが残っている場合は確定できない", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId, staffId1 } = await setupTestData(t, { shopClosedDates: ["2026-01-21"] });
      await t.run(async (ctx) => {
        const recruitment = await ctx.db.get(recruitmentId);
        if (!recruitment) throw new Error("missing recruitment");
        const positionId = await ctx.db.insert("positions", {
          shopId: recruitment.shopId,
          name: "シフト",
          color: "#3b82f6",
          sortOrder: 0,
          isDefault: true,
          isDeleted: false,
        });
        await ctx.db.insert("shiftAssignments", {
          recruitmentId,
          staffId: staffId1,
          date: "2026-01-21",
          startTime: "10:00",
          endTime: "18:00",
          positionId,
        });
      });

      await expectValidationIssues(
        t.withIdentity({ subject: "user_manager" }).mutation(api.shiftBoard.mutations.confirmRecruitment, {
          recruitmentId,
        }),
        [{ code: "CLOSED_DAY", date: "2026-01-21", staffId: staffId1 }],
      );
    });

    it("他店舗のrecruitmentではNot foundエラー", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      await t.run(async (ctx) => {
        await seedManagerShop(ctx, {
          subject: "user_other2",
          email: "other2@example.com",
          shopName: "他店舗",
        });
      });

      await expect(
        t
          .withIdentity({ subject: "user_other2" })
          .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId }),
      ).rejects.toThrow(ConvexError);
    });
  });
});
