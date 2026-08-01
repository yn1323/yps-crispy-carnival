import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
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

export type SPShiftTypeCountViewModel = {
  key: string;
  name: string;
  countLabel: string;
  color: ShiftTypeOptionColor;
};

export type SPShiftTypeRequestBadgeViewModel = {
  key: string;
  label: string;
  bg: string;
  color: string;
};

export type SPShiftTypeOptionViewModel = {
  option: ShiftTypeOptionLike;
  name: string;
  timeLabel: string;
  assigned: boolean;
  color: ShiftTypeOptionColor;
};

export type SPShiftTypeStaffCardViewModel = {
  staff: StaffType;
  isNameMuted: boolean;
  requestSectionLabel: "確定" | "希望";
  requestBadges: SPShiftTypeRequestBadgeViewModel[];
  options: SPShiftTypeOptionViewModel[];
};

export type SPShiftTypeDailyViewModel = {
  counts: SPShiftTypeCountViewModel[];
  staffCards: SPShiftTypeStaffCardViewModel[];
};

const buildRequestBadges = (
  staff: StaffType,
  shift: ShiftData | undefined,
  options: ShiftTypeOptionLike[],
): SPShiftTypeRequestBadgeViewModel[] => {
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

export const buildSPShiftTypeDailyViewModel = ({
  submissionPattern,
  shifts,
  staffs,
  isConfirmedDisplay,
}: {
  submissionPattern: ShiftSubmissionPattern;
  shifts: ShiftData[];
  staffs: StaffType[];
  isConfirmedDisplay: boolean;
}): SPShiftTypeDailyViewModel => {
  const options =
    submissionPattern.kind === "shiftType"
      ? [...submissionPattern.options].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];
  const countsByOptionId = countShiftTypeAssignments(
    shifts,
    options.map((option) => option.id),
  );
  const shiftByStaffId = new Map(shifts.map((shift) => [shift.staffId, shift]));

  return {
    counts: options.map((option, index) => ({
      key: option.id,
      name: option.name,
      countLabel: `${countsByOptionId.get(option.id) ?? 0}人`,
      color: getShiftTypeOptionColor(index),
    })),
    staffCards: staffs.map((staff) => {
      const shift = shiftByStaffId.get(staff.id);
      return {
        staff,
        isNameMuted: !staff.isSubmitted,
        requestSectionLabel: isConfirmedDisplay ? "確定" : "希望",
        requestBadges: buildRequestBadges(staff, shift, options),
        options: options.map((option, index) => ({
          option,
          name: option.name,
          timeLabel: formatShiftTypeTimeRange(option),
          assigned: hasShiftTypeAssignment(shift, option.id),
          color: getShiftTypeOptionColor(index),
        })),
      };
    }),
  };
};
