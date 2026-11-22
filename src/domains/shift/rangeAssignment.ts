import {
  getEffectiveBreaks,
  getWorkBlocks,
  type MinuteRange,
  mergeBreaks,
  pruneBreaks,
  toMinuteRange,
  toTimeRange,
} from "./breaks";
import { mergeAdjacentPositions, paintPosition } from "./operations";
import { isCanonicalWorkPosition } from "./positions";
import { timeToMinutes } from "./time";
import type { PositionSegment, PositionType, ShiftData, ShiftTimeRange } from "./types";

// 勤務の一部の範囲を選び、ポジションまたは休憩を入れるための純粋処理。
// 勤務はポジションの区間（positions）、休憩は別の配列（breaks）で持つため、
// 「選べる区間」は、勤務の区間を休憩で区切ったものとして組み立てる。
// 勤務と勤務の間の空きは、休憩としては持っていないが、画面では休憩として見せる。ここでも休憩の区間として扱う。

/** 勤務のバーの上で、ひと続きに選べる区間（分）。勤務は、ポジションの境目と休憩で区切る。休憩には、勤務の間の空きを含む。 */
export type WorkSection = ({ kind: "work"; positionId: string } & MinuteRange) | ({ kind: "break" } & MinuteRange);

/** 範囲に入っているもの、または範囲へ入れるもの。 */
export type RangeAssignment = { kind: "position"; positionId: string } | { kind: "break" };

type ShiftWork = Pick<ShiftData, "positions" | "breaks">;

const effectiveBreakRanges = (shift: ShiftWork): MinuteRange[] =>
  getEffectiveBreaks(shift, { clipToWork: true }).map(toMinuteRange);

const clip = <Range extends MinuteRange>(item: Range, range: MinuteRange): Range => ({
  ...item,
  start: Math.max(item.start, range.start),
  end: Math.min(item.end, range.end),
});

const isNotEmpty = (range: MinuteRange): boolean => range.start < range.end;

/** 勤務と勤務の間の空き。最初の勤務の開始より前と、最後の勤務の終了より後は含まない。 */
const gapRanges = (shift: Pick<ShiftData, "positions">): MinuteRange[] => {
  const blocks = getWorkBlocks(shift);
  return blocks.slice(1).map((block, index) => ({ start: blocks[index].end, end: block.start }));
};

/**
 * その日の勤務を、選べる区間に分けて開始順に返す。勤務の区間を休憩で区切り、休憩は休憩ごとに1つの区間にする。
 * `mergesAcrossPositions`は、ポジションを見せない表示で使う。ポジションだけが違う隣り合う勤務を、1つの区間にまとめる。
 */
export const listWorkSections = (
  shift: ShiftWork,
  options: { mergesAcrossPositions?: boolean } = {},
): WorkSection[] => {
  const breaks = effectiveBreakRanges(shift);
  const sections: WorkSection[] = [...breaks, ...gapRanges(shift)].map((range) => ({ kind: "break", ...range }));
  for (const segment of shift.positions.filter(isCanonicalWorkPosition)) {
    const end = timeToMinutes(segment.end);
    let cursor = timeToMinutes(segment.start);
    // 休憩は開始順で、互いに重ならない。
    for (const item of breaks) {
      if (item.end <= cursor || item.start >= end) continue;
      if (item.start > cursor) {
        sections.push({ kind: "work", positionId: segment.positionId, start: cursor, end: item.start });
      }
      cursor = item.end;
    }
    if (cursor < end) sections.push({ kind: "work", positionId: segment.positionId, start: cursor, end });
  }
  sections.sort((a, b) => a.start - b.start);
  if (!options.mergesAcrossPositions) return sections;

  const merged: WorkSection[] = [];
  for (const section of sections) {
    const last = merged.at(-1);
    if (last && last.kind === "work" && section.kind === "work" && last.end === section.start) {
      merged[merged.length - 1] = { ...last, end: section.end };
    } else {
      merged.push(section);
    }
  }
  return merged;
};

