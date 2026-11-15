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

  it("option付きstaff/dateは時間指定の自動補正対象にしない", () => {
    const assignments = [
      { ...base, startTime: "09:00", endTime: "10:00", optionId: "early" },
      { ...base, startTime: "10:00", endTime: "11:00" },
    ];

    expect(normalizeExactAdjacentTimeAssignments(assignments)).toEqual(assignments);
  });

  it("隣接を統合しても休憩を落とさず、開始順に並べる", () => {
    expect(
      normalizeExactAdjacentTimeAssignments([
        { ...base, startTime: "13:00", endTime: "18:00", breaks: [{ startTime: "15:00", endTime: "15:30" }] },
        {
          ...base,
          startTime: "09:00",
          endTime: "13:00",
          breaks: [
            { startTime: "12:00", endTime: "12:30" },
            { startTime: "10:00", endTime: "10:15" },
          ],
        },
        { ...base, startTime: "18:00", endTime: "20:00" },
      ]),
    ).toEqual([
      {
        ...base,
        startTime: "09:00",
        endTime: "20:00",
        breaks: [
          { startTime: "10:00", endTime: "10:15" },
          { startTime: "12:00", endTime: "12:30" },
          { startTime: "15:00", endTime: "15:30" },
        ],
      },
    ]);
  });

  it("休憩のない勤務どうしを統合しても、空の休憩を足さない", () => {
    const [merged] = normalizeExactAdjacentTimeAssignments([
      { ...base, startTime: "09:00", endTime: "13:00", breaks: [] },
      { ...base, startTime: "13:00", endTime: "18:00" },
    ]);

    expect(merged).toEqual({ ...base, startTime: "09:00", endTime: "18:00" });
    expect(Object.keys(merged).sort()).toEqual(["date", "endTime", "positionId", "staffId", "startTime"]);
  });

  it("統合しない勤務の休憩と仮の印は、そのまま残す", () => {
    const assignments = [
      {
        ...base,
        startTime: "09:00",
        endTime: "12:00",
        breaks: [
          { startTime: "11:00", endTime: "11:30" },
          { startTime: "10:00", endTime: "10:15" },
        ],
        isProvisional: true,
      },
      { ...base, startTime: "13:00", endTime: "18:00" },
    ];

    expect(normalizeExactAdjacentTimeAssignments(assignments)).toEqual(assignments);
  });

  it("仮の印は、統合するすべての勤務が仮のときだけ残す", () => {
    expect(
      normalizeExactAdjacentTimeAssignments([
        { ...base, startTime: "09:00", endTime: "12:00", isProvisional: true },
        { ...base, startTime: "12:00", endTime: "15:00", isProvisional: true },
        { ...base, staffId: "staff-b", startTime: "09:00", endTime: "12:00", isProvisional: true },
        { ...base, staffId: "staff-b", startTime: "12:00", endTime: "15:00" },
        { ...base, staffId: "staff-c", startTime: "09:00", endTime: "12:00", isProvisional: false },
        { ...base, staffId: "staff-c", startTime: "12:00", endTime: "15:00", isProvisional: true },
      ]),
    ).toStrictEqual([
      { ...base, startTime: "09:00", endTime: "15:00", isProvisional: true },
      { ...base, staffId: "staff-b", startTime: "09:00", endTime: "15:00" },
      { ...base, staffId: "staff-c", startTime: "09:00", endTime: "15:00" },
    ]);
  });

  it("勤務の境目で分かれていた休憩は、勤務の統合に合わせて1件へ戻す", () => {
    expect(
      normalizeExactAdjacentTimeAssignments([
        { ...base, startTime: "09:00", endTime: "13:00", breaks: [{ startTime: "12:30", endTime: "13:00" }] },
        {
          ...base,
          startTime: "13:00",
          endTime: "18:00",
          breaks: [
            { startTime: "13:00", endTime: "13:30" },
            { startTime: "16:00", endTime: "16:15" },
          ],
        },
      ]),
    ).toStrictEqual([
      {
        ...base,
        startTime: "09:00",
        endTime: "18:00",
        breaks: [
          { startTime: "12:30", endTime: "13:30" },
          { startTime: "16:00", endTime: "16:15" },
        ],
      },
    ]);
  });
});
