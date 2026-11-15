import type { ComponentProps } from "react";
import type { PositionSegment, PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import type { ShiftForm, ShiftFormStaffing } from "..";
import {
  mockDateOnlyDates,
  mockDateOnlyStaffs,
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeStaffs,
  mockStaffs,
} from "../stories/fixtures";
import { allPatternsArgs, dateOnlyArgs, shiftTypeArgs } from "../stories/shared";

// スマートフォンの「くわしく表示」のStoryで共有するfixture。
// 複数ポジション、日の型あり（不足あり）、休憩あり、熟練度あり、仮の勤務ありを1画面で確かめられるようにする。

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

export const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
export const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
export const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
export const detailPositions = [hall, kitchen, register];

const requirements = (counts: Array<[position: PositionType, count: number]>) =>
  counts.map(([position, count]) => ({ positionId: position.id, count }));

// staff1を責任者、staff4を新人にする。
const withSkillLevels = (staffs: StaffType[]): StaffType[] =>
  staffs.map((staff) =>
    staff.id === "staff1"
      ? { ...staff, skillLevel: "lead" }
      : staff.id === "staff4"
        ? { ...staff, skillLevel: "newcomer" }
        : staff,
  );

const staffNameOf = (staffs: StaffType[], staffId: string) =>
  staffs.find((staff) => staff.id === staffId)?.name ?? staffId;

// ==========================================
// 時間指定
// ==========================================
export const timeDetailDate = "2026-01-23";
const timeDetailNextDate = "2026-01-24";
export const timeDetailStaffs = withSkillLevels(mockStaffs);

const timeSegment = (
  staffId: string,
  date: string,
  position: PositionType,
  start: string,
  end: string,
): PositionSegment => ({
  id: `seg-${staffId}-${date}-${start}`,
  positionId: position.id,
  positionName: position.name,
  color: position.color,
  start,
  end,
});

const timeShift = (
  staffId: string,
  date: string,
  segments: Array<[position: PositionType, start: string, end: string]>,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffNameOf(timeDetailStaffs, staffId),
  date,
  requestedTime: null,
  positions: segments.map(([position, start, end]) => timeSegment(staffId, date, position, start, end)),
  ...extra,
});

export const timeDetailShifts: ShiftData[] = [
  // 責任者。途中でポジションが変わり、ホールの時間に休憩する。
  timeShift(
    "staff1",
    timeDetailDate,
    [
      [hall, "10:00", "14:00"],
      [kitchen, "14:00", "18:00"],
    ],
    { requestedTime: { start: "10:00", end: "18:00" }, breaks: [{ start: "12:00", end: "13:00" }] },
  ),
  timeShift("staff2", timeDetailDate, [[kitchen, "11:00", "19:00"]], {
    requestedTime: { start: "11:00", end: "19:00" },
    breaks: [{ start: "15:00", end: "15:30" }],
  }),
  // 未提出者へ入れた仮の勤務。
  timeShift("staff3", timeDetailDate, [[hall, "13:00", "17:00"]], { isProvisional: true }),
  // 新人。勤務と勤務の間が空いている。
  timeShift(
    "staff4",
    timeDetailDate,
    [
      [register, "09:00", "12:00"],
      [register, "13:00", "17:00"],
    ],
    { requestedTime: { start: "09:00", end: "17:00" } },
  ),
  // 2日目。人ごとの合計に効く。
  timeShift("staff1", timeDetailNextDate, [[hall, "10:00", "18:00"]], {
    requestedTime: { start: "10:00", end: "18:00" },
  }),
  timeShift("staff2", timeDetailNextDate, [[kitchen, "12:00", "17:00"]], {
    requestedTime: { start: "12:00", end: "17:00" },
  }),
];

export const timeDetailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "13:00" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 1],
          ]),
        },
        {
          key: { kind: "time", startTime: "13:00", endTime: "17:00" },
          requirements: requirements([
            [hall, 1],
            [kitchen, 2],
            [register, 1],
          ]),
        },
        { key: { kind: "time", startTime: "17:00", endTime: "22:00" }, requirements: requirements([[hall, 1]]) },
      ],
    },
    {
      id: "event",
      name: "イベント日",
      weekdays: [],
      slots: [
        {
          key: { kind: "time", startTime: "09:00", endTime: "22:00" },
          requirements: requirements([
            [hall, 3],
            [kitchen, 2],
          ]),
        },
      ],
    },
  ],
  dayTemplateOverrides: [],
  breakRule: null,
};

