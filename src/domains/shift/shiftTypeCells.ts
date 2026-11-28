import { type AssignmentCellNotice, type CellStaff, collectAssignmentCellNotices } from "./cellNotices";
import { isFoldedStaff } from "./foldedStaff";
import { isCanonicalWorkPosition } from "./positions";
import { getRequestedShiftTypeOptionIds, type ShiftTypeOptionLike } from "./shiftTypeAssignments";
import type { PositionSegment, ShiftData } from "./types";

// パターン選択の日別の表で、1人の1日分を、勤務パターンごとのセルへ直す純粋処理。
// セルは「希望」と「割り当て」の2つを持ち、割り当てについて確かめたいことを理由として添える。

/**
 * 割り当てに添える理由。希望外・未提出・担当外を確認事項として知らせる。
 * 1日に複数の勤務パターンへ入るのはふつうのことなので、勤務パターンどうしの時間の重なりは知らせない。
 */
export type ShiftTypeCellNotice = AssignmentCellNotice;

/** 割り当てに付ける点。理由があれば橙にする。 */
export type ShiftTypeCellDot = "orange";

export type ShiftTypeCell = {
  option: ShiftTypeOptionLike;
  /** 提出済みで、この勤務パターンを希望しているか。 */
  isRequested: boolean;
  /** この勤務パターンに入っている勤務。入っていなければnull。 */
  segment: PositionSegment | null;
  notices: ShiftTypeCellNotice[];
  dot: ShiftTypeCellDot | null;
};

const findSegment = (shift: ShiftData | undefined, optionId: string): PositionSegment | null =>
  shift?.positions.filter(isCanonicalWorkPosition).find((position) => position.shiftTypeOptionId === optionId) ?? null;

/**
 * 1人の1日分を、勤務パターンの並びどおりのセルにする。
 * 未提出の人は希望を持たない。休み希望の人（提出済みで希望なし）への割り当ては、希望外として扱う。
 */
export const buildShiftTypeCells = (input: {
  shift: ShiftData | undefined;
  staff: CellStaff;
  options: readonly ShiftTypeOptionLike[];
}): ShiftTypeCell[] => {
  const { shift, staff, options } = input;
  const requestedIds = new Set(staff.isSubmitted ? getRequestedShiftTypeOptionIds(shift) : []);

  return options.map((option) => {
    const segment = findSegment(shift, option.id);
    const isRequested = requestedIds.has(option.id);
    const notices = collectAssignmentCellNotices({ staff, segment, isRequested });
    return {
      option,
      isRequested,
      segment,
      notices,
      dot: notices.length === 0 ? null : "orange",
    };
  });
};

/**
 * 休み希望（提出済みで、どの勤務パターンも希望していない）で、割り当ても連絡事項もない人か。表の下にまとめる対象になる。
 * 判定は3つの提出方法で共通の決まり（foldedStaff）に従う。
 */
export const isShiftTypeRestRequestWithoutWork = (input: {
  shift: ShiftData | undefined;
  staff: Pick<CellStaff, "isSubmitted">;
  /** その日の連絡事項があるか。連絡事項のある人は、読み落とさないよう、まとめない。 */
  hasNote: boolean;
}): boolean =>
  isFoldedStaff({
    isSubmitted: input.staff.isSubmitted,
    hasRequest: getRequestedShiftTypeOptionIds(input.shift).length > 0,
    hasAssignment: (input.shift?.positions ?? []).some(
      (position) => isCanonicalWorkPosition(position) && position.shiftTypeOptionId !== undefined,
    ),
    hasNote: input.hasNote,
  });
