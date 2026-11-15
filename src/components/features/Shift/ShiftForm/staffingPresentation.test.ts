import { describe, expect, it } from "vitest";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { PositionSegment, PositionType, ShiftData, TimeRange } from "@/src/domains/shift/types";
import {
  buildDayStaffingView,
  formatStaffingCount,
  selectStaffingShifts,
  shouldDefaultToDetailMode,
} from "./staffingPresentation";
import type { ShiftFormStaffing } from "./stores";

// 2026-05-21は木曜日、2026-05-22は金曜日。
const thursday = "2026-05-21";
const friday = "2026-05-22";

const hall: PositionType = { id: "hall", name: "ホール", color: "#0d9488", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#f97316", isDefault: false };
const positions = [hall, kitchen];
const timeRange: TimeRange = { start: 9, end: 13, unit: 30 };

const timePattern: ShiftSubmissionPattern = { kind: "time", startTime: "09:00", endTime: "13:00" };
const shiftTypePattern: ShiftSubmissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
  ],
};
const dateOnlyPattern: ShiftSubmissionPattern = { kind: "dateOnly" };

const segment = (
  start: string,
  end: string,
  position: PositionType = hall,
  overrides: Partial<PositionSegment> = {},
): PositionSegment => ({
  id: `seg-${position.id}-${start}-${end}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start,
  end,
  ...overrides,
});

const shift = (staffId: string, shiftPositions: PositionSegment[], breaks?: ShiftData["breaks"]): ShiftData => ({
  id: `shift-${staffId}`,
  staffId,
  staffName: staffId,
  date: thursday,
  requestedTime: null,
  positions: shiftPositions,
  ...(breaks ? { breaks } : {}),
});

const staffing = (overrides: Partial<ShiftFormStaffing> = {}): ShiftFormStaffing => ({
  dayTemplates: [],
  dayTemplateOverrides: [],
  breakRule: null,
  ...overrides,
});

const positionView = (position: PositionType, count: number, required: number | null, shortage: number) => ({
  positionId: position.id,
  name: position.name,
  color: position.color,
  count,
  required,
  shortage,
});

describe("selectStaffingShifts", () => {
  it("その日の、在籍しているスタッフの勤務だけを返し、削除済みのスタッフと一覧にないスタッフの勤務は数えない", () => {
    const active = shift("active", [segment("09:00", "13:00")]);
    const removed = shift("removed", [segment("09:00", "13:00")]);
    const unknown = shift("unknown", [segment("09:00", "13:00")]);
    const otherDay = { ...shift("active", [segment("09:00", "13:00")]), id: "shift-active-friday", date: friday };

    const result = selectStaffingShifts(
      [active, removed, unknown, otherDay],
      [{ id: "active" }, { id: "removed", isRemoved: true }],
      thursday,
    );

    expect(result).toEqual([active]);
  });
});

describe("buildDayStaffingView", () => {
  describe("時間指定", () => {
    const weekdayTemplate: ShiftFormStaffing["dayTemplates"][number] = {
      id: "template-weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "11:00" },
          requirements: [
            { positionId: hall.id, count: 2 },
            { positionId: kitchen.id, count: 1 },
          ],
        },
        { key: { kind: "time", startTime: "11:00", endTime: "13:00" }, requirements: [] },
      ],
    };

    it("日の型がある日は、型の時間帯ごとに人数、必要人数、不足を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [
          shift("a", [segment("09:00", "13:00", hall)], [{ start: "11:30", end: "12:00" }]),
          shift("b", [segment("09:00", "13:00", kitchen)]),
        ],
        positions,
        submissionPattern: timePattern,
        timeRange,
        staffing: staffing({ dayTemplates: [weekdayTemplate] }),
      });

      expect(view).toEqual({
        template: { id: "template-weekday", name: "平日" },
        isOverridden: false,
        slots: [
          {
            id: "time:09:00-11:00",
            label: "09:00–11:00",
            total: 2,
            positions: [positionView(hall, 1, 2, 1), positionView(kitchen, 1, 1, 0)],
            hasShortage: true,
            startMinutes: 540,
            endMinutes: 660,
          },
          {
            id: "time:11:00-13:00",
            label: "11:00–13:00",
            // スタッフaは11:30〜12:00が休憩のため、この時間帯では数えない。
            total: 1,
            positions: [positionView(hall, 0, null, 0), positionView(kitchen, 1, null, 0)],
            hasShortage: false,
            startMinutes: 660,
            endMinutes: 780,
          },
        ],
        hasShortage: true,
      });
    });

    it("日の型がない日は、1時間ごとの人数だけを必要人数なしで出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [shift("a", [segment("09:00", "11:00", hall)])],
        positions,
        submissionPattern: timePattern,
        timeRange: { start: 9, end: 11, unit: 30 },
        staffing: staffing(),
      });

      expect(view).toEqual({
        template: null,
        isOverridden: false,
        slots: [
          {
            id: "time:09:00-10:00",
            label: "09:00–10:00",
            total: 1,
            positions: [positionView(hall, 1, null, 0), positionView(kitchen, 0, null, 0)],
            hasShortage: false,
            startMinutes: 540,
            endMinutes: 600,
          },
          {
            id: "time:10:00-11:00",
            label: "10:00–11:00",
            total: 1,
            positions: [positionView(hall, 1, null, 0), positionView(kitchen, 0, null, 0)],
            hasShortage: false,
            startMinutes: 600,
            endMinutes: 660,
          },
        ],
        hasShortage: false,
      });
    });

    it("店舗の設定が渡されない場合も、1時間ごとの人数を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: timePattern,
        timeRange,
        staffing: undefined,
      });

      expect(view.template).toBeNull();
      expect(view.slots.map((slot) => slot.label)).toEqual([
        "09:00–10:00",
        "10:00–11:00",
        "11:00–12:00",
        "12:00–13:00",
      ]);
    });

    it("1時間ごとの区切りは、編集できる時間の範囲に合わせる", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: { kind: "time", startTime: "09:30", endTime: "11:30" },
        timeRange: { start: 9, end: 12, unit: 30, editableStartMinutes: 570, editableEndMinutes: 690 },
        staffing: staffing(),
      });

      expect(view.slots.map((slot) => [slot.label, slot.startMinutes, slot.endMinutes])).toEqual([
        ["09:30–10:00", 570, 600],
        ["10:00–11:00", 600, 660],
        ["11:00–11:30", 660, 690],
      ]);
    });

    it("曜日が合わない日の型は当てない", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: timePattern,
        timeRange,
        staffing: staffing({ dayTemplates: [{ ...weekdayTemplate, weekdays: ["sat", "sun"] }] }),
      });

      expect(view.template).toBeNull();
      expect(view.slots).toHaveLength(4);
    });

    it("時間帯の区切りを持たない日の型が当たる日は、型を示したまま1時間ごとの人数を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: timePattern,
        timeRange,
        staffing: staffing({
          dayTemplates: [
            {
              ...weekdayTemplate,
              slots: [{ key: { kind: "allDay" }, requirements: [{ positionId: hall.id, count: 3 }] }],
            },
          ],
        }),
      });

      expect(view.template).toEqual({ id: "template-weekday", name: "平日" });
      expect(view.slots.map((slot) => slot.id)).toEqual([
        "time:09:00-10:00",
        "time:10:00-11:00",
        "time:11:00-12:00",
        "time:12:00-13:00",
      ]);
      expect(view.hasShortage).toBe(false);
    });

    it("24時を超える時間帯は「翌」を付けて示す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: { kind: "time", startTime: "18:00", endTime: "26:00" },
        timeRange: { start: 18, end: 26, unit: 30 },
        staffing: staffing({
          dayTemplates: [
            {
              ...weekdayTemplate,
              slots: [{ key: { kind: "time", startTime: "22:00", endTime: "25:30" }, requirements: [] }],
            },
          ],
        }),
      });

      expect(view.slots.map((slot) => [slot.id, slot.label, slot.startMinutes, slot.endMinutes])).toEqual([
        ["time:22:00-25:30", "22:00–翌1:30", 1320, 1530],
      ]);
    });
  });

  describe("特別な日", () => {
    const weekdayTemplate: ShiftFormStaffing["dayTemplates"][number] = {
      id: "template-weekday",
      name: "平日",
      weekdays: ["thu", "fri"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "13:00" },
          requirements: [{ positionId: hall.id, count: 1 }],
        },
      ],
    };
    const busyTemplate: ShiftFormStaffing["dayTemplates"][number] = {
      id: "template-busy",
      name: "繁忙日",
      weekdays: [],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "13:00" },
          requirements: [{ positionId: hall.id, count: 4 }],
        },
      ],
    };
    const input = {
      shifts: [shift("a", [segment("09:00", "13:00", hall)])],
      positions,
      submissionPattern: timePattern,
      timeRange,
      staffing: staffing({
        dayTemplates: [weekdayTemplate, busyTemplate],
        dayTemplateOverrides: [{ date: thursday, templateId: "template-busy" }],
      }),
    };

    it("その日だけの指定を、曜日の割り当てより優先する", () => {
      const view = buildDayStaffingView({ ...input, date: thursday });

      expect(view.template).toEqual({ id: "template-busy", name: "繁忙日" });
      expect(view.isOverridden).toBe(true);
      expect(view.slots.map((slot) => slot.positions[0])).toEqual([positionView(hall, 1, 4, 3)]);
      expect(view.hasShortage).toBe(true);
    });

    it("指定のない日は、曜日の割り当ての型を当てる", () => {
      const view = buildDayStaffingView({ ...input, date: friday });

      expect(view.template).toEqual({ id: "template-weekday", name: "平日" });
      expect(view.isOverridden).toBe(false);
      expect(view.slots.map((slot) => slot.positions[0])).toEqual([positionView(hall, 1, 1, 0)]);
      expect(view.hasShortage).toBe(false);
    });

    it("曜日の割り当てがない日にも、その日だけの指定で型を当てる", () => {
      const view = buildDayStaffingView({
        ...input,
        date: thursday,
        staffing: staffing({
          dayTemplates: [busyTemplate],
          dayTemplateOverrides: [{ date: thursday, templateId: "template-busy" }],
        }),
      });

      expect(view.template).toEqual({ id: "template-busy", name: "繁忙日" });
      expect(view.isOverridden).toBe(true);
    });
  });

  describe("パターン選択", () => {
    const early = { shiftTypeOptionId: "early" };
    const late = { shiftTypeOptionId: "late" };

    it("勤務パターンごとに、パターン名のラベルで人数と不足を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [
          shift("a", [segment("09:00", "15:00", hall, early)], [{ start: "12:00", end: "13:00" }]),
          shift("b", [segment("09:00", "15:00", kitchen, early), segment("15:00", "21:00", kitchen, late)]),
        ],
        positions,
        submissionPattern: shiftTypePattern,
        timeRange,
        staffing: staffing({
          dayTemplates: [
            {
              id: "template-thu",
              name: "木曜",
              weekdays: ["thu"],
              slots: [
                {
                  key: { kind: "shiftType", optionId: "late" },
                  requirements: [
                    { positionId: hall.id, count: 1 },
                    { positionId: kitchen.id, count: 1 },
                  ],
                },
              ],
            },
          ],
        }),
      });

      expect(view).toEqual({
        template: { id: "template-thu", name: "木曜" },
        isOverridden: false,
        slots: [
          {
            id: "shiftType:early",
            label: "早番",
            // パターン選択では、休憩が入っていても人数を変えない。
            total: 2,
            positions: [positionView(hall, 1, null, 0), positionView(kitchen, 1, null, 0)],
            hasShortage: false,
          },
          {
            id: "shiftType:late",
            label: "遅番",
            total: 1,
            positions: [positionView(hall, 0, 1, 1), positionView(kitchen, 1, 1, 0)],
            hasShortage: true,
          },
        ],
        hasShortage: true,
      });
    });

    it("日の型がない日も、勤務パターンごとの人数を必要人数なしで出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [],
        positions,
        submissionPattern: shiftTypePattern,
        timeRange,
        staffing: undefined,
      });

      expect(view.template).toBeNull();
      expect(view.slots.map((slot) => [slot.id, slot.label, slot.total])).toEqual([
        ["shiftType:early", "早番", 0],
        ["shiftType:late", "遅番", 0],
      ]);
      expect(view.hasShortage).toBe(false);
    });
  });

  describe("日付選択", () => {
    it("1日を1つの区切りとして、人数と不足を出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [
          shift("a", [segment("09:00", "13:00", hall)], [{ start: "11:00", end: "12:00" }]),
          shift("b", [segment("09:00", "13:00", kitchen)]),
          shift("off", []),
        ],
        positions,
        submissionPattern: dateOnlyPattern,
        timeRange,
        staffing: staffing({
          dayTemplates: [
            {
              id: "template-thu",
              name: "木曜",
              weekdays: ["thu"],
              slots: [{ key: { kind: "allDay" }, requirements: [{ positionId: hall.id, count: 2 }] }],
            },
          ],
        }),
      });

      expect(view).toEqual({
        template: { id: "template-thu", name: "木曜" },
        isOverridden: false,
        slots: [
          {
            id: "allDay",
            label: "1日",
            total: 2,
            positions: [positionView(hall, 1, 2, 1), positionView(kitchen, 1, null, 0)],
            hasShortage: true,
          },
        ],
        hasShortage: true,
      });
    });

    it("日の型がない日も、1日の人数を必要人数なしで出す", () => {
      const view = buildDayStaffingView({
        date: thursday,
        shifts: [shift("a", [segment("09:00", "13:00", hall)])],
        positions,
        submissionPattern: dateOnlyPattern,
        timeRange,
        staffing: staffing(),
      });

      expect(view).toEqual({
        template: null,
        isOverridden: false,
        slots: [
          {
            id: "allDay",
            label: "1日",
            total: 1,
            positions: [positionView(hall, 1, null, 0), positionView(kitchen, 0, null, 0)],
            hasShortage: false,
          },
        ],
        hasShortage: false,
      });
    });
  });
});

describe("formatStaffingCount", () => {
  it("必要人数がある場合は「人数/必要人数」で示す", () => {
    expect(formatStaffingCount(2, 3)).toBe("2/3");
    expect(formatStaffingCount(0, 0)).toBe("0/0");
  });

  it("必要人数が未設定の場合は人数だけを示す", () => {
    expect(formatStaffingCount(2, null)).toBe("2");
    expect(formatStaffingCount(0, null)).toBe("0");
  });
});

describe("shouldDefaultToDetailMode", () => {
  const template: ShiftFormStaffing["dayTemplates"][number] = {
    id: "template-1",
    name: "平日",
    weekdays: [],
    slots: [],
  };

  it("何も設定していない店舗は、シンプルを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: undefined, hasStaffProfiles: false })).toBe(false);
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: staffing(), hasStaffProfiles: false })).toBe(false);
    expect(shouldDefaultToDetailMode({ positionCount: 0, staffing: staffing(), hasStaffProfiles: false })).toBe(false);
  });

  it("ポジションが2つ以上ある店舗は、くわしくを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 2, staffing: undefined, hasStaffProfiles: false })).toBe(true);
  });

  it("日の型がある店舗は、くわしくを初期状態にする", () => {
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ dayTemplates: [template] }),
        hasStaffProfiles: false,
      }),
    ).toBe(true);
  });

  it("休憩の決まりがある店舗は、くわしくを初期状態にする", () => {
    expect(
      shouldDefaultToDetailMode({
        positionCount: 1,
        staffing: staffing({ breakRule: { minWorkMinutes: 360, breakMinutes: 45 } }),
        hasStaffProfiles: false,
      }),
    ).toBe(true);
  });

  it("スタッフの属性を設定している店舗は、くわしくを初期状態にする", () => {
    expect(shouldDefaultToDetailMode({ positionCount: 1, staffing: staffing(), hasStaffProfiles: true })).toBe(true);
  });
});
