import { isCanonicalWorkPosition } from "./positions";
import { minutesToTime, timeToMinutes } from "./time";
import type { PositionSegment, ShiftBreakRule, ShiftData, ShiftTimeRange } from "./types";

// 勤務中の休憩の純粋処理。
// 画面は休憩を1日単位で持ち（ShiftData.breaks）、保存と集計のときに勤務時間の内側へ切り詰める。
// 勤務を縮めたり消したりしても休憩の編集状態を作り直さずに済ませるためである。

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

/** 重なる休憩と隣り合う休憩を1件にまとめ、開始順に並べる。 */
export const mergeBreaks = (breaks: readonly ShiftTimeRange[]): ShiftTimeRange[] => {
  const merged: MinuteRange[] = [];
  for (const current of breaks
    .map(toMinuteRange)
    .filter((range) => range.start < range.end)
    .sort(compareRanges)) {
    const previous = merged.at(-1);
    if (previous && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged.map(toTimeRange);
};

const workSegments = (shift: Pick<ShiftData, "positions">): PositionSegment[] =>
  shift.positions.filter(isCanonicalWorkPosition);

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
  return mergeBreaks(segments.flatMap((segment) => getBreaksForSegment(segment, breaks)));
};

/** 休憩を引いた勤務時間（分）。重なる勤務区間は二重に数えない。 */
export const getWorkedMinutes = (shift: Pick<ShiftData, "positions" | "breaks">): number => {
  const merged: MinuteRange[] = [];
  for (const current of workSegments(shift)
    .map(toMinuteRange)
    .filter((range) => range.start < range.end)
    .sort(compareRanges)) {
    const previous = merged.at(-1);
    if (previous && current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  const workMinutes = merged.reduce((total, range) => total + (range.end - range.start), 0);
  const breakMinutes = getEffectiveBreaks(shift, { clipToWork: true })
    .map(toMinuteRange)
    .reduce((total, range) => total + (range.end - range.start), 0);
  return workMinutes - breakMinutes;
};

/**
 * 店舗の休憩の決まりから、新しく作った勤務へ入れる休憩の初期値を返す。
 * 決まりがない、勤務が決まりの長さに届かない、という場合はnullを返す。
 * 休憩は勤務の中央へ、15分単位にそろえて置く。
 */
export const buildInitialBreak = (
  segment: Pick<PositionSegment, "start" | "end">,
  rule: ShiftBreakRule | null | undefined,
): ShiftTimeRange | null => {
  if (!rule) return null;
  const { start, end } = toMinuteRange(segment);
  const duration = end - start;
  if (duration < rule.minWorkMinutes || rule.breakMinutes >= duration) return null;

  const centeredStart = start + (duration - rule.breakMinutes) / 2;
  const snappedStart = Math.round(centeredStart / BREAK_TIME_UNIT_MINUTES) * BREAK_TIME_UNIT_MINUTES;
  const breakStart = Math.min(Math.max(snappedStart, start), end - rule.breakMinutes);
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
