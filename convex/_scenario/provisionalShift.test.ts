import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  MANAGER_SUBJECT,
  SCENARIO_NOW,
  type ScenarioTest,
  scenarioDate,
  seedSession,
  seedStaff,
} from "../_test/scenarioBuilders";
import { createScenario } from "../_test/scenarioFixtures";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

// SCENARIO_NOW（2026-05-10）は日曜日。前回の募集を当日からの1週間、今回の募集をその翌週に置く。
const PREVIOUS_MONDAY = scenarioDate(1);
const PREVIOUS_TUESDAY = scenarioDate(2);
const CURRENT_MONDAY = scenarioDate(8);
const CURRENT_TUESDAY = scenarioDate(9);
const CURRENT_WEDNESDAY = scenarioDate(10);

const byDateAndStaff = <T extends { date: string; staffId: string }>(assignments: T[]) =>
  assignments.slice().sort((a, b) => a.date.localeCompare(b.date) || a.staffId.localeCompare(b.staffId));

async function readStoredAssignments(t: ScenarioTest, recruitmentId: Id<"recruitments">) {
  const assignments = await t.run(async (ctx) =>
    ctx.db
      .query("shiftAssignments")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
      .collect(),
  );
  return byDateAndStaff(assignments.map(({ _id, _creationTime, recruitmentId: _recruitmentId, ...rest }) => rest));
}

