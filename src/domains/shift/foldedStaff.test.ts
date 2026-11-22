import { describe, expect, it } from "vitest";
import { isFoldedStaff, isTimeStaffFolded } from "./foldedStaff";
import type { ShiftData } from "./types";

describe("isFoldedStaff", () => {
  const empty = { isSubmitted: true, hasRequest: false, hasAssignment: false, hasNote: false };

  it("提出済みで、希望も割り当ても連絡事項もない人をたたむ", () => {
    expect(isFoldedStaff(empty)).toBe(true);
  });

  it.each([
    ["希望がある", { hasRequest: true }],
    ["割り当てがある", { hasAssignment: true }],
    ["連絡事項がある", { hasNote: true }],
    ["未提出である", { isSubmitted: false }],
  ])("%s人は、たたまない", (_label, override) => {
    expect(isFoldedStaff({ ...empty, ...override })).toBe(false);
  });
});

describe("isTimeStaffFolded", () => {
  const shift = (overrides: Partial<ShiftData> = {}): ShiftData => ({
    id: "shift-1",
    staffId: "staff-1",
    staffName: "田中 太郎",
    date: "2026-12-01",
    requestedTime: null,
    positions: [],
    ...overrides,
  });
  const work = {
    id: "seg-1",
    positionId: "hall",
    positionName: "ホール",
    color: "#60a5fa",
    start: "10:00",
    end: "15:00",
  };
  const submitted = { isSubmitted: true };

  it("休み希望で、勤務も連絡事項もない人をたたむ。その日のデータがない人も同じに扱う", () => {
    expect(isTimeStaffFolded({ shift: shift(), staff: submitted, hasNote: false })).toBe(true);
    expect(isTimeStaffFolded({ shift: undefined, staff: submitted, hasNote: false })).toBe(true);
  });

  it("希望の時間がある人は、勤務がなくてもたたまない", () => {
    const requested = { start: "10:00", end: "15:00" };
    expect(isTimeStaffFolded({ shift: shift({ requestedTime: requested }), staff: submitted, hasNote: false })).toBe(
      false,
    );
    expect(isTimeStaffFolded({ shift: shift({ requestedTimes: [requested] }), staff: submitted, hasNote: false })).toBe(
      false,
    );
  });

  it("休み希望でも、勤務が入った人と連絡事項のある人は、たたまない", () => {
    expect(isTimeStaffFolded({ shift: shift({ positions: [work] }), staff: submitted, hasNote: false })).toBe(false);
    expect(isTimeStaffFolded({ shift: shift(), staff: submitted, hasNote: true })).toBe(false);
  });

  it("未提出の人は、たたまない", () => {
    expect(isTimeStaffFolded({ shift: shift(), staff: { isSubmitted: false }, hasNote: false })).toBe(false);
  });
});
