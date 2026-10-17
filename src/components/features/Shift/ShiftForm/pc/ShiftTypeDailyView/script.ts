import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { ShiftData, StaffType } from "@/src/domains/shift/types";
import {
  buildShiftTypeDailyPresentation,
  type ShiftTypeDailyRequestBadgePresentation,
} from "../../shiftTypeDailyPresentation";
import type { ShiftTypeOptionColor } from "../../shiftTypeOptionStyles";

export type ShiftTypeDailyOptionColumnViewModel = {
  key: string;
  name: string;
  timeLabel: string;
  countLabel: string;
  color: ShiftTypeOptionColor;
};

export type ShiftTypeDailyRequestBadgeViewModel = ShiftTypeDailyRequestBadgePresentation;

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
  requestHeaderLabel: "確定" | "希望" | "確定・メモ" | "希望・メモ";
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
// メモがある募集では、希望バッジの下にメモを1行で置くため希望列を広げる。
const REQUEST_WITH_NOTE_COLUMN_WIDTH = 300;
const OPTION_COLUMN_WIDTH = 150;

export const buildShiftTypeDailyViewModel = ({
  submissionPattern,
  shifts,
  staffs,
  selectedDate,
  holidays,
  isConfirmedDisplay,
  warningMessagesByStaffId,
  hasDateNotes = false,
}: {
  submissionPattern: ShiftSubmissionPattern;
  shifts: ShiftData[];
  staffs: StaffType[];
  selectedDate: string;
  holidays: string[];
  isConfirmedDisplay: boolean;
  warningMessagesByStaffId: ReadonlyMap<string, string[]>;
  hasDateNotes?: boolean;
}): ShiftTypeDailyViewModel => {
  const presentation = buildShiftTypeDailyPresentation({
    submissionPattern,
    shifts,
    staffs,
    shiftByStaffId: indexShiftsByStaffId(shifts),
    isConfirmedDisplay,
  });

  const requestColumnWidth = hasDateNotes ? REQUEST_WITH_NOTE_COLUMN_WIDTH : REQUEST_COLUMN_WIDTH;
  const requestLabel = isConfirmedDisplay ? "確定" : "希望";

  return {
    isShopClosedDate: holidays.includes(selectedDate),
    requestHeaderLabel: hasDateNotes ? `${requestLabel}・メモ` : requestLabel,
    minimumTableWidth: STAFF_COLUMN_WIDTH + requestColumnWidth + presentation.options.length * OPTION_COLUMN_WIDTH,
    columnWidths: {
      staff: STAFF_COLUMN_WIDTH,
      request: requestColumnWidth,
      option: OPTION_COLUMN_WIDTH,
    },
    optionColumns: presentation.options.map(({ key, name, timeLabel, countLabel, color }) => ({
      key,
      name,
      timeLabel,
      countLabel,
      color,
    })),
    rows: presentation.staffs.map((staffPresentation) => {
      const { staff } = staffPresentation;
      return {
        key: staff.id,
        staff,
        staffName: staff.name,
        isStaffNameMuted: staffPresentation.isNameMuted,
        warningMessages: warningMessagesByStaffId.get(staff.id) ?? [],
        requestBadges: staffPresentation.requestBadges,
        cells: staffPresentation.assignments.map(({ key, option, assigned, color }) => {
          return {
            key,
            option,
            assigned,
            ariaLabel: `${staff.name} ${option.name} ${assigned ? "勤務あり" : "勤務なし"}`,
            symbol: assigned ? "○" : "×",
            color,
          };
        }),
      };
    }),
  };
};
