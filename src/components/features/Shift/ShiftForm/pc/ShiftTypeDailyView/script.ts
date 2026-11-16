import type { ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { getBreaksForSegment } from "@/src/domains/shift/breaks";
import { indexShiftsByStaffId } from "@/src/domains/shift/shiftLookup";
import type { ShiftTypeOptionLike } from "@/src/domains/shift/shiftTypeAssignments";
import type { PositionSegment, ShiftData, StaffType } from "@/src/domains/shift/types";
import {
  buildShiftTypeDailyPresentation,
  type ShiftTypeDailyRequestBadgePresentation,
} from "../../shiftTypeDailyPresentation";
import type { ShiftTypeOptionColor } from "../../shiftTypeOptionStyles";
import { type DayStaffingView, formatStaffingCount, type StaffingSlotView } from "../../staffingPresentation";

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
  /** その勤務パターンに入っている勤務。くわしく表示でポジションを示すために使う。 */
  segment: PositionSegment | undefined;
  /** その勤務パターンの時間内に休憩がある場合だけ持つ、その勤務だけに絞った1日分。休憩の印に渡す。 */
  breakShift: ShiftData | undefined;
  /** 前回の勤務を仮で入れた日の勤務かどうか。 */
  isProvisional: boolean;
};

export type ShiftTypeDailyRowViewModel = {
  key: string;
  staff: StaffType;
  /** 表示中の日の勤務。スタッフ名に添える「仮」の印に使う。 */
  shift: ShiftData | undefined;
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
    /** メモがない募集ではメモ列を出さない。 */
    note: number | null;
    option: number;
  };
  optionColumns: ShiftTypeDailyOptionColumnViewModel[];
  rows: ShiftTypeDailyRowViewModel[];
};

const STAFF_COLUMN_WIDTH = 220;
const REQUEST_COLUMN_WIDTH = 150;
// 時間指定の日別表示のメモ列とそろえる。
const NOTE_COLUMN_WIDTH = 200;
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
  detailMode = false,
  usesPositionColors = false,
}: {
  submissionPattern: ShiftSubmissionPattern;
  shifts: ShiftData[];
  staffs: StaffType[];
  selectedDate: string;
  holidays: string[];
  isConfirmedDisplay: boolean;
  warningMessagesByStaffId: ReadonlyMap<string, string[]>;
  hasDateNotes?: boolean;
  /** くわしく表示かどうか。セルの読み上げに、ポジションと休憩を足す。 */
  detailMode?: boolean;
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
  usesPositionColors?: boolean;
}): ShiftTypeDailyViewModel => {
  const shiftByStaffId = indexShiftsByStaffId(shifts);
  const presentation = buildShiftTypeDailyPresentation({
    submissionPattern,
    shifts,
    staffs,
    shiftByStaffId,
    isConfirmedDisplay,
  });

  const noteColumnWidth = hasDateNotes ? NOTE_COLUMN_WIDTH : null;

  return {
    isShopClosedDate: holidays.includes(selectedDate),
    requestHeaderLabel: isConfirmedDisplay ? "確定" : "希望",
    minimumTableWidth:
      STAFF_COLUMN_WIDTH +
      REQUEST_COLUMN_WIDTH +
      (noteColumnWidth ?? 0) +
      presentation.options.length * OPTION_COLUMN_WIDTH,
    columnWidths: {
      staff: STAFF_COLUMN_WIDTH,
      request: REQUEST_COLUMN_WIDTH,
      note: noteColumnWidth,
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
      const shift = shiftByStaffId.get(staff.id);
      return {
        key: staff.id,
        staff,
        shift,
        staffName: staff.name,
        isStaffNameMuted: staffPresentation.isNameMuted,
        warningMessages: warningMessagesByStaffId.get(staff.id) ?? [],
        requestBadges: staffPresentation.requestBadges,
        cells: staffPresentation.assignments.map(({ key, option, assigned, color }) => {
          const segment = shift?.positions.find((position) => position.shiftTypeOptionId === option.id);
          const breakShift =
            shift && segment && getBreaksForSegment(segment, shift.breaks ?? []).length > 0
              ? { ...shift, positions: [segment] }
              : undefined;
          const detailLabels =
            detailMode && assigned
              ? [...(usesPositionColors && segment ? [segment.positionName] : []), ...(breakShift ? ["休憩あり"] : [])]
              : [];
          return {
            key,
            option,
            assigned,
            ariaLabel: [`${staff.name} ${option.name} ${assigned ? "勤務あり" : "勤務なし"}`, ...detailLabels].join(
              "、",
            ),
            symbol: assigned ? "○" : "×",
            color,
            segment,
            breakShift,
            isProvisional: assigned && shift?.isProvisional === true,
          };
        }),
      };
    }),
  };
};

// ==========================================
// 人数と過不足（くわしく表示）
// ==========================================
export type StaffingSlotSummary = {
  /** 区切り全体の「人数 / 必要」。必要人数を1つも設定していない区切りは人数だけ。 */
  totalLabel: string;
  /** ポジション名つきの内訳。色の丸だけで示す狭いセルの補足に使う。 */
  title: string;
};

/** 区切り1つ分の人数を、全体の「人数 / 必要」と内訳の説明へまとめる。 */
export const summarizeStaffingSlot = (slot: StaffingSlotView): StaffingSlotSummary => {
  const requiredCounts = slot.positions.flatMap((position) => (position.required === null ? [] : [position.required]));
  const requiredTotal = requiredCounts.length > 0 ? requiredCounts.reduce((sum, count) => sum + count, 0) : null;
  const breakdown = slot.positions
    .map((position) => `${position.name} ${position.label}${position.isNewcomerOnly ? "（新人だけ）" : ""}`)
    .join("、");
  return {
    totalLabel: formatStaffingCount(slot.total, requiredTotal),
    title: breakdown ? `${slot.label} ${breakdown}` : slot.label,
  };
};

const SHIFT_TYPE_SLOT_ID_PREFIX = "shiftType:";

/** その日の人数を、勤務パターンの列から引けるようにする。 */
export const indexStaffingSlotsByOptionKey = (view: DayStaffingView): Map<string, StaffingSlotView> =>
  new Map(
    view.slots.flatMap(
      (slot): Array<[string, StaffingSlotView]> =>
        slot.id.startsWith(SHIFT_TYPE_SLOT_ID_PREFIX) ? [[slot.id.slice(SHIFT_TYPE_SLOT_ID_PREFIX.length), slot]] : [],
    ),
  );
