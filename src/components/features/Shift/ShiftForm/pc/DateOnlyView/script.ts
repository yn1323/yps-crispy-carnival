import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getEffectiveBreaks } from "@/src/domains/shift/breaks";
import { buildWeeklyGrid, formatDateRangeShort, formatDateShort } from "@/src/domains/shift/date";
import { hasDateOnlyAssignment, hasDateOnlyRequest } from "@/src/domains/shift/dateOnlyAssignments";
import { isCanonicalWorkPosition } from "@/src/domains/shift/positions";
import type { PositionType, ShiftData, StaffType, TimeRange } from "@/src/domains/shift/types";
import { buildDayStaffingView, type DayStaffingView } from "../../staffingPresentation";
import type { ShiftFormStaffing } from "../../stores";
import type { DateInfo, DateOnlyColumn, DateOnlyRequestBadgeViewModel, DateOnlyRowViewModel, WeekItem } from "./types";

export const buildDateOnlyWeeks = (dates: string[]): WeekItem[] =>
  buildWeeklyGrid(dates).map((week, index) => {
    const start = week[0]?.iso ?? "";
    const end = week[week.length - 1]?.iso ?? start;
    return {
      key: `${start}-${end}`,
      label: start === end ? formatDateShort(start) : formatDateRangeShort(start, end, "-"),
      subLabel: `${index + 1}週目`,
      dates: week,
    };
  });

export const getSortableDates = (dates: DateInfo[], holidays: string[]): DateInfo[] => {
  const inRangeDates = dates.filter((date) => date.inRange);
  const openDates = inRangeDates.filter((date) => !holidays.includes(date.iso));
  return openDates.length > 0 ? openDates : inRangeDates;
};

export const buildDateOnlyRows = ({
  staffs,
  shifts,
  dates,
  holidays,
  isConfirmedDisplay,
  warningMessagesByStaffId,
}: {
  staffs: StaffType[];
  shifts: ShiftData[];
  dates: DateInfo[];
  holidays: string[];
  isConfirmedDisplay: boolean;
  warningMessagesByStaffId: ReadonlyMap<string, string[]>;
}): DateOnlyRowViewModel[] => {
  const shiftByStaffDate = new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));

  return staffs.map((staff) => {
    const requestedDates = dates.filter((date) => {
      const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
      return date.inRange && hasDateOnlyRequest(shift);
    });
    const requestBadges: DateOnlyRequestBadgeViewModel[] = !staff.isSubmitted
      ? [{ key: "unsubmitted", label: "未提出", tone: "warning" }]
      : requestedDates.length > 0
        ? requestedDates.map((date) => ({ key: date.iso, label: formatDateShort(date.iso), tone: "requested" }))
        : [{ key: "empty", label: isConfirmedDisplay ? "勤務なし" : "希望なし", tone: "muted" }];

    return {
      staff,
      isStaffNameMuted: !staff.isSubmitted,
      warningMessages: warningMessagesByStaffId.get(staff.id) ?? [],
      requestBadges,
      cells: dates.map((date) => {
        const shift = shiftByStaffDate.get(`${staff.id}-${date.iso}`);
        const assigned = hasDateOnlyAssignment(shift);
        // 日付選択の休憩は勤務の時刻に縛られないため、入力されたままを数える。
        const hasBreak = !!shift && assigned && getEffectiveBreaks(shift, { clipToWork: false }).length > 0;
        return {
          date,
          assigned,
          requested: hasDateOnlyRequest(shift),
          isClosed: date.inRange && holidays.includes(date.iso),
          segment: shift?.positions.find(isCanonicalWorkPosition),
          breakShift: hasBreak ? shift : undefined,
          isProvisional: assigned && shift?.isProvisional === true,
        };
      }),
    };
  });
};

export type DateOnlyRowNote = { date: string; note: string };

/** 表示中の週のメモを、そのスタッフの行に日付順で並べるために抜き出す。 */
export const buildRowWeekNotes = (
  staffId: string,
  columns: readonly DateOnlyColumn[],
  getNote: (staffId: string, date: string) => string | undefined,
): DateOnlyRowNote[] =>
  columns.flatMap(({ date }) => {
    const note = getNote(staffId, date.iso);
    return note ? [{ date: date.iso, note }] : [];
  });

/**
 * 表示中の週の、日付ごとの人数と過不足を返す。くわしく表示の人数の行に使う。
 * 定休日は数えない。数える対象は、シフト対象のスタッフの勤務だけにする。
 */
export const buildDateOnlyStaffingByDate = ({
  dates,
  holidays,
  staffs,
  shifts,
  positions,
  submissionPattern,
  timeRange,
  staffing,
}: {
  dates: readonly string[];
  holidays: readonly string[];
  staffs: readonly StaffType[];
  shifts: readonly ShiftData[];
  positions: readonly PositionType[];
  submissionPattern: ShiftSubmissionPattern;
  timeRange: TimeRange;
  staffing: ShiftFormStaffing | undefined;
}): Map<string, DayStaffingView> => {
  // 削除済みのスタッフに残った勤務は数えない。日別の表示（selectStaffingShifts）と同じ対象にそろえる。
  const staffIds = new Set(staffs.filter((staff) => !staff.isRemoved).map((staff) => staff.id));
  const shiftsByDate = new Map<string, ShiftData[]>();
  for (const shift of shifts) {
    if (!staffIds.has(shift.staffId)) continue;
    const dayShifts = shiftsByDate.get(shift.date) ?? [];
    dayShifts.push(shift);
    shiftsByDate.set(shift.date, dayShifts);
  }

  return new Map(
    dates
      .filter((date) => !holidays.includes(date))
      .map((date) => [
        date,
        buildDayStaffingView({
          date,
          shifts: shiftsByDate.get(date) ?? [],
          positions,
          submissionPattern,
          timeRange,
          staffing,
        }),
      ]),
  );
};
