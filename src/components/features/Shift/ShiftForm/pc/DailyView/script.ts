import { applyBreakRange, getEffectiveBreaks, getWorkBlocks, type MinuteRange } from "@/src/domains/shift/breaks";
import { isCanonicalWorkPosition, isLegacyCompatibleWorkPosition } from "@/src/domains/shift/positions";
import { listWorkSections, type RangeAssignment, resolveRangeAssignment } from "@/src/domains/shift/rangeAssignment";
import { formatShiftClockTimeRange, minutesToTime, timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData } from "@/src/domains/shift/types";

export type ShiftPopoverViewModel = {
  segments: Array<{
    id: string;
    timeLabel: string;
    positionName: string;
    color: string;
  }>;
  // 時刻で入れた休憩の表示
  breakLabels: string[];
};

/** 閲覧専用の表示で、勤務のバーを押して開く欄の内容。編集できる表示では、代わりに範囲を選ぶメニューを開く。 */
export const buildShiftPopoverViewModel = ({
  shift,
  mergesAcrossPositions = false,
}: {
  shift: ShiftData;
  /** ポジションを見せない表示（シンプル表示）ではtrue。ポジションだけが違う隣り合う区間を、続いた1つの勤務時間として出す。 */
  mergesAcrossPositions?: boolean;
}): ShiftPopoverViewModel => {
  const workPositions = [...shift.positions]
    .filter(isLegacyCompatibleWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const groups: Array<{ first: (typeof workPositions)[number]; end: string }> = [];
  for (const position of workPositions) {
    const last = groups[groups.length - 1];
    if (mergesAcrossPositions && last && timeToMinutes(last.end) >= timeToMinutes(position.start)) {
      if (timeToMinutes(position.end) > timeToMinutes(last.end)) last.end = position.end;
    } else {
      groups.push({ first: position, end: position.end });
    }
  }
  const segments = groups.map(({ first, end }) => ({
    id: first.id,
    timeLabel: formatShiftClockTimeRange(first.start, end),
    positionName: first.positionName,
    color: first.color,
  }));
  const breakLabels = getEffectiveBreaks(shift, { clipToWork: true }).map((range) =>
    formatShiftClockTimeRange(range.start, range.end),
  );

  return { segments, breakLabels };
};

// ==========================================
// 勤務の範囲を選んで開くメニュー
// ==========================================
export type RangeAssignMenuViewModel = {
  /** 選んだ範囲。「12:00〜14:00」 */
  timeLabel: string;
  /** いま範囲に入っているものの値。ポジションが混ざる範囲と、勤務と休憩が混ざる範囲ではnull。 */
  checkedValue: string | null;
  /**
   * 勤務の選択肢。ポジションを塗り分ける表示ではポジション、塗り分けない表示（シンプル表示、ポジションが1つの店舗）では「勤務」の1つ。
   * 「勤務」は、休憩を外して勤務へ戻すために選ぶ。
   */
  positions: Array<{
    value: string;
    name: string;
    /** 色の丸。「勤務」には出さない（null）。 */
    color: string | null;
    /** この選択肢を選ぶ数字のキー。10番目以降はnull。 */
    shortcut: string | null;
  }>;
  /** ひと続きの勤務やポジションの区間の全体など、休憩にできない範囲ではtrue。項目の下に理由を出す。 */
  isBreakDisabled: boolean;
  /**
   * 休憩の編集を開く項目の名前。勤務を選んでいる間は「休憩を時刻で追加」、休憩だけを選んでいる間は「休憩を時刻で変更」。
   * どちらも同じ編集を開き、その日の休憩をすべて足し引きできる。
   */
  breakEditorLabel: string;
  /** 削除する勤務の区間。項目には、削除する時間を書く。 */
  deleteTarget: { segmentIds: string[]; timeLabel: string } | null;
};

export const RANGE_BREAK_VALUE = "break";
/** ポジションを塗り分けない表示の「勤務」。休憩を選んだ範囲では、その休憩を外す。 */
export const RANGE_WORK_VALUE = "work";
const POSITION_VALUE_PREFIX = "position:";

/** メニューで選んだ値を、範囲へ入れるものへ直す。 */
export const toRangeAssignment = (value: string): RangeAssignment | { kind: "removeBreak" } => {
  if (value === RANGE_BREAK_VALUE) return { kind: "break" };
  if (value === RANGE_WORK_VALUE) return { kind: "removeBreak" };
  return { kind: "position", positionId: value.slice(POSITION_VALUE_PREFIX.length) };
};

const toPositionValue = (positionId: string): string => `${POSITION_VALUE_PREFIX}${positionId}`;

const WORK_LABEL = "勤務";
const SHORTCUT_LIMIT = 9;

const overlaps = (item: { start: string; end: string }, range: MinuteRange): boolean =>
  timeToMinutes(item.start) < range.end && timeToMinutes(item.end) > range.start;

/** 範囲がすべて勤務か、すべて休憩かを返す。混ざる範囲と、勤務の外を含む範囲はnull。ポジションの違いは見ない。 */
const resolveWorkOrBreak = (shift: ShiftData, range: MinuteRange): "work" | "break" | null => {
  const sections = listWorkSections(shift)
    .map((section) => ({
      kind: section.kind,
      minutes: Math.min(section.end, range.end) - Math.max(section.start, range.start),
    }))
    .filter((section) => section.minutes > 0);
  const covered = sections.reduce((total, section) => total + section.minutes, 0);
  if (covered !== range.end - range.start) return null;
  const kinds = new Set(sections.map((section) => section.kind));
  return kinds.size === 1 ? (sections[0]?.kind ?? null) : null;
};

export const buildRangeAssignMenuViewModel = ({
  shift,
  range,
  positions,
  showsPositions,
}: {
  shift: ShiftData;
  range: MinuteRange;
  positions: readonly PositionType[];
  /** ポジションを塗り分ける表示（くわしく表示で、ポジションが2つ以上）ではtrue。 */
  showsPositions: boolean;
}): RangeAssignMenuViewModel => {
  const timeRange = { start: minutesToTime(range.start), end: minutesToTime(range.end) };
  const current = resolveRangeAssignment(shift, range);
  const workSegments = shift.positions
    .filter(isCanonicalWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  // ポジションを塗り分けない表示では、選んだ範囲を含むひと続きの勤務を、まとめて削除の対象にする。
  const deleteRanges = showsPositions
    ? [range]
    : getWorkBlocks(shift).filter((block) => block.start < range.end && block.end > range.start);
  const deleted = workSegments.filter((segment) => deleteRanges.some((item) => overlaps(segment, item)));
  const first = deleted[0];
  const last = deleted[deleted.length - 1];
  const workOrBreak = resolveWorkOrBreak(shift, range);

  const checkedValue = showsPositions
    ? current?.kind === "break"
      ? RANGE_BREAK_VALUE
      : current
        ? toPositionValue(current.positionId)
        : null
    : workOrBreak === "break"
      ? RANGE_BREAK_VALUE
      : workOrBreak === "work"
        ? RANGE_WORK_VALUE
        : null;
  const choices = showsPositions
    ? positions.map((position) => ({ value: toPositionValue(position.id), name: position.name, color: position.color }))
    : [{ value: RANGE_WORK_VALUE, name: WORK_LABEL, color: null }];

  return {
    timeLabel: formatShiftClockTimeRange(timeRange.start, timeRange.end),
    checkedValue,
    positions: choices.map((choice, index) => ({
      ...choice,
      shortcut: index < SHORTCUT_LIMIT ? String(index + 1) : null,
    })),
    isBreakDisabled: workOrBreak !== "break" && applyBreakRange(shift, timeRange) === null,
    breakEditorLabel: workOrBreak === "break" ? "休憩を時刻で変更" : "休憩を時刻で追加",
    deleteTarget:
      first && last
        ? {
            segmentIds: deleted.map((segment) => segment.id),
            timeLabel: formatShiftClockTimeRange(first.start, last.end),
          }
        : null,
  };
};
