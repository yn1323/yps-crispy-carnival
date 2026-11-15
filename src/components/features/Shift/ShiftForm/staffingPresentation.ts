import { resolveDayTemplateForDate, type ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import {
  countStaffingByDay,
  countStaffingByHour,
  countStaffingByShiftType,
  countStaffingByTimeSlots,
  type StaffingSlotCount,
} from "@/src/domains/shift/staffing";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffingSlot, StaffType, TimeRange } from "@/src/domains/shift/types";
import type { ShiftFormStaffing } from "./stores";
import { getEditableEndMinutes, getEditableStartMinutes } from "./timelineGeometry";

// その日の「人数 / 必要」を、画面へ出す形にまとめる。

export type StaffingPositionView = {
  positionId: string;
  name: string;
  color: string;
  count: number;
  required: number | null;
  shortage: number;
};

export type StaffingSlotView = {
  id: string;
  label: string;
  total: number;
  positions: StaffingPositionView[];
  hasShortage: boolean;
  // 時間指定の区切りだけが持つ。タイムライン上の位置に使う。
  startMinutes?: number;
  endMinutes?: number;
};

export type DayStaffingView = {
  // その日に当たっている日の型。型がない日はnull。
  template: { id: string; name: string } | null;
  // 曜日の割り当てではなく、その日だけの指定で型が当たっているかどうか。
  isOverridden: boolean;
  slots: StaffingSlotView[];
  hasShortage: boolean;
};

type BuildInput = {
  date: string;
  // その日の勤務（シフト対象のスタッフ分）
  shifts: readonly ShiftData[];
  positions: readonly PositionType[];
  submissionPattern: ShiftSubmissionPattern;
  timeRange: TimeRange;
  staffing: ShiftFormStaffing | undefined;
};

const slotLabel = (count: StaffingSlotCount, pattern: ShiftSubmissionPattern): string => {
  if (count.key.kind === "time") {
    return `${formatShiftClockTime(count.key.startTime)}–${formatShiftClockTime(count.key.endTime)}`;
  }
  if (count.key.kind === "shiftType") {
    const optionId = count.key.optionId;
    const option = pattern.kind === "shiftType" ? pattern.options.find((item) => item.id === optionId) : undefined;
    return option?.name ?? "勤務パターン";
  }
  return "1日";
};

const slotId = (count: StaffingSlotCount): string => {
  if (count.key.kind === "time") return `time:${count.key.startTime}-${count.key.endTime}`;
  if (count.key.kind === "shiftType") return `shiftType:${count.key.optionId}`;
  return "allDay";
};

/**
 * その日の人数に数える勤務を返す。
 * 数えるのは、いま在籍しているシフト対象のスタッフの勤務だけである。削除済みのスタッフに残った勤務は数えない。
 */
export const selectStaffingShifts = (
  shifts: readonly ShiftData[],
  staffs: ReadonlyArray<Pick<StaffType, "id" | "isRemoved">>,
  date: string,
): ShiftData[] => {
  const staffIds = new Set(staffs.filter((staff) => !staff.isRemoved).map((staff) => staff.id));
  return shifts.filter((shift) => shift.date === date && staffIds.has(shift.staffId));
};

export const buildDayStaffingView = (input: BuildInput): DayStaffingView => {
  const templates = (input.staffing?.dayTemplates ?? []).map((template) => ({
    ...template,
    weekdays: template.weekdays as ShiftSetupWeekday[],
  }));
  const overrides = input.staffing?.dayTemplateOverrides ?? [];
  const template = resolveDayTemplateForDate(input.date, templates, overrides);
  const slots: readonly StaffingSlot[] = template?.slots ?? [];
  const positionIds = input.positions.map((position) => position.id);
  const base = { shifts: input.shifts, positionIds };

  const counts: StaffingSlotCount[] =
    input.submissionPattern.kind === "time"
      ? slots.some((slot) => slot.key.kind === "time")
        ? countStaffingByTimeSlots({ ...base, slots })
        : countStaffingByHour({
            ...base,
            startMinutes: getEditableStartMinutes(input.timeRange),
            endMinutes: getEditableEndMinutes(input.timeRange),
          })
      : input.submissionPattern.kind === "shiftType"
        ? countStaffingByShiftType({
            ...base,
            optionIds: input.submissionPattern.options.map((option) => option.id),
            slots,
          })
        : [countStaffingByDay({ ...base, slots })];

  const positionById = new Map(input.positions.map((position) => [position.id, position]));
  const slotViews = counts.map((count): StaffingSlotView => {
    const positions = count.positions.flatMap((item) => {
      const position = positionById.get(item.positionId);
      return position ? [{ ...item, name: position.name, color: position.color }] : [];
    });
    return {
      id: slotId(count),
      label: slotLabel(count, input.submissionPattern),
      total: count.total,
      positions,
      hasShortage: count.hasShortage,
      ...(count.key.kind === "time"
        ? { startMinutes: timeToMinutes(count.key.startTime), endMinutes: timeToMinutes(count.key.endTime) }
        : {}),
    };
  });

  return {
    template: template ? { id: template.id, name: template.name } : null,
    isOverridden: template !== null && overrides.some((entry) => entry.date === input.date),
    slots: slotViews,
    hasShortage: slotViews.some((slot) => slot.hasShortage),
  };
};

/** 人数の表示。必要人数がある場合は「2/3」、ない場合は「2」。 */
export const formatStaffingCount = (count: number, required: number | null): string =>
  required === null ? `${count}` : `${count}/${required}`;

/** 「くわしく」表示を初期状態にするかどうか。何も設定していない店舗では、従来の画面のままにする。 */
export const shouldDefaultToDetailMode = (input: {
  positionCount: number;
  staffing: ShiftFormStaffing | undefined;
  hasStaffProfiles: boolean;
}): boolean =>
  input.positionCount >= 2 ||
  (input.staffing?.dayTemplates.length ?? 0) > 0 ||
  (input.staffing?.breakRule ?? null) !== null ||
  input.hasStaffProfiles;
