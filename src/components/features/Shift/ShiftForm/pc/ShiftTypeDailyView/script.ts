import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import {
  countShiftTypeAssignments,
  getRequestedShiftTypeOptionIds,
  hasShiftTypeAssignment,
  type ShiftTypeOptionLike,
} from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { formatShiftTypeTimeRange } from "../../shiftTypeDisplay";
import {
  getShiftTypeOptionColor,
  SHIFT_TYPE_REQUEST_STATUS_COLORS,
  type ShiftTypeOptionColor,
} from "../../shiftTypeOptionStyles";

export type ShiftTypeDailyOptionColumnViewModel = {
  key: string;
  name: string;
  timeLabel: string;
  countLabel: string;
  color: ShiftTypeOptionColor;
};

export type ShiftTypeDailyRequestBadgeViewModel = {
  key: string;
  label: string;
  bg: string;
  color: string;
};

export type ShiftTypeDailyAssignmentCellViewModel = {
  key: string;
  option: ShiftTypeOptionLike;
  assigned: boolean;
  ariaLabel: string;
  symbol: "○" | "×";
  color: ShiftTypeOptionColor;
};

export type ShiftTypeDailyRowViewModel = {
  key: string;
  staff: StaffType;
  staffName: string;
  isStaffNameMuted: boolean;
  warningMessages: string[];
  requestBadges: ShiftTypeDailyRequestBadgeViewModel[];
  cells: ShiftTypeDailyAssignmentCellViewModel[];
};

export type ShiftTypeDailyViewModel = {
  isShopClosedDate: boolean;
  requestHeaderLabel: "確定" | "希望";
  minimumTableWidth: number;
  columnWidths: {
    staff: number;
    request: number;
    option: number;
  };
  optionColumns: ShiftTypeDailyOptionColumnViewModel[];
  rows: ShiftTypeDailyRowViewModel[];
};

const STAFF_COLUMN_WIDTH = 220;
const REQUEST_COLUMN_WIDTH = 150;
const OPTION_COLUMN_WIDTH = 150;

const buildRequestBadges = (
  staff: StaffType,
  shift: ShiftData | undefined,
  options: ShiftTypeOptionLike[],
): ShiftTypeDailyRequestBadgeViewModel[] => {
  if (!staff.isSubmitted) {
    return [
      {
        key: "unsubmitted",
        label: "未提出",
        bg: SHIFT_TYPE_REQUEST_STATUS_COLORS.unsubmitted.bg,
        color: SHIFT_TYPE_REQUEST_STATUS_COLORS.unsubmitted.color,
      },
    ];
  }

  const requestedIds = getRequestedShiftTypeOptionIds(shift);
  if (requestedIds.length === 0) {
    return [
      {
        key: "rest",
        label: "休み",
        bg: SHIFT_TYPE_REQUEST_STATUS_COLORS.rest.bg,
        color: SHIFT_TYPE_REQUEST_STATUS_COLORS.rest.color,
      },
    ];
  }

  const optionById = new Map(
    options.map((option, index) => [option.id, { option, color: getShiftTypeOptionColor(index) }]),
  );

  return requestedIds.map((optionId) => {
    const item = optionById.get(optionId);
    return {
      key: optionId,
      label: item?.option.name ?? "勤務区分",
      bg: item?.color.requestedBg ?? "gray.100",
      color: item?.color.accent ?? "gray.700",
    };
  });
};

export const buildShiftTypeDailyViewModel = ({
  submissionPattern,
  shifts,
  staffs,
  selectedDate,
  holidays,
  isConfirmedDisplay,
  warningMessagesByStaffId,
}: {
  submissionPattern: ShiftSubmissionPattern | undefined;
  shifts: ShiftData[];
  staffs: StaffType[];
  selectedDate: string;
  holidays: string[];
  isConfirmedDisplay: boolean;
  warningMessagesByStaffId: ReadonlyMap<string, string[]>;
}): ShiftTypeDailyViewModel => {
  const options =
    submissionPattern?.kind === "shiftType"
      ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  const countsByOptionId = countShiftTypeAssignments(
    shifts,
    options.map((option) => option.id),
  );
  const shiftByStaffId = indexShiftsByStaffId(shifts);

  return {
    isShopClosedDate: holidays.includes(selectedDate),
    requestHeaderLabel: isConfirmedDisplay ? "確定" : "希望",
    minimumTableWidth: STAFF_COLUMN_WIDTH + REQUEST_COLUMN_WIDTH + options.length * OPTION_COLUMN_WIDTH,
    columnWidths: {
      staff: STAFF_COLUMN_WIDTH,
      request: REQUEST_COLUMN_WIDTH,
      option: OPTION_COLUMN_WIDTH,
    },
    optionColumns: options.map((option, index) => ({
      key: option.id,
      name: option.name,
      timeLabel: formatShiftTypeTimeRange(option),
      countLabel: `${countsByOptionId.get(option.id) ?? 0}人`,
      color: getShiftTypeOptionColor(index),
    })),
    rows: staffs.map((staff) => {
      const shift = shiftByStaffId.get(staff.id);
      return {
        key: staff.id,
        staff,
        staffName: staff.name,
        isStaffNameMuted: !staff.isSubmitted,
        warningMessages: warningMessagesByStaffId.get(staff.id) ?? [],
        requestBadges: buildRequestBadges(staff, shift, options),
        cells: options.map((option, index) => {
          const assigned = hasShiftTypeAssignment(shift, option.id);
          return {
            key: option.id,
            option,
            assigned,
            ariaLabel: `${staff.name} ${option.name} ${assigned ? "勤務あり" : "勤務なし"}`,
            symbol: assigned ? "○" : "×",
            color: getShiftTypeOptionColor(index),
          };
        }),
      };
    }),
  };
};
