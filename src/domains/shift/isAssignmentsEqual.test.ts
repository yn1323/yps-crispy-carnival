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

  test("休憩の有無: 不一致", () => {
    expect(isAssignmentsEqual([base], [{ ...base, breaks: [{ startTime: "12:00", endTime: "13:00" }] }])).toBe(false);
  });

  test("休憩の時刻が違う: 不一致", () => {
    expect(
      isAssignmentsEqual(
        [{ ...base, breaks: [{ startTime: "12:00", endTime: "13:00" }] }],
        [{ ...base, breaks: [{ startTime: "12:00", endTime: "12:45" }] }],
      ),
    ).toBe(false);
  });

  test("休憩の件数が違う: 不一致", () => {
    const first = { startTime: "12:00", endTime: "13:00" };
    expect(
      isAssignmentsEqual(
        [{ ...base, breaks: [first] }],
        [{ ...base, breaks: [first, { startTime: "15:00", endTime: "15:15" }] }],
      ),
    ).toBe(false);
  });

  test("休憩の並び順が違うだけ: 一致", () => {
    const first = { startTime: "12:00", endTime: "13:00" };
    const second = { startTime: "15:00", endTime: "15:15" };
    expect(isAssignmentsEqual([{ ...base, breaks: [first, second] }], [{ ...base, breaks: [second, first] }])).toBe(
      true,
    );
  });

  test("休憩が空の配列と未指定: 一致", () => {
    expect(isAssignmentsEqual([{ ...base, breaks: [] }], [base])).toBe(true);
  });

  test("別の勤務へ休憩が移った: 不一致", () => {
    const other = { ...base, date: "2026-06-02" };
    const breaks = [{ startTime: "12:00", endTime: "13:00" }];
    expect(isAssignmentsEqual([{ ...base, breaks }, other], [base, { ...other, breaks }])).toBe(false);
  });

  test("仮の印の有無: 不一致", () => {
    expect(isAssignmentsEqual([base], [{ ...base, isProvisional: true }])).toBe(false);
  });

  test("仮の印がfalseと未指定: 一致", () => {
    expect(isAssignmentsEqual([{ ...base, isProvisional: false }], [base])).toBe(true);
  });

  test("休憩と仮の印が同じ: 一致", () => {
    const withDetail = { ...base, breaks: [{ startTime: "12:00", endTime: "13:00" }], isProvisional: true };
    expect(isAssignmentsEqual([withDetail], [structuredClone(withDetail)])).toBe(true);
  });
});
