import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const MANAGER_SUBJECT = "scenario_shift_creation_manager";
const STAFF_SESSION_TOKEN = "scenario-shift-creation-session";

function futureDate(daysFromNow: number): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

describe("シフト作成シナリオ", () => {
  // 募集作成・確定は通知 action を scheduler に積む。Scenario Test では DB 状態遷移を見たいので実行を進めない。
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("募集作成から希望提出、下書き保存、確定まで完了できる", async () => {
    const t = convexTest(schema, modules);
    const { shopId, staffId } = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "scenario-manager@example.com",
        shopName: "シナリオ店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        name: "シナリオスタッフ",
        email: "scenario-staff@example.com",
        isDeleted: false,
      });
      return { shopId: seeded.shopId, staffId };
    });
    const recruitmentInput = {
      periodStart: futureDate(7),
      periodEnd: futureDate(13),
      deadline: futureDate(3),
    };

    const recruitmentId = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.recruitment.mutations.createRecruitment, recruitmentInput);

    await t.run(async (ctx) => {
      await ctx.db.insert("sessions", {
        sessionToken: STAFF_SESSION_TOKEN,
        staffId,
        shopId,
        recruitmentId,
        expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
      });
    });

    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: STAFF_SESSION_TOKEN,
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });

    const submittedBoard = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    expect(submittedBoard?.staffs).toEqual([
      { _id: staffId, name: "シナリオスタッフ", isSubmitted: true, wasSubmittedAtDraft: false },
    ]);
    expect(submittedBoard?.requestedSlots).toEqual([
      { staffId, date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" },
    ]);

    await t.withIdentity({ subject: MANAGER_SUBJECT }).mutation(api.shiftBoard.mutations.saveShiftAssignments, {
      recruitmentId,
      assignments: [{ staffId, date: recruitmentInput.periodStart, startTime: "11:00", endTime: "17:00" }],
    });

    const draftBoard = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    expect(draftBoard?.recruitment.draftSavedAt).toBeTypeOf("number");
    expect(draftBoard?.staffs).toEqual([
      { _id: staffId, name: "シナリオスタッフ", isSubmitted: true, wasSubmittedAtDraft: true },
    ]);
    expect(draftBoard?.shiftAssignments[0]).toMatchObject({
      staffId,
      date: recruitmentInput.periodStart,
      startTime: "11:00",
      endTime: "17:00",
    });
    expect(draftBoard?.shiftAssignments[0]?.positionId).toBeTypeOf("string");

    await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });

    const confirmedBoard = await t
      .withIdentity({ subject: MANAGER_SUBJECT })
      .query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    expect(confirmedBoard?.recruitment.status).toBe("confirmed");
    expect(confirmedBoard?.recruitment.confirmedAt).toBeTypeOf("number");
  });
});
