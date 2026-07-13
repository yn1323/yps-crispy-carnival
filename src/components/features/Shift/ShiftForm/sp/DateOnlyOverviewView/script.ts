import {
  buildWeeklyGrid,
  formatDateShort,
  formatDateWithWeekday,
  getWeekdayLabel,
  isSaturday,
  isSunday,
} from "@/src/domains/shift/date";
import { hasDateOnlyAssignment } from "@/src/domains/shift/dateOnlyAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";

export type DateOnlyOverviewWeekdayTone = "weekday" | "saturday" | "sunday" | "muted";

export type DateOnlyOverviewStaffRowViewModel = {
  key: string;
  name: string;
};

export type DateOnlyOverviewDayRowViewModel = {
  key: string;
  iso: string;
  dateLabel: string;
  weekdayLabel: string;
  dateTone: "default" | "muted";
  weekdayTone: DateOnlyOverviewWeekdayTone;
  warningCount: number;
  hasTopBorder: boolean;
  canOpenDaily: boolean;
  actionAriaLabel: string | undefined;
  statusAriaLabel: string | undefined;
  statusLabel: string | null;
  staffRows: DateOnlyOverviewStaffRowViewModel[];
};

export type DateOnlyOverviewWeekViewModel = {
  key: string;
  label: string;
  rows: DateOnlyOverviewDayRowViewModel[];
};

export type DateOnlyOverviewViewModel = {
  weeks: DateOnlyOverviewWeekViewModel[];
};

const getWeekdayTone = (iso: string, inRange: boolean): DateOnlyOverviewWeekdayTone => {
  if (!inRange) return "muted";
  if (isSunday(iso)) return "sunday";
  if (isSaturday(iso)) return "saturday";
  return "weekday";
};

export const buildDateOnlyOverviewViewModel = ({
  dates,
  holidays,
  staffs,
  shifts,
  warningCounts,
  isReadOnly,
}: {
  dates: string[];
  holidays: string[];
  staffs: StaffType[];
  shifts: ShiftData[];
  warningCounts: ReadonlyMap<string, number>;
  isReadOnly: boolean;
}): DateOnlyOverviewViewModel => {
  const holidaySet = new Set(holidays);
  const shiftByStaffDate = new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));

  return {
    weeks: buildWeeklyGrid(dates).map((week) => {
      const start = week[0]?.iso ?? "";
      const end = week[week.length - 1]?.iso ?? start;

      return {
        key: `${start}-${end}`,
        label: start === end ? formatDateShort(start) : `${formatDateShort(start)} \u2013 ${formatDateShort(end)}`,
        rows: week.map((date, index) => {
          const isClosed = date.inRange && holidaySet.has(date.iso);
          const staffRows =
            date.inRange && !isClosed
              ? staffs.flatMap((staff): DateOnlyOverviewStaffRowViewModel[] =>
                  hasDateOnlyAssignment(shiftByStaffDate.get(`${staff.id}-${date.iso}`))
                    ? [{ key: staff.id, name: staff.name }]
                    : [],
                )
              : [];
          const canOpenDaily = !isReadOnly && date.inRange && !isClosed;
          const statusLabel = !date.inRange
            ? "期間外"
            : isClosed
              ? "定休日"
              : staffRows.length === 0
                ? "勤務なし"
                : null;

          return {
            key: date.iso,
            iso: date.iso,
            dateLabel: formatDateShort(date.iso),
            weekdayLabel: getWeekdayLabel(date.iso),
            dateTone: date.inRange ? "default" : "muted",
            weekdayTone: getWeekdayTone(date.iso, date.inRange),
            warningCount: warningCounts.get(date.iso) ?? 0,
            hasTopBorder: index > 0,
            canOpenDaily,
            actionAriaLabel: canOpenDaily ? `${formatDateWithWeekday(date.iso)}の日別を表示` : undefined,
            statusAriaLabel: !date.inRange ? `${formatDateWithWeekday(date.iso)} 期間外` : undefined,
            statusLabel,
            staffRows,
          };
        }),
      };
    }),
  };
};