export const timeDetailArgs = {
  ...allPatternsArgs,
  dates: [timeDetailDate, timeDetailNextDate],
  staffs: timeDetailStaffs,
  positions: detailPositions,
  initialShifts: timeDetailShifts,
  staffing: timeDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;

// ==========================================
// パターン選択
// ==========================================
const [shiftTypeDate, shiftTypeNextDate] = mockShiftTypeDates;
const shiftTypeDetailStaffs = withSkillLevels(mockShiftTypeStaffs);
const shiftTypeOptions = mockShiftTypePattern.kind === "shiftType" ? mockShiftTypePattern.options : [];

const shiftTypeShift = (
  staffId: string,
  date: string,
  assignments: Array<[optionId: string, position: PositionType]>,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffNameOf(shiftTypeDetailStaffs, staffId),
  date,
  requestedTime: null,
  requestedShiftTypeOptionIds: assignments.map(([optionId]) => optionId),
  positions: assignments.map(([optionId, position]) => {
    const option = shiftTypeOptions.find((item) => item.id === optionId) ?? shiftTypeOptions[0];
    return {
      id: `seg-${staffId}-${date}-${option.id}`,
      positionId: position.id,
      positionName: position.name,
      color: position.color,
      start: option.startTime,
      end: option.endTime,
      shiftTypeOptionId: option.id,
    };
  }),
  ...extra,
});

const shiftTypeDetailShifts: ShiftData[] = [
  // 責任者。早番と中番を続けて入り、早番の中で休憩する。
  shiftTypeShift(
    "staff1",
    shiftTypeDate,
    [
      ["morning", hall],
      ["middle", hall],
    ],
    { breaks: [{ start: "11:00", end: "11:30" }] },
  ),
  shiftTypeShift("staff2", shiftTypeDate, [["middle", kitchen]]),
  shiftTypeShift("staff3", shiftTypeDate, [["late", hall]], { breaks: [{ start: "19:00", end: "19:30" }] }),
  // 新人。
  shiftTypeShift("staff4", shiftTypeDate, [["night", register]]),
  shiftTypeShift("staff5", shiftTypeDate, [], { requestedShiftTypeOptionIds: [] }),
  // 未提出者へ入れた仮の勤務。
  shiftTypeShift("staff6", shiftTypeDate, [["morning", kitchen]], {
    requestedShiftTypeOptionIds: [],
    isProvisional: true,
  }),
  // 2日目。人ごとの合計に効く。
  shiftTypeShift("staff1", shiftTypeNextDate, [["morning", hall]]),
  shiftTypeShift("staff2", shiftTypeNextDate, [["late", kitchen]]),
];

const shiftTypeDetailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        {
          key: { kind: "shiftType", optionId: "morning" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 1],
          ]),
        },
        {
          key: { kind: "shiftType", optionId: "middle" },
          requirements: requirements([
            [hall, 1],
            [kitchen, 1],
          ]),
        },
        {
          key: { kind: "shiftType", optionId: "late" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 1],
          ]),
        },
        { key: { kind: "shiftType", optionId: "night" }, requirements: requirements([[register, 1]]) },
      ],
    },
  ],
  dayTemplateOverrides: [],
  breakRule: null,
};

export const shiftTypeDetailArgs = {
  ...shiftTypeArgs,
  staffs: shiftTypeDetailStaffs,
  positions: detailPositions,
  initialShifts: shiftTypeDetailShifts,
  staffing: shiftTypeDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;

// ==========================================
// 日付選択
// ==========================================
const [dateOnlyDate, dateOnlyNextDate] = mockDateOnlyDates;
const dateOnlyDetailStaffs = withSkillLevels(mockDateOnlyStaffs);
const dateOnlyRequest = { start: "09:00", end: "22:00" };

const dateOnlyShift = (
  staffId: string,
  date: string,
  position: PositionType | null,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: staffNameOf(dateOnlyDetailStaffs, staffId),
  date,
  requestedTime: dateOnlyRequest,
  requestedTimes: [dateOnlyRequest],
  positions: position
    ? [
        {
          id: `seg-${staffId}-${date}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "09:00",
          end: "22:00",
        },
      ]
    : [],
  ...extra,
});

const dateOnlyDetailShifts: ShiftData[] = [
  // 責任者。休憩あり。
  dateOnlyShift("staff1", dateOnlyDate, hall, { breaks: [{ start: "12:00", end: "13:00" }] }),
  dateOnlyShift("staff2", dateOnlyDate, kitchen),
  // 希望はあるが、まだ入れていない。
  dateOnlyShift("staff3", dateOnlyDate, null),
  // 新人。
  dateOnlyShift("staff4", dateOnlyDate, register),
  // 未提出者へ入れた仮の勤務。
  dateOnlyShift("staff6", dateOnlyDate, hall, { requestedTime: null, requestedTimes: [], isProvisional: true }),
  // 2日目。人ごとの合計に効く。
  dateOnlyShift("staff1", dateOnlyNextDate, hall),
  dateOnlyShift("staff4", dateOnlyNextDate, kitchen),
];

const dateOnlyDetailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        {
          key: { kind: "allDay" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 2],
            [register, 1],
          ]),
        },
      ],
    },
  ],
  dayTemplateOverrides: [],
  breakRule: null,
};

export const dateOnlyDetailArgs = {
  ...dateOnlyArgs,
  staffs: dateOnlyDetailStaffs,
  positions: detailPositions,
  initialShifts: dateOnlyDetailShifts,
  staffing: dateOnlyDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;
