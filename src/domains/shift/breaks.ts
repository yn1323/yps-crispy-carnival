import { isCanonicalWorkPosition } from "./positions";
import { minutesToTime, timeToMinutes } from "./time";
import type { PositionSegment, ShiftData, ShiftTimeRange } from "./types";

// 勤務中の休憩の純粋処理。
// 画面は休憩を1日単位で持ち（ShiftData.breaks）、保存と集計のときに勤務時間の内側へ切り詰める。
// 勤務を縮めたり消したりしても休憩の編集状態を作り直さずに済ませるためである。
// 時刻を持つ勤務の休憩は、ひと続きの勤務の開始より後、終了より前にあるものだけを休憩として扱う。
// 勤務の頭かお尻にある休憩は勤務ではないため、休憩として残さない。

export const BREAK_TIME_UNIT_MINUTES = 15;

export type MinuteRange = { start: number; end: number };

/** 時刻（"HH:mm"）の範囲を、分の範囲へ直す。 */
export const toMinuteRange = (range: ShiftTimeRange): MinuteRange => ({
  start: timeToMinutes(range.start),
  end: timeToMinutes(range.end),
});

/** 分の範囲を、時刻（"HH:mm"）の範囲へ直す。 */
export const toTimeRange = (range: MinuteRange): ShiftTimeRange => ({
  start: minutesToTime(range.start),
  end: minutesToTime(range.end),
});

const compareRanges = (a: MinuteRange, b: MinuteRange): number => a.start - b.start || a.end - b.end;

