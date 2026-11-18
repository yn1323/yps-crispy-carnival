import { isCanonicalWorkPosition } from "./positions";
import { minutesToTime, timeToMinutes } from "./time";
import type { PositionSegment, ShiftBreakRule, ShiftData, ShiftTimeRange } from "./types";

// 勤務中の休憩の純粋処理。
// 画面は休憩を1日単位で持ち（ShiftData.breaks）、保存と集計のときに勤務時間の内側へ切り詰める。
// 勤務を縮めたり消したりしても休憩の編集状態を作り直さずに済ませるためである。
// 時刻を持つ勤務の休憩は、ひと続きの勤務の開始より後、終了より前にあるものだけを休憩として扱う。
// 勤務の頭かお尻にある休憩は勤務ではないため、休憩として残さない。

export const BREAK_TIME_UNIT_MINUTES = 15;

type MinuteRange = { start: number; end: number };

const toMinuteRange = (range: ShiftTimeRange): MinuteRange => ({
  start: timeToMinutes(range.start),
  end: timeToMinutes(range.end),
});

const toTimeRange = (range: MinuteRange): ShiftTimeRange => ({
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

/** ひと続きの勤務。隣り合う勤務区間と重なる勤務区間を1つにまとめる。 */
const workBlocks = (shift: Pick<ShiftData, "positions">): MinuteRange[] =>
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
  const blocks = workBlocks(shift);
  return mergeBreaks(segments.flatMap((segment) => getBreaksForSegment(segment, breaks))).filter(
    (range) => !touchesBlockEdge(toMinuteRange(range), blocks),
  );
};

const isSameRanges = (a: readonly ShiftTimeRange[], b: readonly ShiftTimeRange[]): boolean =>
  a.length === b.length && a.every((range, index) => range.start === b[index].start && range.end === b[index].end);

/**
 * 選んだ範囲を、その日の休憩へ足した結果を返す。時刻を持つ勤務で、勤務のバーの上をなぞって休憩を入れるときに使う。
 * 勤務時間の内側だけを残し、重なる休憩と隣り合う休憩は1件にまとめる。
 * 休憩がひと続きの勤務の開始か終了に接する場合は、その休憩は勤務ではないため、休憩として残さず勤務を短くする。
 * ひと続きの勤務をまるごと覆う範囲は入れない。何も変わらない場合（範囲が勤務の外にある場合など）はnullを返す。
 */
export const applyBreakRange = (
  shift: Pick<ShiftData, "positions" | "breaks">,
  range: ShiftTimeRange,
): { positions: PositionSegment[]; breaks: ShiftTimeRange[] } | null => {
  const target = toMinuteRange(range);
  const blocks = workBlocks(shift);
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

/** その時刻（分）を含む休憩を外した結果を返す。その時刻に休憩がなければnullを返す。 */
export const removeBreakAt = (
  shift: Pick<ShiftData, "positions" | "breaks">,
  minutes: number,
): ShiftTimeRange[] | null => {
  const current = getEffectiveBreaks(shift, { clipToWork: true });
  const next = current.filter((range) => {
    const { start, end } = toMinuteRange(range);
    return !(start <= minutes && minutes < end);
  });
  return next.length === current.length ? null : next;
};

/** 休憩を引いた勤務時間（分）。重なる勤務区間は二重に数えない。 */
export const getWorkedMinutes = (shift: Pick<ShiftData, "positions" | "breaks">): number => {
  const workMinutes = workBlocks(shift).reduce((total, range) => total + (range.end - range.start), 0);
  const breakMinutes = getEffectiveBreaks(shift, { clipToWork: true })
    .map(toMinuteRange)
    .reduce((total, range) => total + (range.end - range.start), 0);
  return workMinutes - breakMinutes;
};

/**
 * 店舗の休憩の決まりから、新しく作った勤務へ入れる休憩の初期値を返す。
 * 決まりがない、勤務が決まりの長さに届かない、休憩を勤務の開始より後、終了より前に置けない、という場合はnullを返す。
 * 休憩は勤務の中央へ、15分単位にそろえて置く。
 */
export const buildInitialBreak = (
  segment: Pick<PositionSegment, "start" | "end">,
  rule: ShiftBreakRule | null | undefined,
): ShiftTimeRange | null => {
  if (!rule) return null;
  const { start, end } = toMinuteRange(segment);
  const duration = end - start;
  if (duration < rule.minWorkMinutes) return null;

  // 中央に最も近い15分単位の位置が端に接する勤務には、ほかに置ける位置もない。
  const centeredStart = start + (duration - rule.breakMinutes) / 2;
  const breakStart = Math.round(centeredStart / BREAK_TIME_UNIT_MINUTES) * BREAK_TIME_UNIT_MINUTES;
  if (breakStart <= start || breakStart + rule.breakMinutes >= end) return null;
  return toTimeRange({ start: breakStart, end: breakStart + rule.breakMinutes });
};

/**
 * 勤務のある日のうち休憩がまだない日へ、休憩の決まりの初期値を入れる。
 * 最も長い勤務区間を対象にし、すでに休憩がある日と、決まりに届かない日は変えない。
 */
export const withInitialBreak = <Shift extends Pick<ShiftData, "positions" | "breaks">>(
  shift: Shift,
  rule: ShiftBreakRule | null | undefined,
): Shift => {
  if (!rule || (shift.breaks?.length ?? 0) > 0) return shift;
  const longest = workSegments(shift)
    .slice()
    .sort((a, b) => timeToMinutes(b.end) - timeToMinutes(b.start) - (timeToMinutes(a.end) - timeToMinutes(a.start)))[0];
  if (!longest) return shift;
  const initialBreak = buildInitialBreak(longest, rule);
  return initialBreak ? { ...shift, breaks: [initialBreak] } : shift;
};
