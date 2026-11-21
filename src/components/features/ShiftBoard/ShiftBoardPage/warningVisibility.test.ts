import { describe, expect, it } from "vitest";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import type { PositionSegment, ShiftData } from "@/src/domains/shift/types";
import { visibleAssignmentWarnings, visibleNewcomerOnlyPeriods } from "./warningVisibility";

const segment = (start: string, end: string): PositionSegment => ({
  id: `segment-${start}-${end}`,
  positionId: "position-1",
  positionName: "シフト",
  color: "#3b82f6",
  start,
  end,
});

const shift = (staffId: string, date: string, positions: PositionSegment[] = []): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffId,
  date,
  requestedTime: null,
  positions,
});

const warning = (staffId: string, date: string): AssignmentWarning => ({
  code: "OUTSIDE_REQUESTED_TIME",
  staffId,
  date,
  message: "希望時間の外に勤務があります",
});

describe("visibleAssignmentWarnings", () => {
  it("未確定ではすべてのwarningを表示対象にする", () => {
    const warnings = [warning("staff-1", "2026-01-20"), warning("staff-2", "2026-01-20")];

    expect(
      visibleAssignmentWarnings({
        warnings,
        currentShifts: [shift("staff-1", "2026-01-20", [segment("09:00", "12:00")])],
        baselineShifts: [],
        closedDateSet: new Set(),
        buildAssignmentsOptions: { submissionPatternKind: "time" },
        isConfirmed: false,
      }),
    ).toEqual(warnings);
  });

  it("確定済みではbaselineから変更されたセルのwarningだけを表示対象にする", () => {
    const visibleWarning = warning("staff-1", "2026-01-20");
    const hiddenWarning = warning("staff-2", "2026-01-20");

    expect(
      visibleAssignmentWarnings({
        warnings: [visibleWarning, hiddenWarning],
        currentShifts: [
          shift("staff-1", "2026-01-20", [segment("09:00", "13:00")]),
          shift("staff-2", "2026-01-20", [segment("10:00", "14:00")]),
        ],
        baselineShifts: [
          shift("staff-1", "2026-01-20", [segment("09:00", "12:00")]),
          shift("staff-2", "2026-01-20", [segment("10:00", "14:00")]),
        ],
        closedDateSet: new Set(),
        buildAssignmentsOptions: { submissionPatternKind: "time" },
        isConfirmed: true,
      }),
    ).toEqual([visibleWarning]);
  });

  it("確定済みで割当変更がなければwarningを表示しない", () => {
    expect(
      visibleAssignmentWarnings({
        warnings: [warning("staff-1", "2026-01-20")],
        currentShifts: [shift("staff-1", "2026-01-20", [segment("09:00", "12:00")])],
        baselineShifts: [shift("staff-1", "2026-01-20", [segment("09:00", "12:00")])],
        closedDateSet: new Set(),
        buildAssignmentsOptions: { submissionPatternKind: "time" },
        isConfirmed: true,
      }),
    ).toEqual([]);
  });

  it("確定済みでは完全隣接する分割表現だけの差を変更扱いにしない", () => {
    expect(
      visibleAssignmentWarnings({
        warnings: [warning("staff-1", "2026-01-20")],
        currentShifts: [shift("staff-1", "2026-01-20", [segment("09:00", "12:00"), segment("12:00", "14:00")])],
        baselineShifts: [shift("staff-1", "2026-01-20", [segment("09:00", "14:00")])],
        closedDateSet: new Set(),
        buildAssignmentsOptions: { submissionPatternKind: "time" },
        isConfirmed: true,
      }),
    ).toEqual([]);
  });
});

describe("visibleNewcomerOnlyPeriods", () => {
  const period = (date: string): NewcomerOnlyPeriod => ({
    date,
    positionId: "position-1",
    scope: { kind: "time", start: "09:00", end: "12:00" },
  });
  const periods = [period("2026-01-20"), period("2026-01-21")];
  const options = {
    closedDateSet: new Set<string>(),
    buildAssignmentsOptions: { submissionPatternKind: "time" as const },
  };

  it("未確定では、すべての見習いだけの時間帯を出す", () => {
    expect(
      visibleNewcomerOnlyPeriods({ periods, currentShifts: [], baselineShifts: [], ...options, isConfirmed: false }),
    ).toEqual(periods);
  });

  it("確定済みでは、開いた時点からだれかの勤務を変えた日のものだけを出す", () => {
    expect(
      visibleNewcomerOnlyPeriods({
        periods,
        currentShifts: [
          shift("staff-1", "2026-01-20", [segment("09:00", "13:00")]),
          shift("staff-2", "2026-01-21", [segment("09:00", "12:00")]),
        ],
        baselineShifts: [
          shift("staff-1", "2026-01-20", [segment("09:00", "12:00")]),
          shift("staff-2", "2026-01-21", [segment("09:00", "12:00")]),
        ],
        ...options,
        isConfirmed: true,
      }),
    ).toEqual([period("2026-01-20")]);
  });

  it("確定済みで、勤務を変えていなければ、何も出さない", () => {
    const shifts = [shift("staff-1", "2026-01-20", [segment("09:00", "12:00")])];

    expect(
      visibleNewcomerOnlyPeriods({
        periods,
        currentShifts: shifts,
        baselineShifts: shifts,
        ...options,
        isConfirmed: true,
      }),
    ).toEqual([]);
  });
});
