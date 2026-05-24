import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { MANAGER_SUBJECT, SCENARIO_NOW, scenarioDate, seedSession, seedStaff } from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

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

    // Act: シフト担当者が提出済み希望を元に下書き保存する。
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

    // Act: シフト担当者がシフトを確定する。
    vi.setSystemTime(SCENARIO_NOW + 4_000);
    await asManager.confirmRecruitment(recruitmentId);

    // Assert: 確定状態、スタッフ閲覧、確定通知データが下書き保存内容を参照する。
    const confirmedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(confirmedBoard?.recruitment.status).toBe("confirmed");
    expect(confirmedBoard?.recruitment.confirmedAt).toBe(SCENARIO_NOW + 4_000);
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "scenario-before-draft-view-session",
        staffId: ids.beforeDraftStaffId,
        shopId: ids.shopId,
        recruitmentId,
        accessKind: "view",
      });
    });

    const staffView = await staff.getShiftViewData({
      sessionToken: "scenario-before-draft-view-session",
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

  it("日ごと・勤務区分は下書き保存後の再提出で既存割当を勝手に上書きしない", async () => {
    const t = convexTest(schema, modules);

    const cases = [
      {
        kind: "dateOnly" as const,
        managerSubject: `${MANAGER_SUBJECT}_draft_date_only`,
        shopName: "日ごと下書き店舗",
        submissionPattern: { kind: "dateOnly" as const },
      },
      {
        kind: "shiftType" as const,
        managerSubject: `${MANAGER_SUBJECT}_draft_shift_type`,
        shopName: "勤務区分下書き店舗",
        submissionPattern: {
          kind: "shiftType" as const,
          options: [
            { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
          ],
        },
      },
    ];

    for (const testCase of cases) {
      const scenario = createScenario(t);
      const asManager = scenario.manager(testCase.managerSubject);
      const staff = scenario.staff();
      const { shopId, staffId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: testCase.managerSubject,
          email: `${testCase.kind}-draft-manager@example.com`,
          shopName: testCase.shopName,
        });
        const staffId = await seedStaff(ctx, {
          shopId: seeded.shopId,
          name: `${testCase.shopName}スタッフ`,
          email: `${testCase.kind}-draft-staff@example.com`,
        });
        return { shopId: seeded.shopId, staffId };
      });

      await asManager.updateShopSettings({
        shopName: testCase.shopName,
        regularClosedDays: [],
        submissionPattern: testCase.submissionPattern,
      });
      const recruitmentInput = {
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
      };
      const recruitmentId = await asManager.createRecruitment(recruitmentInput);
      await t.run(async (ctx) => {
        await seedSession(ctx, {
          sessionToken: `${testCase.kind}-draft-session`,
          staffId,
          shopId,
          recruitmentId,
        });
      });

      vi.setSystemTime(SCENARIO_NOW + 1_000);
      await staff.submitShiftRequests({
        sessionToken: `${testCase.kind}-draft-session`,
        recruitmentId,
        acceptedLegal: true,
        submission:
          testCase.kind === "dateOnly"
            ? { kind: "dateOnly", workingDates: [recruitmentInput.periodStart] }
            : {
                kind: "shiftType",
                selections: [{ date: recruitmentInput.periodStart, optionId: "early" }],
              },
      });

      vi.setSystemTime(SCENARIO_NOW + 2_000);
      await asManager.saveShiftAssignments({
        recruitmentId,
        assignments: [
          {
            staffId,
            date: recruitmentInput.periodStart,
            startTime: "09:00",
            endTime: testCase.kind === "dateOnly" ? "22:00" : "15:00",
            ...(testCase.kind === "shiftType" ? { optionId: "early" } : {}),
          },
        ],
      });

      vi.setSystemTime(SCENARIO_NOW + 3_000);
      await staff.submitShiftRequests({
        sessionToken: `${testCase.kind}-draft-session`,
        recruitmentId,
        submission:
          testCase.kind === "dateOnly"
            ? { kind: "dateOnly", workingDates: [addDays(recruitmentInput.periodStart, 2)] }
            : {
                kind: "shiftType",
                selections: [{ date: recruitmentInput.periodStart, optionId: "late" }],
              },
      });

      const board = await asManager.getShiftBoardData(recruitmentId);
      expect(board?.shiftAssignments).toEqual([
        expect.objectContaining({
          staffId,
          date: recruitmentInput.periodStart,
          startTime: "09:00",
          endTime: testCase.kind === "dateOnly" ? "22:00" : "15:00",
          ...(testCase.kind === "shiftType" ? { optionId: "early" } : {}),
        }),
      ]);

      if (testCase.kind === "dateOnly") {
        expect(board?.requestedDates).toEqual([{ staffId, date: addDays(recruitmentInput.periodStart, 2) }]);
        expect(board?.requestedSlots).toEqual([]);
      } else {
        expect(board?.requestedDates).toEqual([]);
        expect(board?.requestedSlots).toEqual([
          {
            staffId,
            date: recruitmentInput.periodStart,
            startTime: "15:00",
            endTime: "22:00",
            optionId: "late",
          },
        ]);
      }
    }
  });

  it("時間指定・日ごと・勤務区分のシフト表を下書き保存し、確定通知と閲覧ページまで通る", async () => {
    const t = convexTest(schema, modules);

    const cases = [
      {
        kind: "time",
        managerSubject: `${MANAGER_SUBJECT}_board_time`,
        shopName: "時間指定シフト表店舗",
        submissionPattern: { kind: "time" as const, startTime: "09:00", endTime: "22:00" },
        assignment: { startTime: "10:00", endTime: "18:00" },
        expected: { startTime: "10:00", endTime: "18:00", optionId: undefined },
        notificationLabel: "10:00-18:00",
      },
      {
        kind: "dateOnly",
        managerSubject: `${MANAGER_SUBJECT}_board_date_only`,
        shopName: "日ごとシフト表店舗",
        submissionPattern: { kind: "dateOnly" as const },
        assignment: { startTime: "09:00", endTime: "22:00" },
        expected: { startTime: "09:00", endTime: "22:00", optionId: undefined },
        notificationLabel: "出勤",
      },
      {
        kind: "shiftType",
        managerSubject: `${MANAGER_SUBJECT}_board_shift_type`,
        shopName: "勤務区分シフト表店舗",
        submissionPattern: {
          kind: "shiftType" as const,
          options: [
            { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
            { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
          ],
        },
        assignment: { startTime: "15:00", endTime: "22:00", optionId: "late" },
        expected: { startTime: "15:00", endTime: "22:00", optionId: "late" },
        notificationLabel: "遅番（15:00-22:00）",
      },
    ];

    for (const testCase of cases) {
      const scenario = createScenario(t);
      const asManager = scenario.manager(testCase.managerSubject);
      const staff = scenario.staff();
      const { shopId, staffId } = await t.run(async (ctx) => {
        const seeded = await seedManagerShop(ctx, {
          subject: testCase.managerSubject,
          email: `${testCase.kind}-board-manager@example.com`,
          shopName: testCase.shopName,
        });
        const staffId = await seedStaff(ctx, {
          shopId: seeded.shopId,
          name: `${testCase.shopName}スタッフ`,
          email: `${testCase.kind}-board-staff@example.com`,
        });
        return { shopId: seeded.shopId, staffId };
      });

      await asManager.updateShopSettings({
        shopName: testCase.shopName,
        regularClosedDays: [],
        submissionPattern: testCase.submissionPattern,
      });
      const recruitmentInput = {
        periodStart: scenarioDate(7),
        periodEnd: scenarioDate(13),
        deadline: scenarioDate(3),
      };
      const recruitmentId = await asManager.createRecruitment(recruitmentInput);

      await asManager.saveShiftAssignments({
        recruitmentId,
        assignments: [
          {
            staffId,
            date: recruitmentInput.periodStart,
            ...testCase.assignment,
          },
        ],
      });

      const savedBoard = await asManager.getShiftBoardData(recruitmentId);
      expect(savedBoard?.shopId).toBe(shopId);
      expect(savedBoard?.shiftAssignments).toEqual([
        expect.objectContaining({
          staffId,
          date: recruitmentInput.periodStart,
          startTime: testCase.expected.startTime,
          endTime: testCase.expected.endTime,
          ...(testCase.expected.optionId ? { optionId: testCase.expected.optionId } : {}),
        }),
      ]);
      expect(savedBoard?.recruitment.draftSavedAt).toBeTypeOf("number");

      await asManager.confirmRecruitment(recruitmentId);

      const confirmedBoard = await asManager.getShiftBoardData(recruitmentId);
      expect(confirmedBoard?.recruitment.status).toBe("confirmed");
      expect(confirmedBoard?.recruitment.confirmedAt).toBeTypeOf("number");
      expect(confirmedBoard?.shiftAssignments).toEqual(savedBoard?.shiftAssignments);

      await t.run(async (ctx) => {
        await seedSession(ctx, {
          sessionToken: `${testCase.kind}-board-view-session`,
          staffId,
          shopId,
          recruitmentId,
          accessKind: "view",
        });
      });
      const staffView = await staff.getShiftViewData({
        sessionToken: `${testCase.kind}-board-view-session`,
        recruitmentId,
      });
      expect(staffView?.submissionPattern).toEqual(testCase.submissionPattern);
      expect(staffView?.assignments).toEqual([
        expect.objectContaining({
          staffId,
          date: recruitmentInput.periodStart,
          startTime: testCase.expected.startTime,
          endTime: testCase.expected.endTime,
          ...(testCase.expected.optionId ? { optionId: testCase.expected.optionId } : {}),
        }),
      ]);

      const confirmationData = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });
      const staffEntry = confirmationData?.staffEntries.find((entry) => entry.staffId === staffId);
      expect(staffEntry?.shifts).toContainEqual({
        date: "5/17(日)",
        timeLabel: testCase.notificationLabel,
      });
    }
  });

  it("定休日の日付には業務フロー上もシフト割当を保存できない", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);

    const { staffId } = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "closed-date-board-manager@example.com",
        shopName: "定休日シフト表店舗",
      });
      const staffId = await seedStaff(ctx, {
        shopId,
        name: "定休日確認スタッフ",
        email: "closed-date-board-staff@example.com",
      });
      return { shopId, staffId };
    });
    const recruitmentInput = {
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(9),
      deadline: scenarioDate(3),
    };
    const recruitmentId = await asManager.createRecruitment({
      ...recruitmentInput,
      shopClosedDates: [recruitmentInput.periodStart],
    });

    await expect(
      asManager.saveShiftAssignments({
        recruitmentId,
        assignments: [{ staffId, date: recruitmentInput.periodStart, startTime: "10:00", endTime: "18:00" }],
      }),
    ).rejects.toThrow("定休日にはシフトを登録できません");
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
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: Date.now(),
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
    });

    // Act / Assert: 確定済み募集への催促操作は拒否される。
    await expect(asManager.sendReminderEmails(recruitmentId)).rejects.toThrow("募集中のシフトだけ");
  });
});
