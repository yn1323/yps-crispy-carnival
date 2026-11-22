import type { AssignmentCellNotice } from "@/src/domains/shift/cellNotices";
import type { PositionSegment } from "@/src/domains/shift/types";
import type { AssignmentPillCell } from "./assignmentCellParts";

// パターン選択の日別の表と、日付選択の表が共通に使う、セルの表示内容の決まり。
// 「人×勤務パターン」と「人×日」のどちらの1マスも、同じ決まりで輪、ピル、点を出す。

/** 割り当ての判定結果。 */
type AssignmentCellSource = {
  /** 提出済みで、このマスを希望しているか。 */
  isRequested: boolean;
  /** このマスに入っている勤務。入っていなければnull。 */
  segment: PositionSegment | null;
  notices: readonly AssignmentCellNotice[];
  dot: "orange" | null;
};

const formatAssignmentCellNotice = (notice: AssignmentCellNotice): string => {
  if (notice.kind === "unrequested") return "希望時間外に勤務あり";
  if (notice.kind === "notSubmitted") return "未提出";
  return "担当外のポジション";
};

/**
 * 輪、ピル、点の表示内容を決める。
 * ボタンの名前と説明（ariaLabel、ariaDescription）は表ごとに形が違うため、呼ぶ側で作る。
 */
export const buildAssignmentPillFields = (
  cell: AssignmentCellSource,
  {
    isConfirmedDisplay,
    usesPositionColors,
  }: {
    /** スタッフ向けの確定シフトの表示。希望の輪、点、点の理由を出さない。 */
    isConfirmedDisplay: boolean;
    /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）かどうか。 */
    usesPositionColors: boolean;
  },
): Pick<
  AssignmentPillCell,
  "showsRequestRing" | "assigned" | "pillLabel" | "positionId" | "positionColor" | "dot" | "noticeTexts"
> => {
  const assigned = cell.segment !== null;
  const showsPositionName = assigned && usesPositionColors;
  return {
    showsRequestRing: !isConfirmedDisplay && cell.isRequested,
    assigned,
    pillLabel: assigned ? (showsPositionName ? (cell.segment?.positionName ?? "○") : "○") : null,
    positionId: cell.segment?.positionId ?? null,
    positionColor: showsPositionName ? (cell.segment?.color ?? null) : null,
    dot: isConfirmedDisplay ? null : cell.dot,
    noticeTexts: isConfirmedDisplay ? [] : cell.notices.map(formatAssignmentCellNotice),
  };
};
