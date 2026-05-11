import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
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
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 下書き保存前後で提出タイミングが異なるスタッフを用意する。
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
    const recruitmentId = await asManager.createRecruitment(recruitmentInput);
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

    // Act: 保存前スタッフが希望を提出する。
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    await staff.submitShiftRequests({
      sessionToken: "scenario-before-draft-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
    });

    // Act: 店長が提出済み希望を元に下書き保存する。
    vi.setSystemTime(SCENARIO_NOW + 2_000);
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: [
        { staffId: ids.beforeDraftStaffId, date: recruitmentInput.periodStart, startTime: "11:00", endTime: "17:00" },
      ],
    });

    // Act: 下書き後に別スタッフが提出し、保存前スタッフも再提出する。
    vi.setSystemTime(SCENARIO_NOW + 3_000);
    await staff.submitShiftRequests({
      sessionToken: "scenario-after-draft-session",
      recruitmentId,
      acceptedLegal: true,
      requests: [{ date: recruitmentInput.periodStart, startTime: "12:00", endTime: "20:00" }],
    });
    await staff.submitShiftRequests({
      sessionToken: "scenario-before-draft-session",
      recruitmentId,
      requests: [{ date: recruitmentInput.periodStart, startTime: "13:00", endTime: "21:00" }],
    });

    // Assert: 下書き時点の提出済み判定と最新希望がシフト表に反映される。
    const draftBoard = await asManager.getShiftBoardData(recruitmentId);
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

    // Act: 店長がシフトを確定する。
    vi.setSystemTime(SCENARIO_NOW + 4_000);
    await asManager.confirmRecruitment(recruitmentId);

    // Assert: 確定状態、スタッフ閲覧、確定通知データが下書き保存内容を参照する。
    const confirmedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(confirmedBoard?.recruitment.status).toBe("confirmed");
    expect(confirmedBoard?.recruitment.confirmedAt).toBe(SCENARIO_NOW + 4_000);

    const staffView = await staff.getShiftViewData({
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
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    // Arrange: 確定済み募集を用意する。
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

    // Act / Assert: 確定済み募集への催促操作は拒否される。
    await expect(asManager.sendReminderEmails(recruitmentId)).rejects.toThrow("募集中のシフトだけ");
  });
});
