import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import {
  buildShiftTypeDailyPresentation,
  type ShiftTypeDailyRequestBadgePresentation,
} from "../../shiftTypeDailyPresentation";
import type { ShiftTypeOptionColor } from "../../shiftTypeOptionStyles";

export type SPShiftTypeCountViewModel = {
  key: string;
  name: string;
  countLabel: string;
  color: ShiftTypeOptionColor;
};

export type SPShiftTypeRequestBadgeViewModel = ShiftTypeDailyRequestBadgePresentation;

export type SPShiftTypeOptionViewModel = {
  option: ShiftTypeOptionLike;
  name: string;
  timeLabel: string;
  assigned: boolean;
  color: ShiftTypeOptionColor;
  // その勤務パターンに入っている勤務。くわしく表示でポジションを出すときに使う。
  segment: PositionSegment | undefined;
};

export type SPShiftTypeStaffCardViewModel = {
  staff: StaffType;
  // その日の勤務。くわしく表示の印（仮、休憩）に使う。
  shift: ShiftData | undefined;
  isNameMuted: boolean;
  requestSectionLabel: "確定" | "希望";
  requestBadges: SPShiftTypeRequestBadgeViewModel[];
  options: SPShiftTypeOptionViewModel[];
};

export type SPShiftTypeDailyViewModel = {
  counts: SPShiftTypeCountViewModel[];
  staffCards: SPShiftTypeStaffCardViewModel[];
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
  const shiftByStaffId = new Map(shifts.map((shift) => [shift.staffId, shift]));
  const presentation = buildShiftTypeDailyPresentation({
    submissionPattern,
    shifts,
    staffs,
    shiftByStaffId,
    isConfirmedDisplay,
  });

  return {
    counts: presentation.options.map(({ key, name, countLabel, color }) => ({ key, name, countLabel, color })),
    staffCards: presentation.staffs.map((staffPresentation) => {
      const { staff } = staffPresentation;
      const shift = shiftByStaffId.get(staff.id);
      return {
        staff,
        shift,
        isNameMuted: staffPresentation.isNameMuted,
        requestSectionLabel: staffPresentation.requestSectionLabel,
        requestBadges: staffPresentation.requestBadges,
        options: staffPresentation.assignments.map(({ option, name, timeLabel, assigned, color }) => ({
          option,
          name,
          timeLabel,
          assigned,
          color,
          segment: assigned ? shift?.positions.find((position) => position.shiftTypeOptionId === option.id) : undefined,
        })),
      };
    }),
  };
};