/** その時刻（分）を含む、選べる区間を返す。勤務の外ならnullを返す。 */
export const findWorkSectionAt = (
  shift: ShiftWork,
  minutes: number,
  options: { mergesAcrossPositions?: boolean } = {},
): WorkSection | null =>
  listWorkSections(shift, options).find((section) => section.start <= minutes && minutes < section.end) ?? null;

/**
 * その時刻（分）で始めた範囲選択が動ける範囲を返す。
 * ひと続きの勤務の上ならその勤務、勤務の間の空きの上ならその空きを返し、範囲選択はその外へ出さない。
 * どちらでもない時刻（最初の勤務より前、最後の勤務より後）ではnullを返す。
 */
export const findSelectionBoundsAt = (
  shift: ShiftWork,
  minutes: number,
): (MinuteRange & { kind: "work" | "gap" }) | null => {
  const contains = (range: MinuteRange) => range.start <= minutes && minutes < range.end;
  const block = getWorkBlocks(shift).find(contains);
  if (block) return { kind: "work", ...block };
  const gap = gapRanges(shift).find(contains);
  return gap ? { kind: "gap", ...gap } : null;
};

/**
 * 選んだ範囲に、いま入っているものを返す。
 * すべて休憩（勤務の間の空きを含む）なら休憩、勤務がすべて同じポジションならそのポジション（休憩をまたいでいてもよい）を返す。
 * ポジションが混ざっている場合と、最初の勤務より前か最後の勤務より後を含む場合はnullを返す。
 */
export const resolveRangeAssignment = (shift: ShiftWork, range: MinuteRange): RangeAssignment | null => {
  if (!isNotEmpty(range)) return null;
  const sections = listWorkSections(shift)
    .map((section) => clip(section, range))
    .filter(isNotEmpty);
  const coveredMinutes = sections.reduce((total, section) => total + (section.end - section.start), 0);
  if (coveredMinutes !== range.end - range.start) return null;

  const positionIds = new Set(sections.flatMap((section) => (section.kind === "work" ? [section.positionId] : [])));
  if (positionIds.size === 0) return { kind: "break" };
  const [positionId] = positionIds;
  return positionIds.size === 1 ? { kind: "position", positionId } : null;
};

/** 選んだ範囲に、休憩（勤務の間の空きを含む）が少しでもかかっているかを返す。 */
export const hasBreakInRange = (shift: ShiftWork, range: MinuteRange): boolean =>
  [...effectiveBreakRanges(shift), ...gapRanges(shift)].some((item) => isNotEmpty(clip(item, range)));

const subtractRange = (ranges: readonly MinuteRange[], removed: MinuteRange): MinuteRange[] =>
  ranges
    .flatMap((range) => [
      { start: range.start, end: Math.min(range.end, removed.start) },
      { start: Math.max(range.start, removed.end), end: range.end },
    ])
    .filter(isNotEmpty);

/** 選んだ範囲にかかる休憩を外した、その日の休憩を返す。勤務は変えない。休憩の一部だけを選んだ場合は、選んだ分だけ外す。 */
export const removeBreakRange = (shift: ShiftWork, range: MinuteRange): ShiftTimeRange[] =>
  subtractRange(effectiveBreakRanges(shift), range).map(toTimeRange);

const isSameWork = (a: readonly PositionSegment[], b: readonly PositionSegment[]): boolean =>
  a.length === b.length &&
  a.every(
    (segment, index) =>
      segment.positionId === b[index].positionId && segment.start === b[index].start && segment.end === b[index].end,
  );

/**
 * 選んだ範囲を、指定したポジションの勤務にした結果を返す。
 * 区間は必要に応じて分け、隣り合う同じポジションの区間は1つにまとめる。
 * 勤務の間の空きにかかる部分は、そのポジションの勤務で埋める。最初の勤務より前と、最後の勤務より後は変えない。
 * 選んだ範囲にかかる休憩は外す。ポジションで休憩を上書きしたと見えるため、休憩をまたいで選んでいた場合も、範囲の中の休憩は残さない。
 * 何も変わらない場合はnullを返す。
 */
