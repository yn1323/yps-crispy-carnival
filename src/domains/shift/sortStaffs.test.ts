import { describe, expect, test } from "vitest";
import { indexShiftsByStaffIdForDate } from "./shiftLookup";
import { compareDefaultStaffOrder, sortDailyStaffs, sortStaffs } from "./sortStaffs";
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

describe("compareDefaultStaffOrder", () => {
  test("displayOrder、createdAt、idの順に安定したデフォルト順を決める", () => {
    const unordered = [
      { id: "staff-z", name: "Z", isSubmitted: true },
      { id: "staff-created-2", name: "Created 2", isSubmitted: true, createdAt: 200 },
      { id: "staff-display-10", name: "Display 10", isSubmitted: true, displayOrder: 10, createdAt: 100 },
      { id: "staff-created-1", name: "Created 1", isSubmitted: true, createdAt: 100 },
      { id: "staff-display-5", name: "Display 5", isSubmitted: true, displayOrder: 5, createdAt: 500 },
      { id: "staff-a", name: "A", isSubmitted: true },
    ] satisfies StaffType[];

    expect([...unordered].sort(compareDefaultStaffOrder).map((staff) => staff.id)).toEqual([
      "staff-display-5",
      "staff-display-10",
      "staff-created-1",
      "staff-created-2",
      "staff-a",
      "staff-z",
    ]);
  });
});

describe("sortDailyStaffs", () => {
  const dailyStaffs = [
    { id: "staff-a", name: "A", isSubmitted: true, displayOrder: 10 },
    { id: "staff-b", name: "B", isSubmitted: true, displayOrder: 20 },
    { id: "staff-c", name: "C", isSubmitted: true, displayOrder: 30 },
    { id: "staff-d", name: "D", isSubmitted: true, displayOrder: 40 },
    { id: "staff-e", name: "E", isSubmitted: true, displayOrder: 50 },
    { id: "staff-f", name: "F", isSubmitted: false, displayOrder: 60 },
  ] satisfies StaffType[];

  test("時間自由入力は勤務ありを開始・終了が早い順にし、休み希望、その他休み、未提出を後ろに並べる", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({
          staffId: "staff-a",
          date: "2026-06-01",
          requestedTime: { start: "10:00", end: "18:00" },
          positions: [segment({ start: "10:00", end: "18:00" })],
        }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedTime: { start: "09:00", end: "12:00" },
          positions: [segment({ start: "09:00", end: "12:00" }), segment({ start: "17:00", end: "22:00" })],
        }),
        shift({
          staffId: "staff-c",
          date: "2026-06-01",
          requestedTime: { start: "09:00", end: "14:00" },
          positions: [segment({ start: "09:00", end: "14:00" })],
        }),
        shift({ staffId: "staff-d", date: "2026-06-01" }),
        shift({
          staffId: "staff-e",
          date: "2026-06-01",
          requestedTime: { start: "11:00", end: "19:00" },
          positions: [],
        }),
        shift({ staffId: "staff-f", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );

    expect(sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "time" }).map((staff) => staff.id)).toEqual([
      "staff-b",
      "staff-c",
      "staff-a",
      "staff-d",
      "staff-e",
      "staff-f",
    ]);
  });

  test("勤務区分の複数勤務は最も早い開始時刻と、その開始時刻に紐づく早い終了時刻で比較する", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({
          staffId: "staff-a",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["morning", "late"],
          positions: [
            segment({ start: "09:00", end: "14:00", shiftTypeOptionId: "morning" }),
            segment({ start: "17:00", end: "22:00", shiftTypeOptionId: "late" }),
          ],
        }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["morning"],
          positions: [segment({ start: "09:00", end: "12:00", shiftTypeOptionId: "morning" })],
        }),
        shift({
          staffId: "staff-c",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["middle"],
          positions: [segment({ start: "10:00", end: "15:00", shiftTypeOptionId: "middle" })],
        }),
      ],
      "2026-06-01",
    );

    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType" }).map((staff) => staff.id),
    ).toEqual(["staff-b", "staff-a", "staff-c", "staff-d", "staff-e", "staff-f"]);
  });

  test("勤務区分の連続した複数勤務は1つの勤務時間として終了時刻を比較する", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({
          staffId: "staff-a",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["middle", "late"],
          positions: [
            segment({ start: "13:00", end: "17:00", shiftTypeOptionId: "middle" }),
            segment({ start: "17:00", end: "21:00", shiftTypeOptionId: "late" }),
          ],
        }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["middle"],
          positions: [segment({ start: "13:00", end: "17:00", shiftTypeOptionId: "middle" })],
        }),
      ],
      "2026-06-01",
    );

    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType" }).map((staff) => staff.id),
    ).toEqual(["staff-b", "staff-a", "staff-c", "staff-d", "staff-e", "staff-f"]);
  });

  test("同じ開始時刻の複数勤務は終了時刻が早い勤務を比較対象にする", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({
          staffId: "staff-a",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["short", "long"],
          positions: [
            segment({ start: "13:00", end: "17:00", shiftTypeOptionId: "short" }),
            segment({ start: "13:00", end: "21:00", shiftTypeOptionId: "long" }),
          ],
        }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["middle"],
          positions: [segment({ start: "13:00", end: "18:00", shiftTypeOptionId: "middle" })],
        }),
      ],
      "2026-06-01",
    );

    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType" }).map((staff) => staff.id),
    ).toEqual(["staff-a", "staff-b", "staff-c", "staff-d", "staff-e", "staff-f"]);
  });

  test("日ごとは勤務ありグループ内を時間ではなくデフォルト順にする", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({
          staffId: "staff-a",
          date: "2026-06-01",
          requestedTime: { start: "09:00", end: "22:00" },
          positions: [segment({ start: "18:00", end: "22:00" })],
        }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedTime: { start: "09:00", end: "22:00" },
          positions: [segment({ start: "09:00", end: "13:00" })],
        }),
        shift({ staffId: "staff-d", date: "2026-06-01" }),
        shift({ staffId: "staff-f", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );

    expect(sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "dateOnly" }).map((staff) => staff.id)).toEqual(
      ["staff-a", "staff-b", "staff-c", "staff-d", "staff-e", "staff-f"],
    );
  });
});
