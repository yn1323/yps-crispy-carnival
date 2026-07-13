import {
  countDateOnlyAssignmentsByDate,
  hasDateOnlyAssignment,
  hasDateOnlyRequest,
} from "@/src/domains/shift/dateOnlyAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";

export type SPDateInfo = {
  iso: string;
  inRange: boolean;
};

export type SPDateOnlyStaffRowViewModel = {
  staff: StaffType;
  requested: boolean;
  assigned: boolean;
  isNameMuted: boolean;
  statusLabel: string;
  statusTone: "positive" | "warning" | "muted";
};

export type SPDateOnlyDailyViewModel = {
  dates: SPDateInfo[];
  activeDate: string;
  isInRange: boolean;
  isShopClosedDate: boolean;
  assignedCount: number;
  rows: SPDateOnlyStaffRowViewModel[];
};

export const buildSPDateOnlyDailyViewModel = ({
  dates,
  selectedDate,
  holidays,
  staffs,
  shifts,
  isConfirmedDisplay,
}: {
  dates: string[];
  selectedDate: string;
  holidays: string[];
  staffs: StaffType[];
  shifts: ShiftData[];
  isConfirmedDisplay: boolean;
}): SPDateOnlyDailyViewModel => {
  const dateInfos = dates.map((iso) => ({ iso, inRange: true }));
  const selectedDateInfo =
    dateInfos.find((date) => date.iso === selectedDate) ?? dateInfos.find((date) => date.inRange) ?? dateInfos[0];
  const activeDate = selectedDateInfo?.iso ?? selectedDate;
  const isInRange = selectedDateInfo?.inRange ?? dates.includes(activeDate);
  const isShopClosedDate = isInRange && holidays.includes(activeDate);
  const shiftByStaffDate = new Map(shifts.map((shift) => [`${shift.staffId}-${shift.date}`, shift]));
  const rows = staffs.map((staff): SPDateOnlyStaffRowViewModel => {
    const shift = shiftByStaffDate.get(`${staff.id}-${activeDate}`);
    const requested = isInRange && hasDateOnlyRequest(shift);
    const assigned = isInRange && hasDateOnlyAssignment(shift);
    const statusLabel = !staff.isSubmitted
      ? "未提出"
      : requested
        ? isConfirmedDisplay
          ? "勤務あり"
          : "希望あり"
        : isConfirmedDisplay
          ? "勤務なし"
          : "希望なし";

    return {
      staff,
      requested,
      assigned,
      isNameMuted: !staff.isSubmitted,
      statusLabel,
      statusTone: !staff.isSubmitted ? "warning" : requested ? "positive" : "muted",
    };
  });

  return {
    dates: dateInfos,
    activeDate,
    isInRange,
    isShopClosedDate,
    assignedCount: isInRange ? (countDateOnlyAssignmentsByDate(shifts, [activeDate]).get(activeDate) ?? 0) : 0,
    rows,
  };
};
