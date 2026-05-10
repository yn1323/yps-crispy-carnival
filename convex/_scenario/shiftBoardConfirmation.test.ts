import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("シフト表作成・確定シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("提出状況の混在から下書き保存、下書き後再提出、確定、スタッフ閲覧まで整合する", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "board-manager@example.com",
        shopName: "シフト表店舗",
      });
      const beforeDraftStaffId = await seedStaff(ctx, {
        shopId,
        name: "保存前提出スタッフ",
        email: "before-draft@example.com",
      });
      const afterDraftStaffId = await seedStaff(ctx, {
        shopId,
        name: "保存後提出スタッフ",
        email: "after-draft@example.com",
      });
      return { shopId, beforeDraftStaffId, afterDraftStaffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    };
    const recruitmentId = await asManager.mutation(api.recruitment.mutations.createRecruitment, recruitmentInput);
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-before-draft-session",
        staffId: ids.beforeDraftStaffId,
        shopId: ids.shopId,
        recruitmentId,
      });
      await seedSession(ctx, {
        sessionToken: "scenario-after-draft-session",
        staffId: ids.afterDraftStaffId,
        shopId: ids.shopId,
        recruitmentId,
      });
    });

    vi.setSystemTime(SCENARIO_NOW + 1_000);
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-before-draft-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });

    vi.setSystemTime(SCENARIO_NOW + 2_000);
    await asManager.mutation(api.shiftBoard.mutations.saveShiftAssignments, {
      recruitmentId,
      assignments: [
        { staffId: ids.beforeDraftStaffId, date: recruitmentInput.periodStart, startTime: "11:00", endTime: "17:00" },
      ],
    });

    vi.setSystemTime(SCENARIO_NOW + 3_000);
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-after-draft-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });
    await t.mutation(api.shiftSubmission.mutations.submitShiftRequests, {
      sessionToken: "scenario-before-draft-session",
      recruitmentId,
      requests: [{ date: recruitmentInput.periodStart, startTime: "13:00", endTime: "21:00" }],
    });

    const draftBoard = await asManager.query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    const staffById = new Map(draftBoard?.staffs.map((staff) => [staff._id, staff]));
    expect(staffById.get(ids.beforeDraftStaffId)).toMatchObject({ isSubmitted: true, wasSubmittedAtDraft: true });
    expect(staffById.get(ids.afterDraftStaffId)).toMatchObject({ isSubmitted: true, wasSubmittedAtDraft: false });
    expect(draftBoard?.requestedSlots).toHaveLength(2);
    expect(draftBoard?.requestedSlots).toEqual(
      expect.arrayContaining([
        { staffId: ids.beforeDraftStaffId, date: recruitmentInput.periodStart, startTime: "13:00", endTime: "21:00" },
        { staffId: ids.afterDraftStaffId, date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" },
      ]),
    );
    expect(draftBoard?.shiftAssignments).toHaveLength(1);
    expect(draftBoard?.shiftAssignments[0]).toMatchObject({
      staffId: ids.beforeDraftStaffId,
      date: recruitmentInput.periodStart,
      startTime: "11:00",
      endTime: "17:00",
    });
    expect(draftBoard?.positions.some((position) => position._id === draftBoard.shiftAssignments[0].positionId)).toBe(
      true,
    );

    vi.setSystemTime(SCENARIO_NOW + 4_000);
    await asManager.mutation(api.shiftBoard.mutations.confirmRecruitment, { recruitmentId });

    const confirmedBoard = await asManager.query(api.shiftBoard.queries.getShiftBoardData, { recruitmentId });
    expect(confirmedBoard?.recruitment.status).toBe("confirmed");
    expect(confirmedBoard?.recruitment.confirmedAt).toBe(SCENARIO_NOW + 4_000);

    const staffView = await t.query(api.shiftView.queries.getShiftViewData, {
      sessionToken: "scenario-before-draft-session",
      recruitmentId,
    });
    expect(staffView?.assignments).toEqual([
      {
        staffId: ids.beforeDraftStaffId,
        date: recruitmentInput.periodStart,
        startTime: "11:00",
        endTime: "17:00",
        positionId: confirmedBoard?.shiftAssignments[0].positionId,
      },
    ]);

    const confirmationData = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });
    const beforeDraftEntry = confirmationData?.staffEntries.find((staff) => staff.staffId === ids.beforeDraftStaffId);
    expect(beforeDraftEntry?.shifts.some((shift) => shift.timeLabel === "11:00-17:00")).toBe(true);
  });

  it("確定済み募集には未提出催促を送れない", async () => {
    const t = convexTest(schema, modules);
    const asManager = t.withIdentity({ subject: MANAGER_SUBJECT });
    const recruitmentId = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "confirmed-manager@example.com",
        shopName: "確定済み店舗",
      });
      return await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(9),
        deadline: scenarioDate(3),
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        shiftStartTime: "09:00",
        shiftEndTime: "22:00",
      });
    });

    await expect(
      asManager.mutation(api.shiftReminder.mutations.sendReminderEmails, {
        recruitmentId,
      }),
    ).rejects.toThrow("募集中のシフトだけ");
  });
});
