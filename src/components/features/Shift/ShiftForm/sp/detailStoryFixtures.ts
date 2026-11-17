import type { ComponentProps } from "react";
import { getDayOfWeek } from "@/src/domains/shift/date";
import type { PositionSegment, PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import type { ShiftForm } from "..";
import {
  mockDateOnlyDates,
  mockDateOnlyStaffs,
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeStaffs,
  mockStaffs,
  withPositionSkills,
} from "../stories/fixtures";
import { allPatternsArgs, dateOnlyArgs, shiftTypeArgs } from "../stories/shared";
import {
  buildStaffing,
  type StoryTemplate,
  staffingCounts,
  templateDay,
  timeRequirements,
  unsetDay,
} from "../stories/staffingHarness";

// スマートフォンの「くわしく表示」のStoryで共有するfixture。
// 複数ポジション、必要人数あり（不足、多い人数、見習いだけ）、休憩あり、熟練度あり、仮の勤務ありを1画面で確かめられるようにする。

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

export const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
export const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
export const register: PositionType = { id: "register", name: "レジ", color: "#a78bfa", isDefault: false };
export const detailPositions = [hall, kitchen, register];

// 平日（月〜金）はテンプレートを当て、土日は未設定にする。
const weekdayDays = (dates: readonly string[], template: StoryTemplate) =>
  dates.map((date) => {
    const weekday = getDayOfWeek(date);
    return weekday === 0 || weekday === 6 ? unsetDay(date) : templateDay(date, template);
  });

const noopStaffingActions = {
  onApplyTemplate: async () => true,
  onSaveCustom: async () => true,
  isPending: false,
};
const detailActions = { onOpenSetup: () => {}, dayStaffingActions: noopStaffingActions };

// staff1は、ホールではリーダー、キッチンでは見習い。staff4は、キッチンとレジで見習い。staff5は、ホールが担当外。
const withSkillLevels = (staffs: StaffType[]): StaffType[] =>
  withPositionSkills(staffs, {
    staff1: { [hall.id]: "lead", [kitchen.id]: "newcomer" },
    staff4: { [kitchen.id]: "newcomer", [register.id]: "newcomer" },
    staff5: { [hall.id]: "unavailable" },
  });

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
  // ホールではリーダー、キッチンでは見習い。途中でポジションが変わり、ホールの時間に休憩する。
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
  // レジでは見習い。勤務と勤務の間が空いている。
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

// 平日のテンプレート。ホールは午前に2人、キッチンは午後に2人、レジは午後だけ1人が必要。
export const timeWeekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: timeRequirements([
    [hall, "09:00", "13:00", 2],
    [hall, "13:00", "22:00"],
    [kitchen, "09:00", "13:00"],
    [kitchen, "13:00", "17:00", 2],
    [register, "13:00", "17:00"],
  ]),
};
export const timeEventTemplate: StoryTemplate = {
  id: "event",
  name: "イベント日",
  requirements: timeRequirements([
    [hall, "09:00", "22:00", 3],
    [kitchen, "09:00", "22:00", 2],
  ]),
};
export const timeDetailTemplates = [timeWeekdayTemplate, timeEventTemplate];
// 2026-01-23は金曜（平日のテンプレートが当たる）、24は土曜（テンプレートが当たらない）。
export const timeDetailDays = weekdayDays([timeDetailDate, timeDetailNextDate], timeWeekdayTemplate);
export const timeDetailStaffing = buildStaffing({ templates: timeDetailTemplates, days: timeDetailDays });

export const timeDetailArgs = {
  ...allPatternsArgs,
  dates: [timeDetailDate, timeDetailNextDate],
  staffs: timeDetailStaffs,
  positions: detailPositions,
  initialShifts: timeDetailShifts,
  staffing: timeDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions,
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
  // リーダー。早番と中番を続けて入り、早番の中で休憩する。
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
  // 見習い。
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

export const shiftTypeWeekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: {
    kind: "shiftType",
    options: [
      {
        optionId: "morning",
        counts: staffingCounts([
          [hall, 2],
          [kitchen, 1],
        ]),
      },
      {
        optionId: "middle",
        counts: staffingCounts([
          [hall, 1],
          [kitchen, 1],
        ]),
      },
      {
        optionId: "late",
        counts: staffingCounts([
          [hall, 2],
          [kitchen, 1],
        ]),
      },
      { optionId: "night", counts: staffingCounts([[register, 1]]) },
    ],
  },
};
export const shiftTypeEventTemplate: StoryTemplate = {
  id: "event",
  name: "イベント日",
  requirements: {
    kind: "shiftType",
    options: [
      { optionId: "morning", counts: staffingCounts([[hall, 3]]) },
      { optionId: "middle", counts: staffingCounts([[hall, 3]]) },
    ],
  },
};
export const shiftTypeDetailTemplates = [shiftTypeWeekdayTemplate, shiftTypeEventTemplate];
export const shiftTypeDetailDays = weekdayDays(mockShiftTypeDates, shiftTypeWeekdayTemplate);
const shiftTypeDetailStaffing = buildStaffing({ templates: shiftTypeDetailTemplates, days: shiftTypeDetailDays });

export const shiftTypeDetailArgs = {
  ...shiftTypeArgs,
  staffs: shiftTypeDetailStaffs,
  positions: detailPositions,
  initialShifts: shiftTypeDetailShifts,
  staffing: shiftTypeDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions,
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
  // リーダー。休憩あり。
  dateOnlyShift("staff1", dateOnlyDate, hall, { breaks: [{ start: "12:00", end: "13:00" }] }),
  dateOnlyShift("staff2", dateOnlyDate, kitchen),
  // 希望はあるが、まだ入れていない。
  dateOnlyShift("staff3", dateOnlyDate, null),
  // 見習い。
  dateOnlyShift("staff4", dateOnlyDate, register),
  // 未提出者へ入れた仮の勤務。
  dateOnlyShift("staff6", dateOnlyDate, hall, { requestedTime: null, requestedTimes: [], isProvisional: true }),
  // 2日目。人ごとの合計に効く。
  dateOnlyShift("staff1", dateOnlyNextDate, hall),
  dateOnlyShift("staff4", dateOnlyNextDate, kitchen),
];

export const dateOnlyWeekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: {
    kind: "dateOnly",
    counts: staffingCounts([
      [hall, 2],
      [kitchen, 2],
      [register, 1],
    ]),
  },
};
export const dateOnlyEventTemplate: StoryTemplate = {
  id: "event",
  name: "イベント日",
  requirements: {
    kind: "dateOnly",
    counts: staffingCounts([
      [hall, 3],
      [kitchen, 3],
    ]),
  },
};
export const dateOnlyDetailTemplates = [dateOnlyWeekdayTemplate, dateOnlyEventTemplate];
export const dateOnlyDetailDays = weekdayDays(mockDateOnlyDates, dateOnlyWeekdayTemplate);
const dateOnlyDetailStaffing = buildStaffing({ templates: dateOnlyDetailTemplates, days: dateOnlyDetailDays });

export const dateOnlyDetailArgs = {
  ...dateOnlyArgs,
  staffs: dateOnlyDetailStaffs,
  positions: detailPositions,
  initialShifts: dateOnlyDetailShifts,
  staffing: dateOnlyDetailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions,
} satisfies ShiftFormArgs;
