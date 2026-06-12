import { describe, expect, test } from "vitest";
import { type ComparableAssignment, isAssignmentsEqual } from "./isAssignmentsEqual";

const base: ComparableAssignment = {
  staffId: "staff-1",
  date: "2026-06-01",
  startTime: "10:00",
  endTime: "18:00",
};

describe("isAssignmentsEqual", () => {
  test("両方空: 一致", () => {
    expect(isAssignmentsEqual([], [])).toBe(true);
  });

  test("同一内容: 一致", () => {
    expect(isAssignmentsEqual([base], [{ ...base }])).toBe(true);
  });

  test("並び順が違うだけ: 一致", () => {
    const other = { ...base, staffId: "staff-2" };
    expect(isAssignmentsEqual([base, other], [other, base])).toBe(true);
  });

  test("件数が違う: 不一致", () => {
    expect(isAssignmentsEqual([base], [])).toBe(false);
    expect(isAssignmentsEqual([base], [base, { ...base, date: "2026-06-02" }])).toBe(false);
  });

  test("時間が違う: 不一致", () => {
    expect(isAssignmentsEqual([base], [{ ...base, endTime: "19:00" }])).toBe(false);
  });

  test("positionIdの有無: 不一致", () => {
    expect(isAssignmentsEqual([base], [{ ...base, positionId: "position-1" }])).toBe(false);
  });

  test("optionIdの違い: 不一致", () => {
    expect(isAssignmentsEqual([{ ...base, optionId: "option-1" }], [{ ...base, optionId: "option-2" }])).toBe(false);
  });

  test("undefinedのオプション項目同士: 一致", () => {
    expect(isAssignmentsEqual([{ ...base, optionId: undefined }], [base])).toBe(true);
  });
});
