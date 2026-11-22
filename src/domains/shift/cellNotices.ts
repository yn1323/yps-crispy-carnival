import { getPositionSkill } from "./positionSkills";
import type { PositionSegment, StaffPositionSkill } from "./types";

// パターン選択と日付選択の表で、セルの割り当てに添える理由を決める純粋処理。2つの提出方法で同じ決まりを使う。

/** 割り当てに添える理由。希望外・未提出・担当外を知らせる。どれも、確定を止めない確認事項である。 */
export type AssignmentCellNotice = { kind: "unrequested" } | { kind: "notSubmitted" } | { kind: "positionUnavailable" };

/** セルを作るために見る、スタッフの値。 */
export type CellStaff = { isSubmitted: boolean; positionSkills?: readonly StaffPositionSkill[] };

/**
 * セルに入っている勤務について、確かめたいことを理由として集める。勤務が入っていなければ、理由もない。
 * 未提出の人への割り当ては未提出、提出済みで希望していない割り当ては希望外とする。担当外のポジションは、それに重ねて知らせる。
 */
export const collectAssignmentCellNotices = (input: {
  staff: CellStaff;
  /** セルに入っている勤務。入っていなければnull。 */
  segment: PositionSegment | null;
  /** 提出済みで、このセルを希望しているか。 */
  isRequested: boolean;
}): AssignmentCellNotice[] => {
  const { staff, segment, isRequested } = input;
  if (!segment) return [];
  const notices: AssignmentCellNotice[] = [];
  if (!staff.isSubmitted) notices.push({ kind: "notSubmitted" });
  else if (!isRequested) notices.push({ kind: "unrequested" });
  if (getPositionSkill(staff, segment.positionId) === "unavailable") notices.push({ kind: "positionUnavailable" });
  return notices;
};
