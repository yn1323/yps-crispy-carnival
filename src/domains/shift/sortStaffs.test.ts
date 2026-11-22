import { describe, expect, test } from "vitest";
import { indexShiftsByStaffIdForDate } from "./shiftLookup";
import { compareDefaultStaffOrder, sortDailyStaffs, sortDailyStaffsByDate, sortStaffs } from "./sortStaffs";
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

  // 勤務あり（A・B・C）、出勤の希望あり（E）、休み希望（D）、未提出（F）がそろった1日。
  const mixedDay = () =>
    indexShiftsByStaffIdForDate(
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
          positions: [segment({ start: "09:00", end: "12:00" })],
        }),
        shift({
          staffId: "staff-c",
          date: "2026-06-01",
          requestedTime: { start: "09:00", end: "12:00" },
          positions: [segment({ start: "09:00", end: "12:00" })],
        }),
        shift({ staffId: "staff-d", date: "2026-06-01" }),
        shift({ staffId: "staff-e", date: "2026-06-01", requestedTime: { start: "08:00", end: "19:00" } }),
        shift({ staffId: "staff-f", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );
  // スタッフのページで決めた並び順を、登録順（A〜F）と逆にする。
  const reordered = dailyStaffs.map((staff, index) => ({ ...staff, displayOrder: dailyStaffs.length - index }));

  test("固定：勤務や希望があってもなくても、決めた並び順のままにする", () => {
    const savedOrder = ["staff-f", "staff-e", "staff-d", "staff-c", "staff-b", "staff-a"];
    expect(
      sortDailyStaffs({ staffs: reordered, shiftByStaffId: mixedDay(), mode: "time" }).map((staff) => staff.id),
    ).toEqual(savedOrder);
    // 並び替えを省くと「固定」になる。パターン選択も同じ並びになる。
    for (const mode of ["time", "shiftType"] as const) {
      expect(
        sortDailyStaffs({ staffs: reordered, shiftByStaffId: mixedDay(), mode, staffSortMode: "fixed" }).map(
          (staff) => staff.id,
        ),
      ).toEqual(savedOrder);
    }
  });

  test("固定：希望も勤務もまだ入っていない日は、全員を決めた並び順にする", () => {
    const submitted = reordered.map((staff) => ({ ...staff, isSubmitted: true }));
    expect(sortDailyStaffs({ staffs: submitted, shiftByStaffId: new Map(), mode: "time" }).map((s) => s.id)).toEqual([
      "staff-f",
      "staff-e",
      "staff-d",
      "staff-c",
      "staff-b",
      "staff-a",
    ]);
  });

  test("勤務時間順：時刻が同じ人どうしと、休み希望・未提出のまとまりは、決めた並び順にする", () => {
    // 勤務ありは 9時始まりのBとC（同じ時刻）→ 10時始まりのA。BとCは決めた並び順（Cが先）。
    expect(
      sortDailyStaffs({ staffs: reordered, shiftByStaffId: mixedDay(), mode: "time", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-c", "staff-b", "staff-a", "staff-e", "staff-d", "staff-f"]);

    // 休み希望が2人（AとD）いる日は、決めた並び順（Dが先）になる。
    const restDay = indexShiftsByStaffIdForDate(
      [shift({ staffId: "staff-a", date: "2026-06-01" }), shift({ staffId: "staff-d", date: "2026-06-01" })],
      "2026-06-01",
    );
    const restOnly = reordered.filter((staff) => staff.id === "staff-a" || staff.id === "staff-d");
    expect(
      sortDailyStaffs({ staffs: restOnly, shiftByStaffId: restDay, mode: "time", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-d", "staff-a"]);
  });

  test("日付選択：並び替えの選び方にかかわらず、勤務や希望があってもなくても、決めた並び順のままにする", () => {
    const params = { staffs: reordered, shiftByStaffId: mixedDay(), mode: "dateOnly" as const };
    for (const staffSortMode of ["fixed", "workTime"] as const) {
      expect(sortDailyStaffs({ ...params, staffSortMode }).map((staff) => staff.id)).toEqual([
        "staff-f",
        "staff-e",
        "staff-d",
        "staff-c",
        "staff-b",
        "staff-a",
      ]);
    }
  });

  test("勤務時間順：時間自由入力は勤務ありを開始・終了が早い順にし、勤務のない出勤の希望、休み希望、未提出を後ろに並べる", () => {
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

    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "time", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-b", "staff-c", "staff-a", "staff-e", "staff-d", "staff-f"]);
  });

  test("勤務時間順：勤務がまだない日は、出勤の希望を開始・終了が早い順に上へ並べ、休み希望、未提出を後ろに並べる", () => {
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({ staffId: "staff-a", date: "2026-06-01" }),
        shift({ staffId: "staff-b", date: "2026-06-01", requestedTime: { start: "16:00", end: "21:30" } }),
        shift({ staffId: "staff-c", date: "2026-06-01", requestedTime: { start: "09:00", end: "15:00" } }),
        shift({ staffId: "staff-d", date: "2026-06-01", requestedTime: { start: "09:00", end: "13:00" } }),
        shift({
          staffId: "staff-e",
          date: "2026-06-01",
          requestedTime: { start: "08:00", end: "20:00" },
          requestedTimes: [
            { start: "13:00", end: "15:00" },
            { start: "08:00", end: "10:00" },
          ],
        }),
        shift({ staffId: "staff-f", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );

    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "time", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-e", "staff-d", "staff-c", "staff-b", "staff-a", "staff-f"]);
  });

  test("勤務時間順：パターン選択は、勤務のない人のうち勤務パターンの希望がある人を、希望の開始・終了が早い順に休み希望より上へ並べる", () => {
    const morning = { start: "09:00", end: "13:00" };
    const late = { start: "17:00", end: "22:00" };
    const shiftByStaffId = indexShiftsByStaffIdForDate(
      [
        shift({ staffId: "staff-a", date: "2026-06-01", requestedShiftTypeOptionIds: [] }),
        shift({
          staffId: "staff-b",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["late"],
          requestedTimes: [late],
        }),
        shift({
          staffId: "staff-c",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["late", "morning"],
          requestedTimes: [late, morning],
        }),
        shift({
          staffId: "staff-d",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["morning"],
          requestedTimes: [morning],
        }),
        shift({
          staffId: "staff-e",
          date: "2026-06-01",
          requestedShiftTypeOptionIds: ["late"],
          requestedTimes: [late],
          positions: [segment({ start: "17:00", end: "22:00", shiftTypeOptionId: "late" })],
        }),
        shift({ staffId: "staff-f", date: "2026-06-01" }),
      ],
      "2026-06-01",
    );

    // 勤務あり（E）→ 希望あり（早番を含むCとDは同じ時刻なので決めた並び順、遅番だけのBが後）→ 休み希望（A）→ 未提出（F）。
    expect(
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-e", "staff-c", "staff-d", "staff-b", "staff-a", "staff-f"]);
  });

  test("勤務時間順：勤務パターンの複数勤務は最も早い開始時刻と、その開始時刻に紐づく早い終了時刻で比較する", () => {
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
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-b", "staff-a", "staff-c", "staff-d", "staff-e", "staff-f"]);
  });

  test("勤務時間順：勤務パターンの連続した複数勤務は1つの勤務時間として終了時刻を比較する", () => {
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
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
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
      sortDailyStaffs({ staffs: dailyStaffs, shiftByStaffId, mode: "shiftType", staffSortMode: "workTime" }).map(
        (staff) => staff.id,
      ),
    ).toEqual(["staff-a", "staff-b", "staff-c", "staff-d", "staff-e", "staff-f"]);
  });

  test("勤務時間順：日付ごとに、その日のシフトで早い順に並べたMapを返す", () => {
    const shifts = [
      shift({
        staffId: "staff-a",
        date: "2026-06-01",
        positions: [segment({ start: "10:00", end: "18:00" })],
      }),
      shift({
        staffId: "staff-b",
        date: "2026-06-01",
        positions: [segment({ start: "09:00", end: "17:00" })],
      }),
      // staff-aは2日目だけ早い → 日付ごとに並びが変わることを確認
      shift({
        staffId: "staff-a",
        date: "2026-06-02",
        positions: [segment({ start: "08:00", end: "12:00" })],
      }),
      shift({
        staffId: "staff-b",
        date: "2026-06-02",
        positions: [segment({ start: "13:00", end: "21:00" })],
      }),
    ];

    const result = sortDailyStaffsByDate({ staffs: dailyStaffs, shifts, mode: "time", staffSortMode: "workTime" });

    expect(
      result
        .get("2026-06-01")
        ?.map((staff) => staff.id)
        .slice(0, 2),
    ).toEqual(["staff-b", "staff-a"]);
    expect(
      result
        .get("2026-06-02")
        ?.map((staff) => staff.id)
        .slice(0, 2),
    ).toEqual(["staff-a", "staff-b"]);
    // シフトのない日付はキーを持たない
    expect(result.has("2026-06-03")).toBe(false);
  });
});
