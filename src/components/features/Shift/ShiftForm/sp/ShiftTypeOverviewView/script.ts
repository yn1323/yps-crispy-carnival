import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { buildWeeklyGrid, formatDateShort, getWeekdayLabel, isSaturday, isSunday } from "@/src/domains/shift/date";
import { getAssignedShiftTypeOptionIdsInOptionOrder } from "@/src/domains/shift/shiftTypeAssignments";
import { sortDailyStaffsByDate } from "@/src/domains/shift/sortStaffs";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";

export type ShiftTypeOverviewWeekdayTone = "weekday" | "saturday" | "sunday" | "muted";

export type ShiftTypeOverviewOptionChipViewModel = {
  key: string;
  label: string;
  colorIndex: number;
};

export type ShiftTypeOverviewStaffRowViewModel = {
  key: string;
  name: string;
  optionChips: ShiftTypeOverviewOptionChipViewModel[];
};

export type ShiftTypeOverviewDayRowViewModel = {
  key: string;
  iso: string;
  dateLabel: string;
  weekdayLabel: string;
  dateTone: "default" | "muted";
  weekdayTone: ShiftTypeOverviewWeekdayTone;
  surfaceTone: "default" | "muted";
  closedLabel: string | null;
  statusLabel: string | null;
  statusTone: "outOfRange" | "closed" | "empty" | null;
  warningCount: number;
  hasTopBorder: boolean;
  canOpenDaily: boolean;
  staffRows: ShiftTypeOverviewStaffRowViewModel[];
};

export type ShiftTypeOverviewWeekViewModel = {
  key: number;
  label: string;
  rows: ShiftTypeOverviewDayRowViewModel[];
};

export type ShiftTypeOverviewViewModel = {
  weeks: ShiftTypeOverviewWeekViewModel[];
};

const getWeekdayTone = (iso: string, inRange: boolean): ShiftTypeOverviewWeekdayTone => {
  if (!inRange) return "muted";
  if (isSunday(iso)) return "sunday";
  if (isSaturday(iso)) return "saturday";
  return "weekday";
};

export const buildShiftTypeOverviewViewModel = ({
  dates,
  holidays,
  staffs,
  shifts,
  submissionPattern,
  warningCounts,
  isReadOnly,
}: {
  dates: string[];
  holidays: string[];
  staffs: StaffType[];
  shifts: ShiftData[];
  submissionPattern: ShiftSubmissionPattern;
  warningCounts: ReadonlyMap<string, number>;
  isReadOnly: boolean;
}): ShiftTypeOverviewViewModel => {
  const options =
    submissionPattern.kind === "shiftType"
      ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  const optionIds = options.map((option) => option.id);
  const optionById = new Map(options.map((option, colorIndex) => [option.id, { option, colorIndex }]));
  const holidaySet = new Set(holidays);
  const shiftByStaffDate = new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));
  const sortedStaffsByDate = sortDailyStaffsByDate({ staffs, shifts, mode: "shiftType" });

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
              ? dailyStaffs.flatMap((staff): ShiftTypeOverviewStaffRowViewModel[] => {
                  const assignedOptionIds = getAssignedShiftTypeOptionIdsInOptionOrder(
                    shiftByStaffDate.get(`${staff.id}-${date.iso}`),
                    optionIds,
                  );
                  if (assignedOptionIds.length === 0) return [];

                  return [
                    {
                      key: staff.id,
                      name: staff.name,
                      optionChips: assignedOptionIds.flatMap((optionId): ShiftTypeOverviewOptionChipViewModel[] => {
                        const item = optionById.get(optionId);
                        return item ? [{ key: optionId, label: item.option.name, colorIndex: item.colorIndex }] : [];
                      }),
                    },
                  ];
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
            weekdayTone: getWeekdayTone(date.iso, date.inRange),
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