export const assignPositionToRange = (params: {
  shift: ShiftData;
  range: MinuteRange;
  position: Pick<PositionType, "id" | "name" | "color">;
  /** 新しくできる区間のID。 */
  segmentId: string;
}): { positions: PositionSegment[]; breaks: ShiftTimeRange[] | undefined } | null => {
  const { shift, range, position, segmentId } = params;
  const blocks = getWorkBlocks(shift);
  const firstBlock = blocks[0];
  const lastBlock = blocks.at(-1);
  if (!firstBlock || !lastBlock) return null;
  // 最初の勤務の開始から最後の勤務の終了までを対象にする。間の空きも含む。
  const target = clip(range, { start: firstBlock.start, end: lastBlock.end });
  if (!isNotEmpty(target)) return null;

  const painted = paintPosition({
    shift,
    positionId: position.id,
    positionName: position.name,
    positionColor: position.color,
    startMinutes: target.start,
    endMinutes: target.end,
    segmentId,
  });
  const positions = mergeAdjacentPositions(painted.positions);

  if (hasBreakInRange(shift, range)) {
    return { positions, breaks: removeBreakRange(shift, range) };
  }
  return isSameWork(mergeAdjacentPositions(shift.positions), positions) ? null : { positions, breaks: shift.breaks };
};

/**
 * 選んだ範囲にかかる休憩を外して、勤務へ戻した結果を返す。ポジションを選ばない表示の「勤務」と、「休憩」をもう一度選んだときに使う。
 * 勤務と休憩が混ざる範囲でも、範囲の中の休憩をすべて外す。時刻で入れた休憩は外し、その下の勤務のポジションはそのままにする。
 * 勤務の間の空きは、直前の勤務と同じポジションの勤務で埋める。
 */
export const restoreWorkInRange = (params: {
  shift: ShiftData;
  range: MinuteRange;
  /** 空きを埋めてできる区間のID。空きが複数ある場合は、連番を付けて使う。 */
  segmentId: string;
}): { positions: PositionSegment[]; breaks: ShiftTimeRange[] } => {
  const { shift, range, segmentId } = params;
  const workSegments = shift.positions
    .filter(isCanonicalWorkPosition)
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const filled = gapRanges(shift)
    .map((gap) => ({ gap, target: clip(gap, range) }))
    .filter(({ target }) => isNotEmpty(target))
    .reduce((current, { gap, target }, index) => {
      const previous = workSegments.findLast((segment) => timeToMinutes(segment.end) <= gap.start);
      if (!previous) return current;
      return paintPosition({
        shift: current,
        positionId: previous.positionId,
        positionName: previous.positionName,
        positionColor: previous.color,
        startMinutes: target.start,
        endMinutes: target.end,
        segmentId: `${segmentId}-${index}`,
      });
    }, shift);
  return { positions: mergeAdjacentPositions(filled.positions), breaks: removeBreakRange(shift, range) };
};

/**
 * 勤務を変えたあとで、休憩を勤務のバーの見た目にそろえる。
 * 1. 休憩として扱っていない休憩（勤務の外に出たもの、勤務の頭かお尻にかかったもの）を取り除く。
 * 2. 勤務と勤務の間の空きを、時刻で入れた休憩に置き換える。空きは直前の勤務と同じポジションの勤務で埋め、その時間を休憩にする。
 * 結果は、最初の勤務の開始から最後の勤務の終了までがひと続きの勤務になる。変えるものがなければ、そのまま返す。
 */
export const closeGapsWithBreaks = <Shift extends ShiftData>(
  shift: Shift,
  /** 空きを埋めてできる区間のID。 */
  segmentId: string,
): Shift => {
  const pruned = pruneBreaks(shift);
  const gaps = gapRanges(pruned);
  const first = gaps[0];
  const last = gaps.at(-1);
  if (!first || !last) return pruned;
  const { positions } = restoreWorkInRange({ shift: pruned, range: { start: first.start, end: last.end }, segmentId });
  const breaks = mergeBreaks([...(pruned.breaks ?? []), ...gaps.map(toTimeRange)]);
  return { ...pruned, positions, breaks };
};
