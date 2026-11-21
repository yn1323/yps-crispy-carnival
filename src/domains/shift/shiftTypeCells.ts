import { getPositionSkill } from "./positionSkills";
import { isCanonicalWorkPosition } from "./positions";
import { getRequestedShiftTypeOptionIds, type ShiftTypeOptionLike } from "./shiftTypeAssignments";
import { timeToMinutes } from "./time";
import type { PositionSegment, ShiftData, StaffPositionSkill } from "./types";

// パターン選択の日別の表で、1人の1日分を、勤務パターンごとのセルへ直す純粋処理。
// セルは「希望」と「割り当て」の2つを持ち、割り当てについて確かめたいことを理由として添える。

/** 割り当てに添える理由。希望外・未提出・担当外は確認事項、重なりは同じ人の別の勤務パターンとの時間の重なりである。 */
export type ShiftTypeCellNotice =
  | { kind: "unrequested" }
  | { kind: "notSubmitted" }
  | { kind: "positionUnavailable" }
  | { kind: "overlap"; optionNames: string[] };

/** 割り当てに付ける点。時間の重なりがあれば赤、それ以外の理由だけなら橙にする。 */
export type ShiftTypeCellDot = "red" | "orange";

export type ShiftTypeCell = {
  option: ShiftTypeOptionLike;
  /** 提出済みで、この勤務パターンを希望しているか。 */
  isRequested: boolean;
  /** この勤務パターンに入っている勤務。入っていなければnull。 */
  segment: PositionSegment | null;
  notices: ShiftTypeCellNotice[];
  dot: ShiftTypeCellDot | null;
};

type CellStaff = { isSubmitted: boolean; positionSkills?: readonly StaffPositionSkill[] };

// 時間が隣り合うだけ（15時終わりと15時始まり）は重なりにしない。日をまたぐ終了は24時より後の時刻で持つ。
const isTimeOverlapping = (a: ShiftTypeOptionLike, b: ShiftTypeOptionLike): boolean =>
  timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);

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
  const assigned = options.flatMap((option) => (findSegment(shift, option.id) ? [option] : []));

  return options.map((option) => {
    const segment = findSegment(shift, option.id);
    const isRequested = requestedIds.has(option.id);
    const notices: ShiftTypeCellNotice[] = [];
    if (segment) {
      if (!staff.isSubmitted) notices.push({ kind: "notSubmitted" });
      else if (!isRequested) notices.push({ kind: "unrequested" });
      if (getPositionSkill(staff, segment.positionId) === "unavailable") notices.push({ kind: "positionUnavailable" });
      const overlapping = assigned.filter((other) => other.id !== option.id && isTimeOverlapping(option, other));
      if (overlapping.length > 0) {
        notices.push({ kind: "overlap", optionNames: overlapping.map((other) => other.name) });
      }
    }
    return {
      option,
      isRequested,
      segment,
      notices,
      dot: notices.length === 0 ? null : notices.some((notice) => notice.kind === "overlap") ? "red" : "orange",
    };
  });
};

/** 休み希望（提出済みで、どの勤務パターンも希望していない）で、割り当てもない人か。表の下にまとめる対象になる。 */
export const isShiftTypeRestRequestWithoutWork = (input: {
  shift: ShiftData | undefined;
  staff: Pick<CellStaff, "isSubmitted">;
}): boolean =>
  input.staff.isSubmitted &&
  getRequestedShiftTypeOptionIds(input.shift).length === 0 &&
  !(input.shift?.positions ?? []).some(
    (position) => isCanonicalWorkPosition(position) && position.shiftTypeOptionId !== undefined,
  );
