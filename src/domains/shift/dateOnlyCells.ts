import { hasDateOnlyRequest } from "./dateOnlyAssignments";
import { getPositionSkill } from "./positionSkills";
import { isCanonicalWorkPosition } from "./positions";
import type { PositionSegment, ShiftData, StaffPositionSkill } from "./types";

// 日付選択の表で、1人の1日分を、希望と割り当ての2つを持つセルへ直す純粋処理。
// 割り当てについて確かめたいことは、理由として添える。パターン選択のセル（shiftTypeCells）と同じ考え方である。

/** その日に勤務を入れられるか。期間外の日と定休日は、何も描かず、入れられない。 */
export type DateOnlyDayStatus = "open" | "closed" | "outOfRange";

/** 割り当てに添える理由。どれも、確定を止めない確認事項である。 */
export type DateOnlyCellNotice = { kind: "unrequested" } | { kind: "notSubmitted" } | { kind: "positionUnavailable" };

export type DateOnlyCell = {
  status: DateOnlyDayStatus;
  /** 提出済みで、この日を希望しているか。 */
  isRequested: boolean;
  /** この日に入っている勤務。入っていなければnull。 */
  segment: PositionSegment | null;
  notices: DateOnlyCellNotice[];
  /** 割り当てに付ける点。理由が1つでもあれば橙にする。日付選択には時間の重なりがないため、赤はない。 */
  dot: "orange" | null;
};

type CellStaff = { isSubmitted: boolean; positionSkills?: readonly StaffPositionSkill[] };

/**
 * 1人の1日分をセルにする。
 * 未提出の人は希望を持たない。希望のない日への割り当ては、希望外として扱う。
 * 期間外の日と定休日は、希望も割り当ても持たないセルにする。
 */
export const buildDateOnlyCell = (input: {
  shift: ShiftData | undefined;
  staff: CellStaff;
  status: DateOnlyDayStatus;
}): DateOnlyCell => {
  const { shift, staff, status } = input;
  if (status !== "open") return { status, isRequested: false, segment: null, notices: [], dot: null };

  const segment = shift?.positions.find(isCanonicalWorkPosition) ?? null;
  const isRequested = staff.isSubmitted && hasDateOnlyRequest(shift);
  const notices: DateOnlyCellNotice[] = [];
  if (segment) {
    if (!staff.isSubmitted) notices.push({ kind: "notSubmitted" });
    else if (!isRequested) notices.push({ kind: "unrequested" });
    if (getPositionSkill(staff, segment.positionId) === "unavailable") notices.push({ kind: "positionUnavailable" });
  }
  return { status, isRequested, segment, notices, dot: notices.length > 0 ? "orange" : null };
};

/**
 * たたんでまとめる人か。提出済みで、渡したセルのどれにも希望と割り当てがなく、連絡事項もない人である。
 * PCの週の表は、その週の7日分のセルを渡す。スマートフォンの1日ずつのリストは、その日のセルだけを渡す。
 * 未提出の人は「希望がない」と決まっていないため、たたまない。
 */
export const isDateOnlyStaffWithoutRequests = (input: {
  staff: Pick<CellStaff, "isSubmitted">;
  cells: ReadonlyArray<Pick<DateOnlyCell, "isRequested" | "segment">>;
  hasNote: boolean;
}): boolean =>
  input.staff.isSubmitted && !input.hasNote && input.cells.every((cell) => !cell.isRequested && cell.segment === null);
