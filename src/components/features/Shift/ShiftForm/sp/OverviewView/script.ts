import { buildWeeklyGrid, formatDateShort, getWeekdayLabel } from "@/src/domains/shift/date";
import { isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { sortDailyStaffsByDate } from "@/src/domains/shift/sortStaffs";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { getShiftWeekdayTone, type ShiftWeekdayTone } from "../../weekdayPresentation";

export type OverviewWeekdayTone = ShiftWeekdayTone;

export type OverviewPositionMarkViewModel = {
  key: string;
  positionId: string;
  positionName: string;
  color: string;
};

export type OverviewStaffRowViewModel = {
  key: string;
  name: string;
  assignedTimeLabel: string;
  // 以下は、くわしく表示の印（熟練度、ポジション、休憩）に使う。
  staff: StaffType;
  shift: ShiftData;
  positionMarks: OverviewPositionMarkViewModel[];
};

export type OverviewDayRowViewModel = {
  key: string;
  iso: string;
  dateLabel: string;
  weekdayLabel: string;
  dateTone: "default" | "muted";
  weekdayTone: OverviewWeekdayTone;
  surfaceTone: "default" | "muted";
  closedLabel: string | null;
  statusLabel: string | null;
  statusTone: "outOfRange" | "closed" | "empty" | null;
  warningCount: number;
  hasTopBorder: boolean;
  canOpenDaily: boolean;
  staffRows: OverviewStaffRowViewModel[];
};

export type OverviewWeekViewModel = {
  key: number;
  label: string;
  rows: OverviewDayRowViewModel[];
};

export type OverviewViewModel = {
  weeks: OverviewWeekViewModel[];
};

const getAssignedRange = (shift: ShiftData): [string, string] | null => {
  if (shift.positions.length === 0) return null;
  const sorted = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

// その日に入っているポジションを、勤務の早い順に重複なく並べる。
const getPositionMarks = (shift: ShiftData): OverviewPositionMarkViewModel[] => {
  const marks = new Map<string, OverviewPositionMarkViewModel>();
  for (const position of shift.positions
    .filter(isLegacyCompatibleWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start))) {
    if (!marks.has(position.positionId)) {
      marks.set(position.positionId, {
        key: position.positionId,
        positionId: position.positionId,
        positionName: position.positionName,
        color: position.color,
      });
    }
  }
  return [...marks.values()];
};

export const buildOverviewViewModel = ({
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
}): OverviewViewModel => {
  const holidaySet = new Set(holidays);
  const assignedByStaffDate = new Map<string, { range: [string, string]; shift: ShiftData }>();
  for (const shift of shifts) {
    const range = getAssignedRange(shift);
    if (range) assignedByStaffDate.set(`${shift.staffId}-${shift.date}`, { range, shift });
  }
  const sortedStaffsByDate = sortDailyStaffsByDate({ staffs, shifts, mode: "time" });

  return {
    weeks: buildWeeklyGrid(dates).map((week, weekIndex) => {
      const start = week[0]?.iso ?? "";
      const end = week[week.length - 1]?.iso ?? start;

      return {
        key: weekIndex,
        label: start === end ? formatDateShort(start) : `${formatDateShort(start)} \u2013 ${formatDateShort(end)}`,
        rows: week.map((date, index) => {
          const isClosed = date.inRange && holidaySet.has(date.iso);
          const dailyStaffs = sortedStaffsByDate.get(date.iso) ?? staffs;
          const staffRows =
            date.inRange && !isClosed
              ? dailyStaffs.flatMap((staff): OverviewStaffRowViewModel[] => {
                  const assigned = assignedByStaffDate.get(`${staff.id}-${date.iso}`);
                  return assigned
                    ? [
                        {
                          key: staff.id,
                          name: staff.name,
                          assignedTimeLabel: `${formatShiftClockTime(assigned.range[0])}\u2013${formatShiftClockTime(assigned.range[1])}`,
                          staff,
                          shift: assigned.shift,
                          positionMarks: getPositionMarks(assigned.shift),
                        },
                      ]
                    : [];
                })
              : [];
          const statusLabel = !date.inRange
            ? "期間外"
            : isClosed
              ? "定休日"
              : staffRows.length === 0
                ? "出勤なし"
                : null;
          const statusTone = !date.inRange ? "outOfRange" : isClosed ? "closed" : statusLabel ? "empty" : null;

          return {
            key: date.iso,
            iso: date.iso,
            dateLabel: formatDateShort(date.iso),
            weekdayLabel: getWeekdayLabel(date.iso),
            dateTone: date.inRange ? "default" : "muted",
            weekdayTone: getShiftWeekdayTone(date.iso, date.inRange),
            surfaceTone: isClosed || !date.inRange ? "muted" : "default",
            closedLabel: isClosed ? "定休日" : null,
            statusLabel,
            statusTone,
            warningCount: warningCounts.get(date.iso) ?? 0,
            hasTopBorder: index > 0,
            canOpenDaily: !isReadOnly && date.inRange,
            staffRows,
          };
        }),
      };
    }),
  };
};
