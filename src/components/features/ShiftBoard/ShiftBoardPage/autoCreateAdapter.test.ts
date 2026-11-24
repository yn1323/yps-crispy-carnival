import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { buildAutoAssignments } from "@/convex/shiftBoard/autoCreate/buildAutoAssignments";
import { validateShiftAssignments } from "@/convex/shiftBoard/validation";
import { computeAssignmentWarnings } from "@/src/domains/shift/assignmentWarnings";
import { applyAutoAssignments } from "@/src/domains/shift/autoAssignments";
import { buildAssignments } from "@/src/domains/shift/buildAssignments";
import { getDateRange } from "@/src/domains/shift/date";
import type { PositionType, StaffType } from "@/src/domains/shift/types";
import type { ShiftBoardData, ShiftBoardStaffingData } from "../types";
import { toAutoCreateInput } from "./autoCreateAdapter";
import { buildShiftData } from "./buildShiftData";

// 自動作成の結果を画面の下書きへ取り込んだあとで、確認事項と保存の検査がどちらも0件になることを、3つの募集方式で確かめる。
// 2026-08-17は月曜日。08-19は定休日にする。

const staffId = (name: string) => `staff-${name}` as Id<"staffs">;
const hallId = "position-hall" as Id<"positions">;
const kitchenId = "position-kitchen" as Id<"positions">;
const PERIOD = { start: "2026-08-17", end: "2026-08-21" };
const CLOSED_DATE = "2026-08-19";
const OPEN_DATES = ["2026-08-17", "2026-08-18", "2026-08-20", "2026-08-21"];

const SHIFT_TYPE_PATTERN: ShiftBoardData["submissionPattern"] = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

