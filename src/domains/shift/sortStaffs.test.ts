import { describe, expect, test } from "vitest";
import { indexShiftsByStaffIdForDate } from "./shiftLookup";
import { sortStaffs } from "./sortStaffs";
import type { PositionSegment, ShiftData, StaffType } from "./types";

const staffs = [
  { id: "staff-a", name: "田中", isSubmitted: true },
  { id: "staff-b", name: "佐藤", isSubmitted: true },
  { id: "staff-c", name: "青木", isSubmitted: false },
  { id: "staff-d", name: "山田", isSubmitted: true },
] satisfies StaffType[];

const segment = (overrides: Partial<PositionSegment> & { start: string; end: string }): PositionSegment => ({
  id: `seg-${overrides.start}-${overrides.end}`,
  positionId: "pos-default",
  positionName: "勤務",
  color: "#0d9488",
  ...overrides,
});

const shift = ({
  staffId,
  date,
  ...overrides
}: Partial<ShiftData> & Pick<ShiftData, "staffId" | "date">): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffId,
  date,
  requestedTime: null,
  positions: [],
  ...overrides,
});

describe("indexShiftsByStaffIdForDate", () => {
  test("選択日のシフトだけをstaffIdで引ける", () => {
    const shifts = [
      shift({ staffId: "staff-a", date: "2026-06-01" }),
      shift({ staffId: "staff-a", date: "2026-06-02" }),
      shift({ staffId: "staff-b", date: "2026-06-01" }),
    ];

    const result = indexShiftsByStaffIdForDate(shifts, "2026-06-01");

    expect(result.get("staff-a")?.date).toBe("2026-06-01");
    expect(result.get("staff-b")?.date).toBe("2026-06-01");
    expect(result.size).toBe(2);
  });
});

describe("sortStaffs", () => {
  test("defaultはシフト索引なしで元の並びを保つ", () => {
    expect(sortStaffs({ staffs, sortMode: "default" })).toEqual(staffs);
  });

  test("requestは希望開始時刻順にし、希望なしは末尾に送る", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({ staffId: "staff-a", date: "2026-06-01", requestedTime: { start: "12:00", end: "18:00" } }),
        shift({ staffId: "staff-b", date: "2026-06-01", requestedTime: { start: "09:00", end: "15:00" } }),
        shift({ staffId: "staff-c", date: "2026-06-01" }),
        shift({ staffId: "staff-d", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );

    expect(sortStaffs({ staffs, shiftByStaffId, sortMode: "request" }).map((staff) => staff.id)).toEqual([
      "staff-b",
      "staff-a",
      "staff-c",
      "staff-d",
    ]);
  });

  test("startTimeは割当開始時刻順にし、同じ開始なら終了が早い順にする", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({ staffId: "staff-a", date: "2026-06-01", positions: [segment({ start: "10:00", end: "18:00" })] }),
        shift({ staffId: "staff-b", date: "2026-06-01", positions: [segment({ start: "09:00", end: "17:00" })] }),
        shift({ staffId: "staff-c", date: "2026-06-01", positions: [] }),
        shift({ staffId: "staff-d", date: "2026-06-01", positions: [segment({ start: "10:00", end: "14:00" })] }),
      ],
      "2026-06-01",
    );

    expect(sortStaffs({ staffs, shiftByStaffId, sortMode: "startTime" }).map((staff) => staff.id)).toEqual([
      "staff-b",
      "staff-d",
      "staff-a",
      "staff-c",
    ]);
  });
});