/** 重なる範囲と隣り合う範囲を1件にまとめ、開始順に並べる。開始が終了以降の範囲は捨てる。 */
const mergeRanges = (ranges: readonly MinuteRange[]): MinuteRange[] => {
  const merged: MinuteRange[] = [];
  for (const current of ranges.filter((range) => range.start < range.end).sort(compareRanges)) {
    const previous = merged.at(-1);
    if (previous && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
};

/** 重なる休憩と隣り合う休憩を1件にまとめ、開始順に並べる。 */
export const mergeBreaks = (breaks: readonly ShiftTimeRange[]): ShiftTimeRange[] =>
  mergeRanges(breaks.map(toMinuteRange)).map(toTimeRange);

const workSegments = (shift: Pick<ShiftData, "positions">): PositionSegment[] =>
  shift.positions.filter(isCanonicalWorkPosition);

/** ひと続きの勤務（分）。隣り合う勤務区間と重なる勤務区間を1つにまとめる。 */
export const getWorkBlocks = (shift: Pick<ShiftData, "positions">): MinuteRange[] =>
  mergeRanges(workSegments(shift).map(toMinuteRange));

/** ひと続きの勤務の、開始か終了に接しているか。 */
const touchesBlockEdge = (range: MinuteRange, blocks: readonly MinuteRange[]): boolean =>
  blocks.some(
    (block) =>
      range.start >= block.start && range.end <= block.end && (range.start === block.start || range.end === block.end),
  );

/**
 * 勤務区間の内側に収まる休憩を、区間ごとに返す。
 * 区間をまたぐ休憩は区間の境目で分け、勤務の外にある部分と、区間全体を覆う休憩は除く。
 */
export const getBreaksForSegment = (
  segment: Pick<PositionSegment, "start" | "end">,
  breaks: readonly ShiftTimeRange[],
): ShiftTimeRange[] => {
  const segmentRange = toMinuteRange(segment);
  return mergeBreaks(breaks)
    .map(toMinuteRange)
    .map((range) => ({
      start: Math.max(range.start, segmentRange.start),
      end: Math.min(range.end, segmentRange.end),
    }))
    .filter((range) => range.start < range.end)
    .filter((range) => !(range.start === segmentRange.start && range.end === segmentRange.end))
    .map(toTimeRange);
};

/**
 * その日の休憩のうち、実際に効く部分を返す。
 * 時刻を持つ勤務（時間指定、パターン選択）は勤務時間の内側だけ、日付選択は入力されたままを返す。
 * 勤務時間の内側へ切り詰めた結果、ひと続きの勤務の開始か終了に接する休憩は除く。
 */
export const getEffectiveBreaks = (
  shift: Pick<ShiftData, "positions" | "breaks">,
  options: { clipToWork: boolean },
): ShiftTimeRange[] => {
  const breaks = shift.breaks ?? [];
  if (breaks.length === 0) return [];
  const segments = workSegments(shift);
  if (segments.length === 0) return [];
  if (!options.clipToWork) return mergeBreaks(breaks);
  const blocks = getWorkBlocks(shift);
  return mergeBreaks(segments.flatMap((segment) => getBreaksForSegment(segment, breaks))).filter(
    (range) => !touchesBlockEdge(toMinuteRange(range), blocks),
  );
};

const isSameRanges = (a: readonly ShiftTimeRange[], b: readonly ShiftTimeRange[]): boolean =>
  a.length === b.length && a.every((range, index) => range.start === b[index].start && range.end === b[index].end);

/**
 * 選んだ範囲を、その日の休憩へ足した結果を返す。時刻を持つ勤務で、勤務のバーの範囲を選んで休憩を入れるときに使う。
 * 勤務時間の内側だけを残し、重なる休憩と隣り合う休憩は1件にまとめる。
 * 休憩がひと続きの勤務の開始か終了に接する場合は、その休憩は勤務ではないため、休憩として残さず勤務を短くする。
 * ひと続きの勤務をまるごと覆う範囲は入れない。何も変わらない場合（範囲が勤務の外にある場合など）はnullを返す。
 */
export const applyBreakRange = (
  shift: Pick<ShiftData, "positions" | "breaks">,
  range: ShiftTimeRange,
): { positions: PositionSegment[]; breaks: ShiftTimeRange[] } | null => {
  const target = toMinuteRange(range);
  const blocks = getWorkBlocks(shift);
  const current = getEffectiveBreaks(shift, { clipToWork: true });
  const added = blocks.flatMap((block) => {
    const clipped = { start: Math.max(target.start, block.start), end: Math.min(target.end, block.end) };
    const coversWholeBlock = clipped.start === block.start && clipped.end === block.end;
    return clipped.start < clipped.end && !coversWholeBlock ? [clipped] : [];
  });
  const candidates = mergeRanges([...current.map(toMinuteRange), ...added]);

  // 頭とお尻の休憩を除いた、ひと続きの勤務。まとめた休憩は互いに離れているため、端に接するのは先頭と末尾の1件ずつである。
  const trimmedBlocks: MinuteRange[] = [];
  for (const block of blocks) {
    const inside = candidates.filter((item) => item.start >= block.start && item.end <= block.end);
    const head = inside.find((item) => item.start === block.start);
    const tail = inside.find((item) => item.end === block.end);
    const trimmed = { start: head ? head.end : block.start, end: tail ? tail.start : block.end };
    // 休憩だけが残る勤務は作らない。
    if (trimmed.start >= trimmed.end) return null;
    trimmedBlocks.push(trimmed);
  }

  const positions = shift.positions.flatMap((position) => {
    if (!isCanonicalWorkPosition(position)) return [position];
    const segment = toMinuteRange(position);
    const block = trimmedBlocks.find((item) => segment.start < item.end && segment.end > item.start);
    if (!block) return [];
    const start = Math.max(segment.start, block.start);
    const end = Math.min(segment.end, block.end);
    return start === segment.start && end === segment.end
      ? [position]
      : [{ ...position, start: minutesToTime(start), end: minutesToTime(end) }];
  });
  const breaks = getEffectiveBreaks({ positions, breaks: candidates.map(toTimeRange) }, { clipToWork: true });

  const isSamePositions =
    positions.length === shift.positions.length &&
    positions.every((position, index) => position === shift.positions[index]);
  return isSamePositions && isSameRanges(current, breaks) ? null : { positions, breaks };
};

/**
 * 休憩として扱っていない休憩（勤務の外に出たもの、勤務の頭かお尻にかかったもの）を、その日の休憩から取り除く。
 * 時刻を持つ勤務の長さを変えたあとに使う。取り除かないと、勤務を縮めてから伸ばしたときに、消えたはずの休憩がまた出る。
 * 取り除くものがなければ、そのまま返す。
 */
export const pruneBreaks = <Shift extends Pick<ShiftData, "positions" | "breaks">>(shift: Shift): Shift => {
  if (!shift.breaks || shift.breaks.length === 0) return shift;
  const breaks = getEffectiveBreaks(shift, { clipToWork: true });
  if (isSameRanges(shift.breaks, breaks)) return shift;
  const { breaks: _breaks, ...rest } = shift;
  return (breaks.length > 0 ? { ...rest, breaks } : rest) as Shift;
};

/**
 * 休憩の開始か終了を動かした結果の、その日の休憩を返す。時刻を持つ勤務で、休憩の端をつまんで動かすときに使う。
 * 動かす端は、ひと続きの勤務の開始より後、終了より前に収める。
 * 反対の端まで動かして、休憩が15分より短くなる場合は、その休憩を削除する。
 * ほかの休憩と重なった場合は、1件にまとめる。対象の休憩がない場合と、何も変わらない場合はnullを返す。
 */
export const moveBreakEdge = (
  shift: Pick<ShiftData, "positions" | "breaks">,
  target: MinuteRange,
  edge: "start" | "end",
  minutes: number,
): ShiftTimeRange[] | null => {
  const current = getEffectiveBreaks(shift, { clipToWork: true }).map(toMinuteRange);
  const index = current.findIndex((range) => range.start === target.start && range.end === target.end);
  const block = getWorkBlocks(shift).find((item) => item.start < target.start && target.end < item.end);
  if (index < 0 || !block) return null;

  const others = current.filter((_, itemIndex) => itemIndex !== index);
  const moved =
    edge === "start"
      ? { start: Math.max(minutes, block.start + BREAK_TIME_UNIT_MINUTES), end: target.end }
      : { start: target.start, end: Math.min(minutes, block.end - BREAK_TIME_UNIT_MINUTES) };
  if (moved.start === target.start && moved.end === target.end) return null;
  // 15分より短くなるまで動かした場合は、休憩を削除する。
  if (moved.end - moved.start < BREAK_TIME_UNIT_MINUTES) return others.map(toTimeRange);

  const candidates = mergeRanges([...others, moved]).map(toTimeRange);
  const next = getEffectiveBreaks({ positions: shift.positions, breaks: candidates }, { clipToWork: true });
  // 動かした結果、休憩として扱えない形（ポジションの区間をまるごと覆うなど）になる場合は、変えない。
  const isKept = next.map(toMinuteRange).some((range) => range.start <= moved.start && moved.end <= range.end);
  return isKept ? next : null;
};

/** 休憩を引いた勤務時間（分）。重なる勤務区間は二重に数えない。 */
export const getWorkedMinutes = (shift: Pick<ShiftData, "positions" | "breaks">): number => {
  const workMinutes = getWorkBlocks(shift).reduce((total, range) => total + (range.end - range.start), 0);
  const breakMinutes = getEffectiveBreaks(shift, { clipToWork: true })
    .map(toMinuteRange)
    .reduce((total, range) => total + (range.end - range.start), 0);
  return workMinutes - breakMinutes;
};
