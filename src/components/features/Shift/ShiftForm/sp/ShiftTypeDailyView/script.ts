import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
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
  const presentation = buildShiftTypeDailyPresentation({
    submissionPattern,
    shifts,
    staffs,
    shiftByStaffId: new Map(shifts.map((shift) => [shift.staffId, shift])),
    isConfirmedDisplay,
  });

  return {
    counts: presentation.options.map(({ key, name, countLabel, color }) => ({ key, name, countLabel, color })),
    staffCards: presentation.staffs.map((staffPresentation) => {
      const { staff } = staffPresentation;
      return {
        staff,
        isNameMuted: staffPresentation.isNameMuted,
        requestSectionLabel: staffPresentation.requestSectionLabel,
        requestBadges: staffPresentation.requestBadges,
        options: staffPresentation.assignments.map(({ option, name, timeLabel, assigned, color }) => ({
          option,
          name,
          timeLabel,
          assigned,
          color,
        })),
      };
    }),
  };
};
