import { isLegacyCompatibleWorkPosition } from "./positions";
import type { ShiftData } from "./types";

// 日別の表で、下にたたんでまとめる人の判定。時間指定、パターン選択、日付選択の3つの提出方法で、同じ決まりを使う。

/**
 * たたんでまとめる人か。提出済みで、見ている範囲に希望も割り当ても連絡事項もない人である。
 * 見ている範囲は、その日である。PCの日付選択だけは、表示中の週である。
 * 未提出の人は「希望がない」と決まっていないため、たたまない。
 */
export const isFoldedStaff = (input: {
  isSubmitted: boolean;
  hasRequest: boolean;
  hasAssignment: boolean;
  hasNote: boolean;
}): boolean => input.isSubmitted && !input.hasRequest && !input.hasAssignment && !input.hasNote;

/** 時間指定の日別で、その日にたたんでまとめる人か。休み希望（提出済みで、その日の希望の時間がない）で、勤務も連絡事項もない人である。 */
export const isTimeStaffFolded = (input: {
  shift: ShiftData | undefined;
  staff: { isSubmitted: boolean };
  hasNote: boolean;
}): boolean =>
  isFoldedStaff({
    isSubmitted: input.staff.isSubmitted,
    hasRequest: !!input.shift?.requestedTime || (input.shift?.requestedTimes?.length ?? 0) > 0,
    hasAssignment: input.shift?.positions.some(isLegacyCompatibleWorkPosition) ?? false,
    hasNote: input.hasNote,
  });
