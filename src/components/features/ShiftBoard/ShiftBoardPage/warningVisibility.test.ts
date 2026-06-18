import { describe, expect, it } from "vitest";
import type { AssignmentWarning } from "@/src/domains/shift/assignmentWarnings";
import type { PositionSegment, ShiftData } from "@/src/domains/shift/types";
import { visibleAssignmentWarnings } from "./warningVisibility";

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
        isConfirmed: true,
      }),
    ).toEqual([]);
  });
});
