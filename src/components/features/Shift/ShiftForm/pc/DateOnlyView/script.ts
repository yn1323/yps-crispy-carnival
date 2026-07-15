import { buildWeeklyGrid, formatDateShort } from "@/src/domains/shift/date";
import { hasDateOnlyAssignment, hasDateOnlyRequest } from "@/src/domains/shift/dateOnlyAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import type { DateInfo, DateOnlyRequestBadgeViewModel, DateOnlyRowViewModel, WeekItem } from "./types";

export const buildDateOnlyWeeks = (dates: string[]): WeekItem[] =>
  buildWeeklyGrid(dates).map((week, index) => {
    const start = week[0]?.iso ?? "";
    const end = week[week.length - 1]?.iso ?? start;
    return {
      key: `${start}-${end}`,
      label: start === end ? formatDateShort(start) : `${formatDateShort(start)}-${formatDateShort(end)}`,
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
        return {
          date,
          assigned: hasDateOnlyAssignment(shift),
          requested: hasDateOnlyRequest(shift),
          isClosed: date.inRange && holidays.includes(date.iso),
        };
      }),
    };
  });
};
