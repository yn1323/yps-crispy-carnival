import { describe, expect, it } from "vitest";
import { buildDateOnlyCell, isDateOnlyStaffWithoutRequests } from "./dateOnlyCells";
import type { PositionSegment, ShiftData, StaffPositionSkill } from "./types";

const segment = (positionId = "hall"): PositionSegment => ({
  id: "seg-1",
  positionId,
  positionName: positionId,
  color: "#60a5fa",
  start: "09:00",
  end: "22:00",
});

const shift = (input: { requested: boolean; assigned?: PositionSegment }): ShiftData => ({
  id: "shift-1",
  staffId: "staff-1",
  staffName: "田中 太郎",
  date: "2026-12-01",
  requestedTime: input.requested ? { start: "09:00", end: "22:00" } : null,
  positions: input.assigned ? [input.assigned] : [],
});

const submitted = { isSubmitted: true };
const unsubmitted = { isSubmitted: false };

describe("buildDateOnlyCell", () => {
  it("希望があり、割り当てがない日は、希望だけを持つ", () => {
    expect(buildDateOnlyCell({ shift: shift({ requested: true }), staff: submitted, status: "open" })).toEqual({
      status: "open",
      isRequested: true,
      segment: null,
      notices: [],
      dot: null,
    });
  });

  it("希望どおりの割り当てには、理由も点も付けない", () => {
    const cell = buildDateOnlyCell({
      shift: shift({ requested: true, assigned: segment() }),
      staff: submitted,
      status: "open",
    });
    expect(cell.isRequested).toBe(true);
    expect(cell.segment?.positionId).toBe("hall");
    expect(cell.notices).toEqual([]);
    expect(cell.dot).toBeNull();
  });

  it("希望のない人への割り当ては、希望外として橙の点を付ける", () => {
    const cell = buildDateOnlyCell({
      shift: shift({ requested: false, assigned: segment() }),
      staff: submitted,
      status: "open",
    });
    expect(cell.isRequested).toBe(false);
    expect(cell.notices).toEqual([{ kind: "unrequested" }]);
    expect(cell.dot).toBe("orange");
  });

  it("希望も割り当てもない日は、何も持たない", () => {
    for (const target of [shift({ requested: false }), undefined]) {
      const cell = buildDateOnlyCell({ shift: target, staff: submitted, status: "open" });
      expect(cell).toEqual({ status: "open", isRequested: false, segment: null, notices: [], dot: null });
    }
  });

  it("未提出の人は希望を持たず、割り当てには未提出の理由を付ける", () => {
    // 希望から作った候補が勤務に残っていても、未提出の人の希望としては数えない。
    const cell = buildDateOnlyCell({
      shift: shift({ requested: true, assigned: segment() }),
      staff: unsubmitted,
      status: "open",
    });
    expect(cell.isRequested).toBe(false);
    expect(cell.notices).toEqual([{ kind: "notSubmitted" }]);
    expect(cell.dot).toBe("orange");
  });

  it("担当外のポジションへの割り当ては、希望どおりでも理由を付ける", () => {
    const positionSkills: StaffPositionSkill[] = [{ positionId: "kitchen", level: "unavailable" }];
    const staff = { isSubmitted: true, positionSkills };
    expect(
      buildDateOnlyCell({ shift: shift({ requested: true, assigned: segment("kitchen") }), staff, status: "open" })
        .notices,
    ).toEqual([{ kind: "positionUnavailable" }]);
    expect(
      buildDateOnlyCell({ shift: shift({ requested: false, assigned: segment("kitchen") }), staff, status: "open" })
        .notices,
    ).toEqual([{ kind: "unrequested" }, { kind: "positionUnavailable" }]);
  });

  it.each(["closed", "outOfRange"] as const)("%s の日は、希望と割り当てが残っていても何も持たない", (status) => {
    const cell = buildDateOnlyCell({
      shift: shift({ requested: true, assigned: segment() }),
      staff: submitted,
      status,
    });
    expect(cell).toEqual({ status, isRequested: false, segment: null, notices: [], dot: null });
  });
});

describe("isDateOnlyStaffWithoutRequests", () => {
  const empty = { isRequested: false, segment: null };
  const requested = { isRequested: true, segment: null };
  const assigned = { isRequested: false, segment: segment() };

  it("提出済みで、希望も割り当ても連絡事項もない人をまとめる", () => {
    expect(isDateOnlyStaffWithoutRequests({ staff: submitted, cells: [empty, empty], hasNote: false })).toBe(true);
  });

  it("1日でも希望か割り当てがある人は、まとめない", () => {
    expect(isDateOnlyStaffWithoutRequests({ staff: submitted, cells: [empty, requested], hasNote: false })).toBe(false);
    expect(isDateOnlyStaffWithoutRequests({ staff: submitted, cells: [assigned, empty], hasNote: false })).toBe(false);
  });

  it("連絡事項のある人は、希望がなくてもまとめない", () => {
    expect(isDateOnlyStaffWithoutRequests({ staff: submitted, cells: [empty], hasNote: true })).toBe(false);
  });

  it("未提出の人は、まとめない", () => {
    expect(isDateOnlyStaffWithoutRequests({ staff: unsubmitted, cells: [empty], hasNote: false })).toBe(false);
  });
});
