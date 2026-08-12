import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import {
  countShiftTypeAssignments,
  getRequestedShiftTypeOptionIds,
  hasShiftTypeAssignment,
  type ShiftTypeOptionLike,
} from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import { getOrderedShiftTypeOptions } from "@/src/domains/shop/submissionPattern";
import { formatShiftTypeTimeRange } from "./shiftTypeDisplay";
import {
  getShiftTypeOptionColor,
  SHIFT_TYPE_REQUEST_STATUS_COLORS,
  type ShiftTypeOptionColor,
} from "./shiftTypeOptionStyles";

export type ShiftTypeDailyOptionPresentation = {
  key: string;
  option: ShiftTypeOptionLike;
  name: string;
  timeLabel: string;
  countLabel: string;
  color: ShiftTypeOptionColor;
};

export type ShiftTypeDailyRequestBadgePresentation = {
  key: string;
  label: string;
  bg: string;
  color: string;
};

export type ShiftTypeDailyAssignmentPresentation = {
  key: string;
  option: ShiftTypeOptionLike;
  name: string;
  timeLabel: string;
  assigned: boolean;
  color: ShiftTypeOptionColor;
};

export type ShiftTypeDailyStaffPresentation = {
  staff: StaffType;
  isNameMuted: boolean;
  requestSectionLabel: "確定" | "希望";
  requestBadges: ShiftTypeDailyRequestBadgePresentation[];
  assignments: ShiftTypeDailyAssignmentPresentation[];
};

export type ShiftTypeDailyPresentation = {
  options: ShiftTypeDailyOptionPresentation[];
  staffs: ShiftTypeDailyStaffPresentation[];
};

export function buildShiftTypeDailyPresentation({
  submissionPattern,
  shifts,
  staffs,
  shiftByStaffId,
  isConfirmedDisplay,
}: {
  submissionPattern: ShiftSubmissionPattern;
  shifts: ShiftData[];
  staffs: StaffType[];
  shiftByStaffId: ReadonlyMap<string, ShiftData | undefined>;
  isConfirmedDisplay: boolean;
}): ShiftTypeDailyPresentation {
  const options = getOrderedShiftTypeOptions(submissionPattern);
  const countsByOptionId = countShiftTypeAssignments(
    shifts,
    options.map((option) => option.id),
  );
  const optionPresentations = options.map((option, index) => ({
    key: option.id,
    option,
    name: option.name,
    timeLabel: formatShiftTypeTimeRange(option),
    countLabel: `${countsByOptionId.get(option.id) ?? 0}人`,
    color: getShiftTypeOptionColor(index),
  }));

  return {
    options: optionPresentations,
    staffs: staffs.map((staff) => {
      const shift = shiftByStaffId.get(staff.id);
      return {
        staff,
        isNameMuted: !staff.isSubmitted,
        requestSectionLabel: isConfirmedDisplay ? "確定" : "希望",
        requestBadges: buildRequestBadges(staff, shift, optionPresentations),
        assignments: optionPresentations.map(({ key, option, name, timeLabel, color }) => ({
          key,
          option,
          name,
          timeLabel,
          assigned: hasShiftTypeAssignment(shift, option.id),
          color,
        })),
      };
    }),
  };
}

function buildRequestBadges(
  staff: StaffType,
  shift: ShiftData | undefined,
  options: ShiftTypeDailyOptionPresentation[],
): ShiftTypeDailyRequestBadgePresentation[] {
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

  const optionById = new Map(options.map((option) => [option.key, option]));
  return requestedIds.map((optionId) => {
    const item = optionById.get(optionId);
    return {
      key: optionId,
      label: item?.name ?? "勤務区分",
      bg: item?.color.requestedBg ?? "gray.100",
      color: item?.color.accent ?? "gray.700",
    };
  });
}