describe("未提出者の仮の勤務シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("仮の勤務を保存したあとで提出したスタッフの仮の勤務は、表示から外れて確定にも残らず、未提出のままのスタッフの仮の勤務は残る", async () => {
    const t = convexTest(schema, modules);
    const scenario = createScenario(t);
    const asManager = scenario.manager(MANAGER_SUBJECT);
    const staff = scenario.staff();

    // Arrange: 前回確定の募集で2人が勤務していた店舗に、今回の募集を作る。
    const ids = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: MANAGER_SUBJECT,
        email: "provisional-manager@example.com",
        shopName: "仮の勤務店舗",
      });
      const defaultPositionId = await ctx.db.insert("positions", {
        shopId,
        name: "シフト",
        color: "#3b82f6",
        sortOrder: 0,
        isDefault: true,
        isDeleted: false,
      });
      const hallPositionId = await ctx.db.insert("positions", {
        shopId,
        name: "ホール",
        color: "#8b5cf6",
        sortOrder: 1,
        isDefault: false,
        isDeleted: false,
      });
      const laterSubmittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "あとから提出するスタッフ",
        email: "later-submitted@example.com",
      });
      const unsubmittedStaffId = await seedStaff(ctx, {
        shopId,
        name: "未提出のままのスタッフ",
        email: "still-unsubmitted@example.com",
      });
      const previousRecruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: scenarioDate(0),
        periodEnd: scenarioDate(6),
        deadline: scenarioDate(-3),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: SCENARIO_NOW - 1_000,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const previousAssignments = [
        {
          staffId: laterSubmittedStaffId,
          date: PREVIOUS_MONDAY,
          startTime: "10:00",
          endTime: "18:00",
          positionId: hallPositionId,
        },
        {
          staffId: unsubmittedStaffId,
          date: PREVIOUS_MONDAY,
          startTime: "12:00",
          endTime: "20:00",
          positionId: defaultPositionId,
          breaks: [{ startTime: "15:00", endTime: "16:00" }],
        },
        {
          staffId: unsubmittedStaffId,
          date: PREVIOUS_TUESDAY,
          startTime: "09:00",
          endTime: "15:00",
          positionId: hallPositionId,
        },
      ];
      for (const assignment of previousAssignments) {
        await ctx.db.insert("shiftAssignments", { recruitmentId: previousRecruitmentId, ...assignment });
      }
      return { shopId, defaultPositionId, hallPositionId, laterSubmittedStaffId, unsubmittedStaffId };
    });
    const recruitmentId = await asManager.createRecruitment({
      periodStart: scenarioDate(7),
      periodEnd: scenarioDate(13),
      deadline: scenarioDate(3),
    });
    await t.run(async (ctx) => {
      await seedSession(ctx, {
        sessionToken: "provisional-later-submit-session",
        staffId: ids.laterSubmittedStaffId,
        shopId: ids.shopId,
        recruitmentId,
      });
      await seedSession(ctx, {
        sessionToken: "provisional-later-view-session",
        staffId: ids.laterSubmittedStaffId,
        shopId: ids.shopId,
        recruitmentId,
        accessKind: "view",
      });
    });
    const laterSubmittedProvisional = {
      staffId: ids.laterSubmittedStaffId,
      date: CURRENT_MONDAY,
      startTime: "10:00",
      endTime: "18:00",
      positionId: ids.hallPositionId,
    };
    const unsubmittedProvisionals = [
      {
        staffId: ids.unsubmittedStaffId,
        date: CURRENT_MONDAY,
        startTime: "12:00",
        endTime: "20:00",
        positionId: ids.defaultPositionId,
        breaks: [{ startTime: "15:00", endTime: "16:00" }],
      },
      {
        staffId: ids.unsubmittedStaffId,
        date: CURRENT_TUESDAY,
        startTime: "09:00",
        endTime: "15:00",
        positionId: ids.hallPositionId,
      },
    ];

    // Act: シフト担当者が、未提出者の仮の勤務の候補を取得する。
    const staffing = await asManager.getShiftBoardStaffing(recruitmentId);
    const candidates = await asManager.getProvisionalAssignments(recruitmentId);

    // Assert: 2人とも未提出なので、前回確定の同じ曜日の勤務が2人分の候補になる。
    expect(staffing?.hasPreviousConfirmedRecruitment).toBe(true);
    expect(candidates).not.toBeNull();
    expect(byDateAndStaff(candidates ?? [])).toStrictEqual(
      byDateAndStaff([laterSubmittedProvisional, ...unsubmittedProvisionals]),
    );

    // Act: 候補を仮の勤務として保存する。
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    await asManager.saveShiftAssignments({
      recruitmentId,
      assignments: (candidates ?? []).map((candidate) => ({ ...candidate, isProvisional: true })),
    });

    // Assert: シフト表に、2人分の勤務が仮の印付きで出る。
    const savedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(savedBoard).not.toBeNull();
    expect(byDateAndStaff(savedBoard?.shiftAssignments ?? [])).toStrictEqual(
      byDateAndStaff(
        [laterSubmittedProvisional, ...unsubmittedProvisionals].map((assignment) => ({
          ...assignment,
          isProvisional: true,
        })),
      ),
    );

    // Act: 1人が、仮の勤務とは別の日に希望を提出する。
    vi.setSystemTime(SCENARIO_NOW + 2_000);
    await staff.submitShiftRequests({
      sessionToken: "provisional-later-submit-session",
      recruitmentId,
      acceptedLegal: true,
      submission: { kind: "time", requests: [{ date: CURRENT_WEDNESDAY, startTime: "11:00", endTime: "17:00" }] },
    });

    // Assert: 提出したスタッフの仮の勤務はシフト表から外れ、希望が候補として出る。保存し直すまでDBには残る。
    const submittedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(submittedBoard).not.toBeNull();
    expect(
      (submittedBoard?.staffs ?? [])
        .map(({ _id, isSubmitted }) => ({ _id, isSubmitted }))
        .sort((a, b) => a._id.localeCompare(b._id)),
    ).toEqual(
      [
        { _id: ids.laterSubmittedStaffId, isSubmitted: true },
        { _id: ids.unsubmittedStaffId, isSubmitted: false },
      ].sort((a, b) => a._id.localeCompare(b._id)),
    );
    expect(byDateAndStaff(submittedBoard?.shiftAssignments ?? [])).toStrictEqual(
      unsubmittedProvisionals.map((assignment) => ({ ...assignment, isProvisional: true })),
    );
    expect(submittedBoard?.requestedSlots).toEqual([
      { staffId: ids.laterSubmittedStaffId, date: CURRENT_WEDNESDAY, startTime: "11:00", endTime: "17:00" },
    ]);
    expect(byDateAndStaff((await asManager.getProvisionalAssignments(recruitmentId)) ?? [])).toStrictEqual(
      unsubmittedProvisionals,
    );
    expect(await readStoredAssignments(t, recruitmentId)).toHaveLength(3);

    // Act: 保存し直さずに、シフトを確定する。
    vi.setSystemTime(SCENARIO_NOW + 3_000);
    const confirmResult = await asManager.confirmRecruitment(recruitmentId);

    // Assert: 提出したスタッフの仮の勤務はDBに残らず、未提出のままのスタッフの仮の勤務は残る。
    expect(confirmResult).toEqual({ status: "scheduled", notifiedStaffCount: 2 });
    expect(await readStoredAssignments(t, recruitmentId)).toStrictEqual(
      unsubmittedProvisionals.map((assignment) => ({ ...assignment, isProvisional: true })),
    );
    const confirmedBoard = await asManager.getShiftBoardData(recruitmentId);
    expect(confirmedBoard?.recruitment.status).toBe("confirmed");
    expect(byDateAndStaff(confirmedBoard?.shiftAssignments ?? [])).toStrictEqual(
      unsubmittedProvisionals.map((assignment) => ({ ...assignment, isProvisional: true })),
    );
    // 確定済みの募集では、仮の勤務の候補を出さない。
    expect(await asManager.getProvisionalAssignments(recruitmentId)).toEqual([]);

    // Assert: スタッフ向けの確定シフトと確定通知にも、提出したスタッフの仮の勤務は出ない。仮の印はスタッフへ返さない。
    const staffView = await staff.getShiftViewData({
      sessionToken: "provisional-later-view-session",
      recruitmentId,
    });
    expect(staffView).not.toBeNull();
    expect(byDateAndStaff(staffView?.assignments ?? [])).toStrictEqual(unsubmittedProvisionals);
    const confirmationData = await t.query(internal.notification.queries.getConfirmationEmailData, { recruitmentId });
    const shiftLabelsByStaffId = new Map(
      (confirmationData?.staffEntries ?? []).map((entry) => [
        entry.staffId,
        entry.shifts.flatMap((shift) => (shift.timeLabel === null ? [] : [shift.timeLabel])),
      ]),
    );
    expect(confirmationData?.staffEntries).toHaveLength(2);
    expect(shiftLabelsByStaffId.get(ids.laterSubmittedStaffId)).toEqual([]);
    expect(shiftLabelsByStaffId.get(ids.unsubmittedStaffId)).toEqual([
      "12:00-20:00 シフト（休憩 15:00-16:00）",
      "09:00-15:00 ホール",
    ]);
  });
});
