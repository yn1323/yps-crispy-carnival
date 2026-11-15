import { describe, expect, it } from "vitest";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import type { ShiftFormStaffing } from "../../stores";
import {
  buildDateOnlyRows,
  buildDateOnlyStaffingByDate,
  buildDateOnlyWeeks,
  buildRowWeekNotes,
  getSortableDates,
} from "./script";

describe("buildDateOnlyWeeks", () => {
  it("期間を月曜始まりの週へまとめる", () => {
    const weeks = buildDateOnlyWeeks(["2026-06-03", "2026-06-04", "2026-06-05"]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].subLabel).toBe("1週目");
    expect(weeks[0].dates.filter((date) => date.inRange).map((date) => date.iso)).toEqual([
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
  });
});

describe("getSortableDates", () => {
  const dates = [
    { iso: "2026-06-01", inRange: true },
    { iso: "2026-06-02", inRange: true },
    { iso: "2026-06-03", inRange: false },
  ];

  it("営業日を優先する", () => {
    expect(getSortableDates(dates, ["2026-06-01"])).toEqual([{ iso: "2026-06-02", inRange: true }]);
  });

  it("全日休業なら期間内の日付を返す", () => {
    expect(getSortableDates(dates, ["2026-06-01", "2026-06-02"])).toEqual(dates.slice(0, 2));
  });
});

describe("buildDateOnlyRows", () => {
  it("表示に必要な希望・割当・休業状態を行へまとめる", () => {
    const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const shifts: ShiftData[] = [
      {
        id: "shift-1",
        staffId: staff.id,
        staffName: staff.name,
        date: "2026-06-01",
        requestedTime: { start: "09:00", end: "18:00" },
        positions: [
          {
            id: "position-1",
            positionId: "default",
            positionName: "勤務",
            color: "#000",
            start: "09:00",
            end: "18:00",
          },
        ],
      },
    ];

    const [row] = buildDateOnlyRows({
      staffs: [staff],
      shifts,
      dates: [
        { iso: "2026-06-01", inRange: true },
        { iso: "2026-06-02", inRange: true },
      ],
      holidays: ["2026-06-02"],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map([[staff.id, ["確認事項"]]]),
    });

    expect(row.warningMessages).toEqual(["確認事項"]);
    expect(row.requestBadges).toEqual([{ key: "2026-06-01", label: "6/1", tone: "requested" }]);
    expect(row.cells).toMatchObject([
      { assigned: true, requested: true, isClosed: false },
      { assigned: false, requested: false, isClosed: true },
    ]);
  });

  it("提出状態と表示モードから希望欄の表示値を組み立てる", () => {
    const submittedStaff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
    const unsubmittedStaff: StaffType = { id: "staff-2", name: "佐藤", isSubmitted: false };
    const rows = buildDateOnlyRows({
      staffs: [submittedStaff, unsubmittedStaff],
      shifts: [],
      dates: [{ iso: "2026-06-01", inRange: true }],
      holidays: [],
      isConfirmedDisplay: true,
      warningMessagesByStaffId: new Map(),
    });

    expect(rows[0].requestBadges).toEqual([{ key: "empty", label: "勤務なし", tone: "muted" }]);
    expect(rows[0].isStaffNameMuted).toBe(false);
    expect(rows[1].requestBadges).toEqual([{ key: "unsubmitted", label: "未提出", tone: "warning" }]);
    expect(rows[1].isStaffNameMuted).toBe(true);
  });
});

describe("buildDateOnlyRows のくわしく表示用の値", () => {
  const staff: StaffType = { id: "staff-1", name: "田中", isSubmitted: true };
  const work = (date: string) => ({
    id: `segment-${date}`,
    positionId: "kitchen",
    positionName: "キッチン",
    color: "#ea580c",
    start: "09:00",
    end: "22:00",
  });
  const shiftOn = (date: string, overrides: Partial<ShiftData> = {}): ShiftData => ({
    id: `shift-${date}`,
    staffId: staff.id,
    staffName: staff.name,
    date,
    requestedTime: null,
    positions: [work(date)],
    ...overrides,
  });

  it("勤務のポジション、休憩のある日の勤務、仮の勤務かどうかをセルへ持たせる", () => {
    // 日付選択の休憩は勤務の時刻に縛られないため、受付時間の外でも印を出す。
    const withBreak = shiftOn("2026-06-01", { breaks: [{ start: "23:00", end: "23:30" }] });
    const withoutBreak = shiftOn("2026-06-02", { isProvisional: true });
    // 勤務を外した日に休憩が残っていても、印は出さない。
    const noWork = shiftOn("2026-06-03", { positions: [], breaks: [{ start: "12:00", end: "13:00" }] });

    const [row] = buildDateOnlyRows({
      staffs: [staff],
      shifts: [withBreak, withoutBreak, noWork],
      dates: ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map((iso) => ({ iso, inRange: true })),
      holidays: [],
      isConfirmedDisplay: false,
      warningMessagesByStaffId: new Map(),
    });

    expect(
      row.cells.map(({ assigned, segment, breakShift, isProvisional }) => ({
        assigned,
        position: segment?.positionName,
        breakShift,
        isProvisional,
      })),
    ).toEqual([
      { assigned: true, position: "キッチン", breakShift: withBreak, isProvisional: false },
      { assigned: true, position: "キッチン", breakShift: undefined, isProvisional: true },
      { assigned: false, position: undefined, breakShift: undefined, isProvisional: false },
      { assigned: false, position: undefined, breakShift: undefined, isProvisional: false },
    ]);
  });
});

describe("buildDateOnlyStaffingByDate", () => {
  const positions: PositionType[] = [
    { id: "hall", name: "ホール", color: "#2563eb", isDefault: true },
    { id: "kitchen", name: "キッチン", color: "#ea580c", isDefault: false },
  ];
  const staffs: StaffType[] = [
    { id: "staff-1", name: "田中", isSubmitted: true },
    { id: "staff-2", name: "佐藤", isSubmitted: true },
  ];
  const shiftOf = (staffId: string, date: string, positionId: string): ShiftData => ({
    id: `shift-${staffId}-${date}`,
    staffId,
    staffName: staffId,
    date,
    requestedTime: null,
    positions: [
      {
        id: `seg-${staffId}-${date}`,
        positionId,
        positionName: positionId,
        color: "#000",
        start: "09:00",
        end: "22:00",
      },
    ],
  });
  // 2026-06-01は月曜、2026-06-02は火曜。
  const staffing: ShiftFormStaffing = {
    dayTemplates: [
      {
        id: "weekday",
        name: "平日",
        weekdays: ["mon", "tue"],
        slots: [
          {
            key: { kind: "allDay" },
            requirements: [
              { positionId: "hall", count: 2 },
              { positionId: "kitchen", count: 1 },
            ],
          },
        ],
      },
      {
        id: "event",
        name: "イベント日",
        weekdays: [],
        slots: [{ key: { kind: "allDay" }, requirements: [{ positionId: "hall", count: 1 }] }],
      },
    ],
    dayTemplateOverrides: [{ date: "2026-06-02", templateId: "event" }],
    breakRule: null,
  };
  const build = (overrides: Partial<Parameters<typeof buildDateOnlyStaffingByDate>[0]> = {}) =>
    buildDateOnlyStaffingByDate({
      dates: ["2026-06-01", "2026-06-02", "2026-06-03"],
      holidays: [],
      staffs,
      shifts: [
        shiftOf("staff-1", "2026-06-01", "hall"),
        shiftOf("staff-2", "2026-06-01", "kitchen"),
        shiftOf("staff-1", "2026-06-02", "hall"),
        // シフト対象から外れたスタッフの勤務は数えない。
        shiftOf("staff-removed", "2026-06-01", "hall"),
      ],
      positions,
      submissionPattern: { kind: "dateOnly" },
      timeRange: { start: 9, end: 22, unit: 30 },
      staffing,
      ...overrides,
    });
  const summarize = (result: ReturnType<typeof buildDateOnlyStaffingByDate>) =>
    [...result].map(([date, view]) => ({
      date,
      template: view.template?.name ?? null,
      isOverridden: view.isOverridden,
      hasShortage: view.hasShortage,
      total: view.slots.map((slot) => slot.total),
      positions: view.slots.flatMap((slot) =>
        slot.positions.map(({ name, count, required, shortage }) => ({ name, count, required, shortage })),
      ),
    }));

  it("日付ごとに、当たっている日の型で人数と不足を数える", () => {
    expect(summarize(build())).toEqual([
      {
        date: "2026-06-01",
        template: "平日",
        isOverridden: false,
        hasShortage: true,
        total: [2],
        positions: [
          { name: "ホール", count: 1, required: 2, shortage: 1 },
          { name: "キッチン", count: 1, required: 1, shortage: 0 },
        ],
      },
      {
        // その日だけの指定がある日は、曜日の型より優先する。
        date: "2026-06-02",
        template: "イベント日",
        isOverridden: true,
        hasShortage: false,
        total: [1],
        positions: [
          { name: "ホール", count: 1, required: 1, shortage: 0 },
          { name: "キッチン", count: 0, required: null, shortage: 0 },
        ],
      },
      {
        // 型が当たらない曜日は、人数だけを数える。
        date: "2026-06-03",
        template: null,
        isOverridden: false,
        hasShortage: false,
        total: [0],
        positions: [
          { name: "ホール", count: 0, required: null, shortage: 0 },
          { name: "キッチン", count: 0, required: null, shortage: 0 },
        ],
      },
    ]);
  });

  it("削除済みのスタッフに残った勤務は数えない", () => {
    const result = build({
      staffs: [...staffs, { id: "staff-deleted", name: "鈴木（削除済み）", isSubmitted: false, isRemoved: true }],
      shifts: [shiftOf("staff-1", "2026-06-01", "hall"), shiftOf("staff-deleted", "2026-06-01", "hall")],
    });

    expect(
      summarize(result)
        .filter(({ date }) => date === "2026-06-01")
        .map(({ total, hasShortage, positions: counts }) => ({ total, hasShortage, hall: counts[0] })),
    ).toEqual([{ total: [1], hasShortage: true, hall: { name: "ホール", count: 1, required: 2, shortage: 1 } }]);
  });

  it("定休日は数えない", () => {
    expect([...build({ holidays: ["2026-06-01", "2026-06-03"] }).keys()]).toEqual(["2026-06-02"]);
  });

  it("日の型を設定していない店舗でも、日付ごとの人数を数える", () => {
    expect(
      summarize(build({ staffing: undefined })).map(({ date, template, total }) => ({ date, template, total })),
    ).toEqual([
      { date: "2026-06-01", template: null, total: [2] },
      { date: "2026-06-02", template: null, total: [1] },
      { date: "2026-06-03", template: null, total: [0] },
    ]);
  });
});

describe("buildRowWeekNotes", () => {
  const column = (iso: string) => ({
    date: { iso, inRange: true },
    isClosed: false,
    assignmentCount: 0,
  });
  const notes = new Map([
    ["staff-a:2026-06-04", "午前だけ"],
    ["staff-a:2026-06-02", "17時以降なら入れます"],
    ["staff-b:2026-06-02", "別スタッフのメモ"],
    ["staff-a:2026-06-09", "表示外の週のメモ"],
  ]);

  it("表示中の週にあるそのスタッフのメモだけを日付順で返す", () => {
    const columns = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"].map(column);
    expect(buildRowWeekNotes("staff-a", columns, (staffId, date) => notes.get(`${staffId}:${date}`))).toEqual([
      { date: "2026-06-02", note: "17時以降なら入れます" },
      { date: "2026-06-04", note: "午前だけ" },
    ]);
  });
});
