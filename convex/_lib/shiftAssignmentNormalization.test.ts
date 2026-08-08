import { describe, expect, it } from "vitest";
import { normalizeExactAdjacentTimeAssignments } from "./shiftAssignmentNormalization";

const base = {
  staffId: "staff-a",
  date: "2026-08-10",
  positionId: "position-a",
};

describe("shift assignment normalization", () => {
  it("同一semantic groupの完全隣接だけを統合し、正の空白と別positionを保持する", () => {
    expect(
      normalizeExactAdjacentTimeAssignments([
        { ...base, startTime: "09:00", endTime: "10:00" },
        { ...base, startTime: "10:00", endTime: "12:00" },
        { ...base, startTime: "13:00", endTime: "14:00" },
        { ...base, positionId: "position-b", startTime: "14:00", endTime: "15:00" },
      ]),
    ).toEqual([
      { ...base, startTime: "09:00", endTime: "12:00" },
      { ...base, startTime: "13:00", endTime: "14:00" },
      { ...base, positionId: "position-b", startTime: "14:00", endTime: "15:00" },
    ]);
  });

  it("別positionを含むoverlapまたは不正値があるstaff/dateは一部だけを正規化しない", () => {
    const assignments = [
      { ...base, startTime: "09:00", endTime: "11:00" },
      { ...base, positionId: "position-b", startTime: "10:00", endTime: "12:00" },
      { ...base, staffId: "staff-b", date: "invalid", startTime: "12:00", endTime: "13:00" },
      { ...base, staffId: "staff-b", date: "invalid", startTime: "13:00", endTime: "14:00" },
    ];

    expect(normalizeExactAdjacentTimeAssignments(assignments)).toEqual(assignments);
  });

  it("option付きstaff/dateは時間入力方式の自動補正対象にしない", () => {
    const assignments = [
      { ...base, startTime: "09:00", endTime: "10:00", optionId: "early" },
      { ...base, startTime: "10:00", endTime: "11:00" },
    ];

    expect(normalizeExactAdjacentTimeAssignments(assignments)).toEqual(assignments);
  });
});