const baseData = (overrides: Partial<ShiftBoardData>): ShiftBoardData => ({
  shopId: "shop-a" as Id<"shops">,
  shiftDetailMode: true,
  canWriteBusinessData: true,
  businessWriteBlockReason: null,
  recruitment: {
    _id: "recruitment-a" as Id<"recruitments">,
    periodStart: PERIOD.start,
    periodEnd: PERIOD.end,
    deadline: "2026-08-10",
    shopClosedDates: [CLOSED_DATE],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: null,
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [
    { _id: staffId("a"), name: "A", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: staffId("b"), name: "B", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: staffId("c"), name: "C", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: staffId("d"), name: "D", isSubmitted: true, wasSubmittedAtDraft: false },
    // 未提出の人と削除済みの人には入れない。
    { _id: staffId("unsubmitted"), name: "未提出", isSubmitted: false, wasSubmittedAtDraft: false },
    { _id: staffId("removed"), name: "削除済み", isSubmitted: true, isRemoved: true, wasSubmittedAtDraft: false },
  ],
  requestedSlots: [],
  requestedDates: [],
  shiftAssignments: [],
  positions: [
    { _id: hallId, name: "ホール", color: "#0d9488", isDefault: true },
    { _id: kitchenId, name: "キッチン", color: "#f97316", isDefault: false },
  ],
  timeRange: { start: 9, end: 22, unit: 30 },
  ...overrides,
});

const baseStaffing = (
  requirementsOf: (date: string) => ShiftBoardStaffingData["days"][number]["requirements"],
): ShiftBoardStaffingData => ({
  breakRule: null,
  // cはキッチンが担当外、dはホールが見習いである。
  staffProfiles: [
    { staffId: staffId("c"), positionSkills: [{ positionId: kitchenId, level: "unavailable" }] },
    { staffId: staffId("d"), positionSkills: [{ positionId: hallId, level: "newcomer" }] },
  ],
  isAiDraftConfigured: false,
  aiDraftRemainingCount: 3,
  isLocked: false,
  templates: [],
  days: getDateRange(PERIOD.start, PERIOD.end).map((date) => ({
    date,
    source: "weekday",
    templateId: null,
    templateName: "平日",
    requirements: requirementsOf(date),
  })),
});

function createAndApply(data: ShiftBoardData, staffing: ShiftBoardStaffingData) {
  const skillsByStaffId = new Map(staffing.staffProfiles.map((profile) => [profile.staffId, profile.positionSkills]));
  const staffs: StaffType[] = data.staffs.map((staff) => ({
    id: staff._id,
    name: staff.name,
    isSubmitted: staff.isSubmitted,
    isRemoved: staff.isRemoved,
    positionSkills: skillsByStaffId.get(staff._id),
  }));
  const positions: PositionType[] = data.positions.map((position) => ({
    id: position._id,
    name: position.name,
    color: position.color,
    isDefault: position.isDefault,
  }));
  const dates = getDateRange(PERIOD.start, PERIOD.end);
  const initialShifts = buildShiftData(data, staffs, dates, { createsRequestCandidates: false });
  const result = buildAutoAssignments(
    toAutoCreateInput({
      data,
      staffs,
      positions,
      staffing,
      history: { recruitmentCount: 0, staffs: [] },
      includesBreaks: true,
    }),
  );
  const shifts = applyAutoAssignments({ shifts: initialShifts, created: result.shifts, positions });

  const warnings = computeAssignmentWarnings({ shifts, staffs, pattern: data.submissionPattern, positions });
  const issues = validateShiftAssignments({
    assignments: buildAssignments<Id<"staffs">, Id<"positions">>(shifts, new Set(data.recruitment.shopClosedDates), {
      submissionPatternKind: data.submissionPattern.kind,
      defaultPositionId: hallId,
    }),
    periodStart: data.recruitment.periodStart,
    periodEnd: data.recruitment.periodEnd,
    closedDates: data.recruitment.shopClosedDates,
    pattern: data.submissionPattern,
  });
  const worked = shifts.filter((shift) => shift.positions.length > 0);
  return { result, shifts, worked, warnings, issues };
}

describe("自動作成の結果を下書きへ取り込んだあとの確認事項と保存の検査", () => {
  it("時間指定では、勤務と休憩を作り、確認事項も保存の検査の指摘も出ない", () => {
    const data = baseData({
      requestedSlots: [...OPEN_DATES, CLOSED_DATE].flatMap((date) => [
        { staffId: staffId("a"), date, startTime: "09:00", endTime: "18:00" },
        { staffId: staffId("b"), date, startTime: "12:00", endTime: "22:00" },
        { staffId: staffId("c"), date, startTime: "10:00", endTime: "16:00" },
        { staffId: staffId("d"), date, startTime: "16:00", endTime: "22:00" },
        { staffId: staffId("removed"), date, startTime: "09:00", endTime: "22:00" },
      ]),
    });
    const staffing = baseStaffing(() => ({
      kind: "time",
      bars: [
        { positionId: hallId, startTime: "09:00", endTime: "22:00" },
        { positionId: hallId, startTime: "11:00", endTime: "14:00" },
        { positionId: kitchenId, startTime: "11:00", endTime: "21:00" },
      ],
    }));

    const { worked, warnings, issues } = createAndApply(data, staffing);

    expect(warnings).toEqual([]);
    expect(issues).toEqual([]);
    expect(worked.length).toBeGreaterThanOrEqual(OPEN_DATES.length * 2);
    expect(worked.some((shift) => (shift.breaks?.length ?? 0) > 0)).toBe(true);
    expect(worked.every((shift) => OPEN_DATES.includes(shift.date))).toBe(true);
    expect(
      worked.every((shift) =>
        [staffId("a"), staffId("b"), staffId("c"), staffId("d")].includes(shift.staffId as never),
      ),
    ).toBe(true);
  });

  it("パターン選択では、希望した勤務パターンだけに入り、確認事項も保存の検査の指摘も出ない", () => {
    const early = { startTime: "09:00", endTime: "15:00", optionId: "early" };
    const late = { startTime: "15:00", endTime: "22:00", optionId: "late" };
    const data = baseData({
      submissionPattern: SHIFT_TYPE_PATTERN,
      requestedSlots: [...OPEN_DATES, CLOSED_DATE].flatMap((date) => [
        { staffId: staffId("a"), date, ...early },
        { staffId: staffId("a"), date, ...late },
        { staffId: staffId("b"), date, ...late },
        { staffId: staffId("c"), date, ...early },
        { staffId: staffId("d"), date, ...early },
        { staffId: staffId("removed"), date, ...early },
      ]),
    });
    const staffing = baseStaffing(() => ({
      kind: "shiftType",
      options: [
        {
          optionId: "early",
          counts: [
            { positionId: hallId, count: 2 },
            { positionId: kitchenId, count: 1 },
          ],
        },
        { optionId: "late", counts: [{ positionId: hallId, count: 2 }] },
      ],
    }));

    const { worked, warnings, issues } = createAndApply(data, staffing);

    expect(warnings).toEqual([]);
    expect(issues).toEqual([]);
    expect(worked.length).toBeGreaterThanOrEqual(OPEN_DATES.length * 3);
    expect(worked.every((shift) => OPEN_DATES.includes(shift.date))).toBe(true);
  });

  it("日付選択では、希望した日だけに入り、確認事項も保存の検査の指摘も出ない", () => {
    const data = baseData({
      submissionPattern: { kind: "dateOnly" },
      requestedDates: [
        ...[...OPEN_DATES, CLOSED_DATE].map((date) => ({ staffId: staffId("a"), date })),
        ...OPEN_DATES.slice(0, 2).map((date) => ({ staffId: staffId("b"), date })),
        ...OPEN_DATES.map((date) => ({ staffId: staffId("c"), date })),
        ...OPEN_DATES.map((date) => ({ staffId: staffId("d"), date })),
        ...OPEN_DATES.map((date) => ({ staffId: staffId("removed"), date })),
      ],
    });
    const staffing = baseStaffing(() => ({
      kind: "dateOnly",
      counts: [
        { positionId: hallId, count: 2 },
        { positionId: kitchenId, count: 1 },
      ],
    }));

    const { worked, warnings, issues } = createAndApply(data, staffing);

    expect(warnings).toEqual([]);
    expect(issues).toEqual([]);
    expect(worked.length).toBeGreaterThanOrEqual(OPEN_DATES.length * 2);
    expect(worked.every((shift) => OPEN_DATES.includes(shift.date))).toBe(true);
  });
});
