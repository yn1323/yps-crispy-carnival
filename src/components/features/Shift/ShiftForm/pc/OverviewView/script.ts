import dayjs from "dayjs";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel, type WeekStart } from "@/src/domains/shift/date";
import { formatShiftClockTime, timeToMinutes } from "@/src/domains/shift/time";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";

export type OverviewDateViewModel = {
  iso: string;
  label: string;
  weekdayLabel: string;
  weekdayColor: string;
  inRange: boolean;
  isClosed: boolean;
  isClickable: boolean;
  warningCount: number;
};

export type OverviewCellViewModel = {
  key: string;
  text: string;
  tone: "closed" | "assigned" | "empty" | "outOfRange";
};

export type OverviewStaffRowViewModel = {
  key: string;
  name: string;
  isUnsubmitted: boolean;
  cells: OverviewCellViewModel[];
  totalLabel: string;
  hasTotal: boolean;
};

export type OverviewWeekViewModel = {
  key: string;
  rangeLabel: string;
  dates: OverviewDateViewModel[];
  rows: OverviewStaffRowViewModel[];
};

const getWeekdayColor = (iso: string): string => {
  const day = dayjs(iso).day();
  if (day === 0) return "#ef4444";
  if (day === 6) return "#3b82f6";
  return "#3f3f46";
};

const getAssignedRange = (shift: ShiftData): [string, string] | null => {
  if (shift.positions.length === 0) return null;
  const sorted = [...shift.positions].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return [sorted[0].start, sorted[sorted.length - 1].end];
};

const getAssignedHours = (range: [string, string] | null): number => {
  if (!range) return 0;
  return (timeToMinutes(range[1]) - timeToMinutes(range[0])) / 60;
};

export const buildOverviewWeeks = ({
  dates,
  weekStart,
  holidays,
  isReadOnly,
  staffs,
  shifts,
  warningCounts,
}: {
  dates: string[];
  weekStart: WeekStart;
  holidays: string[];
  isReadOnly: boolean;
  staffs: StaffType[];
  shifts: ShiftData[];
  warningCounts: ReadonlyMap<string, number>;
}): OverviewWeekViewModel[] => {
  const assignedRangeByStaffDate = new Map<string, [string, string]>();
  for (const shift of shifts) {
    const range = getAssignedRange(shift);
    if (range) assignedRangeByStaffDate.set(`${shift.staffId}-${shift.date}`, range);
  }

  return buildWeeklyGrid(dates, weekStart).map((week) => {
    const dateViewModels = week.map((date): OverviewDateViewModel => {
      const isClosed = date.inRange && holidays.includes(date.iso);
      return {
        iso: date.iso,
        label: `${dayjs(date.iso).month() + 1}/${dayjs(date.iso).date()}`,
        weekdayLabel: getWeekdayLabel(date.iso),
        weekdayColor: getWeekdayColor(date.iso),
        inRange: date.inRange,
        isClosed,
        isClickable: !isReadOnly && date.inRange,
        warningCount: warningCounts.get(date.iso) ?? 0,
      };
    });
    const start = dateViewModels[0]?.iso ?? "";
    const end = dateViewModels[dateViewModels.length - 1]?.iso ?? start;

    return {
      key: start,
      rangeLabel: start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`,
      dates: dateViewModels,
      rows: staffs.map((staff): OverviewStaffRowViewModel => {
        let totalHours = 0;
        const cells = dateViewModels.map((date): OverviewCellViewModel => {
          if (date.isClosed) return { key: date.iso, text: "定休日", tone: "closed" };
          if (!date.inRange) return { key: date.iso, text: "—", tone: "outOfRange" };
          const range = assignedRangeByStaffDate.get(`${staff.id}-${date.iso}`) ?? null;
          if (!range) return { key: date.iso, text: "—", tone: "empty" };
          totalHours += getAssignedHours(range);
          return {
            key: date.iso,
            text: `${formatShiftClockTime(range[0])}–${formatShiftClockTime(range[1])}`,
            tone: "assigned",
          };
        });

        return {
          key: staff.id,
          name: staff.name,
          isUnsubmitted: !staff.isSubmitted,
          cells,
          totalLabel: totalHours ? `${totalHours}h` : "—",
          hasTotal: totalHours > 0,
        };
      }),
    };
  });
};
