import { minutesToTime, timeToMinutes } from "./time";
import type { StaffingBar } from "./types";

// 時間指定の必要人数を、「この時間は何人」という区間の集合として扱う純粋処理。
// 同じポジションの区間は重ならず、人数が0の時間は区間を持たない。
// 正規化した配列は、ポジションIDの順、その中で開始の早い順に並び、同じ人数で端が接した区間を1つにまとめてある。
// 同じ人数の並びからは、編集の順番によらず同じ配列ができる。

/** ポジションの、ある時間に必要な人数。 */
export type StaffingSegment = {
  positionId: string;
  /** 開始（"HH:mm"） */
  startTime: string;
  /** 終了（"HH:mm"）。24時以降は "25:00" の形で持つ。 */
  endTime: string;
  /** 必要な人数。1以上の整数。 */
  count: number;
};

/** 人数を入れられる時刻の範囲（分）。店舗の受付時間にあたる。 */
export type StaffingSegmentRange = { startMinutes: number; endMinutes: number };

/** 人数が変わらない、ひと続きの時間（分）。人数が0の時間も表せる。 */
export type StaffingCountSpan = { startMinutes: number; endMinutes: number; count: number };

export const STAFFING_SEGMENT_UNIT_MINUTES = 30;

/** 1ポジションの1つの時間に入れられる人数の上限。サーバーが受け付ける、同じ時間に重なるバーの本数と同じ値にする。 */
export const DEFAULT_STAFFING_COUNT_LIMIT = 50;

/**
 * 範囲の両端を、刻みに乗る内側の時刻へ寄せる。
 * 受付時間が刻みにそろっていない店舗（09:15〜20:45など）でも、人数を入れられる範囲を刻みの上に保つ。
 */
export const alignStaffingSegmentRange = (range: StaffingSegmentRange, unitMinutes: number): StaffingSegmentRange => ({
  startMinutes: Math.ceil(range.startMinutes / unitMinutes) * unitMinutes,
  endMinutes: Math.floor(range.endMinutes / unitMinutes) * unitMinutes,
});

const comparePositionIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const listPositionIds = (items: readonly { positionId: string }[]): string[] =>
  [...new Set(items.map((item) => item.positionId))].sort(comparePositionIds);

const isPositiveCount = (count: number): boolean => Number.isFinite(count) && count > 0;

/**
 * 1つのポジションの区間を、重ならない人数の並びへ直す。
 * 重なった区間があれば、配列のあとにある区間の人数を使う。人数が0以下の区間と、長さのない区間は捨てる。
 */
const toSpans = (segments: readonly StaffingSegment[], positionId: string): StaffingCountSpan[] => {
  const ranges = segments
    .filter((segment) => segment.positionId === positionId)
    .map((segment) => ({
      startMinutes: timeToMinutes(segment.startTime),
      endMinutes: timeToMinutes(segment.endTime),
      count: segment.count,
    }))
    .filter((range) => range.startMinutes < range.endMinutes);
  const points = [...new Set(ranges.flatMap((range) => [range.startMinutes, range.endMinutes]))].sort((a, b) => a - b);

  const spans: StaffingCountSpan[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const startMinutes = points[index];
    const endMinutes = points[index + 1];
    const covering = ranges.findLast((range) => range.startMinutes <= startMinutes && startMinutes < range.endMinutes);
    const count = covering && isPositiveCount(covering.count) ? covering.count : 0;
    const previous = spans.at(-1);
    if (previous && previous.count === count) previous.endMinutes = endMinutes;
    else spans.push({ startMinutes, endMinutes, count });
  }
  return spans.filter((span) => span.count > 0);
};

const toSegment = (positionId: string, span: StaffingCountSpan): StaffingSegment => ({
  positionId,
  startTime: minutesToTime(span.startMinutes),
  endTime: minutesToTime(span.endMinutes),
  count: span.count,
});

const toBar = (positionId: string, range: { startMinutes: number; endMinutes: number }): StaffingBar => ({
  positionId,
  start: minutesToTime(range.startMinutes),
  end: minutesToTime(range.endMinutes),
});

/**
 * 区間を正規化する。
 * ポジションIDの順、その中で開始の早い順に並べ、同じ人数で端が接した区間を1つにまとめる。
 * 人数が0以下の区間と、長さのない区間は捨てる。同じポジションで重なった区間は、配列のあとにある区間の人数にする。
 */
export const normalizeStaffingSegments = (segments: readonly StaffingSegment[]): StaffingSegment[] =>
  listPositionIds(segments).flatMap((positionId) =>
    toSpans(segments, positionId).map((span) => toSegment(positionId, span)),
  );

/**
 * その範囲の人数を、選んだ人数に置き換える。前に入っていた人数は残さない。
 * 人数が0なら、その範囲を空にする。範囲の外の区間と、ほかのポジションの区間は変えない。
 * 返す配列は正規化してある。範囲の長さが0以下なら、正規化だけを行う。
 */
export const setStaffingCount = (input: {
  segments: readonly StaffingSegment[];
  positionId: string;
  startMinutes: number;
  endMinutes: number;
  count: number;
}): StaffingSegment[] => {
  const { segments, positionId, startMinutes, endMinutes, count } = input;
  if (!(startMinutes < endMinutes)) return normalizeStaffingSegments(segments);

  const others = segments.filter((segment) => segment.positionId !== positionId);
  // 範囲にかかる区間は、範囲の前と後ろに残る部分だけへ切る。
  const kept = toSpans(segments, positionId).flatMap((span) =>
    [
      { ...span, endMinutes: Math.min(span.endMinutes, startMinutes) },
      { ...span, startMinutes: Math.max(span.startMinutes, endMinutes) },
    ].filter((part) => part.startMinutes < part.endMinutes),
  );
  const replaced = isPositiveCount(count) ? [{ startMinutes, endMinutes, count }] : [];
  return normalizeStaffingSegments([...others, ...[...kept, ...replaced].map((span) => toSegment(positionId, span))]);
};

/**
 * 人数の入った1つの時間帯を、別の時間帯へ置き換える。
 * 元の時間帯（from）を空にしてから、新しい時間帯（to）へその人数を入れる。
 * 元の時間帯のうち新しい時間帯から外れた時間は人数なしになり、新しく入った時間は、前に入っていた人数を置き換える。
 * 返す配列は正規化してある。新しい時間帯の長さが0以下なら、元の時間帯を空にするだけになる。
 */
export const moveStaffingCount = (input: {
  segments: readonly StaffingSegment[];
  positionId: string;
  from: StaffingSegmentRange;
  to: StaffingSegmentRange;
  count: number;
}): StaffingSegment[] => {
  const { positionId, from, to, count } = input;
  const cleared = setStaffingCount({ segments: input.segments, positionId, ...from, count: 0 });
  return setStaffingCount({ segments: cleared, positionId, ...to, count });
};

/**
 * 範囲を、人数が変わる時刻で区切る。人数の入っていない時間は、0人の区間として返す。
 * 返す区間は、範囲の端から端までをすき間なく埋める。範囲の外にかかる区間は、範囲の内側だけを数える。
 */
export const splitRangeByStaffingCount = (input: {
  segments: readonly StaffingSegment[];
  positionId: string;
  range: StaffingSegmentRange;
}): StaffingCountSpan[] => {
  const { range } = input;
  if (!(range.startMinutes < range.endMinutes)) return [];

  const inside = toSpans(input.segments, input.positionId)
    .map((span) => ({
      ...span,
      startMinutes: Math.max(span.startMinutes, range.startMinutes),
      endMinutes: Math.min(span.endMinutes, range.endMinutes),
    }))
    .filter((span) => span.startMinutes < span.endMinutes);

  const spans: StaffingCountSpan[] = [];
  let cursor = range.startMinutes;
  for (const span of inside) {
    if (cursor < span.startMinutes) spans.push({ startMinutes: cursor, endMinutes: span.startMinutes, count: 0 });
    spans.push(span);
    cursor = span.endMinutes;
  }
  if (cursor < range.endMinutes) spans.push({ startMinutes: cursor, endMinutes: range.endMinutes, count: 0 });
  return spans;
};

/** その時刻（分）に必要な人数。区間の終了ちょうどの時刻は、その区間に含めない。 */
export const getStaffingCountAt = (segments: readonly StaffingSegment[], positionId: string, minutes: number): number =>
  toSpans(segments, positionId).find((span) => span.startMinutes <= minutes && minutes < span.endMinutes)?.count ?? 0;

/** そのポジションの、いちばん多い人数。区間がなければ0を返す。 */
export const getMaxStaffingCount = (segments: readonly StaffingSegment[], positionId: string): number =>
  Math.max(0, ...toSpans(segments, positionId).map((span) => span.count));

/**
 * その範囲の中で、ポジションの人数がとる最小と最大を返す。人数の入っていない時間は0人として数える。
 * 範囲の長さが0以下なら、nullを返す。
 */
export const getStaffingCountRange = (input: {
  segments: readonly StaffingSegment[];
  positionId: string;
  startMinutes: number;
  endMinutes: number;
}): { min: number; max: number } | null => {
  const spans = splitRangeByStaffingCount({
    segments: input.segments,
    positionId: input.positionId,
    range: { startMinutes: input.startMinutes, endMinutes: input.endMinutes },
  });
  if (spans.length === 0) return null;
  const counts = spans.map((span) => span.count);
  return { min: Math.min(...counts), max: Math.max(...counts) };
};

/**
 * バーを、時間ごとの人数の区間へ変える。重なったバーの本数が、その時間の人数になる。
 * 端が接しているだけのバーは重なりに数えない。返す配列は正規化してある。
 */
export const barsToStaffingSegments = (bars: readonly StaffingBar[]): StaffingSegment[] =>
  listPositionIds(bars).flatMap((positionId) => {
    const ranges = bars
      .filter((bar) => bar.positionId === positionId)
      .map((bar) => ({ start: timeToMinutes(bar.start), end: timeToMinutes(bar.end) }))
      .filter((range) => range.start < range.end);
    const points = [...new Set(ranges.flatMap((range) => [range.start, range.end]))].sort((a, b) => a - b);
    const spans: StaffingCountSpan[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const startMinutes = points[index];
      const count = ranges.filter((range) => range.start <= startMinutes && startMinutes < range.end).length;
      const previous = spans.at(-1);
      if (previous && previous.count === count) previous.endMinutes = points[index + 1];
      else spans.push({ startMinutes, endMinutes: points[index + 1], count });
    }
    return spans.filter((span) => span.count > 0).map((span) => toSegment(positionId, span));
  });

/**
 * 時間ごとの人数の区間を、バーへ変える。
 * 人数の段を下から1人分ずつの層に分け、k人目の層で人数がk人以上続く時間を、1本のバーにする。
 * バーの本数は、同じ人数の並びを表せる最少の本数になる。
 * 変えたバーを barsToStaffingSegments へ渡すと、正規化した元の区間に戻る。
 * 並びは、ポジションIDの順、下の層から、開始の早い順である。
 */
export const staffingSegmentsToBars = (segments: readonly StaffingSegment[]): StaffingBar[] =>
  listPositionIds(segments).flatMap((positionId) => {
    const spans = toSpans(segments, positionId);
    const peak = Math.max(0, ...spans.map((span) => span.count));
    const bars: StaffingBar[] = [];
    for (let layer = 1; layer <= peak; layer += 1) {
      let current: { startMinutes: number; endMinutes: number } | null = null;
      for (const span of spans) {
        if (span.count < layer) continue;
        if (current && current.endMinutes === span.startMinutes) {
          current.endMinutes = span.endMinutes;
          continue;
        }
        if (current) bars.push(toBar(positionId, current));
        current = { startMinutes: span.startMinutes, endMinutes: span.endMinutes };
      }
      if (current) bars.push(toBar(positionId, current));
    }
    return bars;
  });

const isSegmentWithinRange = (segment: StaffingSegment, range: StaffingSegmentRange): boolean =>
  timeToMinutes(segment.startTime) >= range.startMinutes && timeToMinutes(segment.endTime) <= range.endMinutes;

/** 受付時間の外にかかる区間の数。完全に外の区間と、範囲の端をまたぐ区間を数える。 */
export const countSegmentsOutsideRange = (segments: readonly StaffingSegment[], range: StaffingSegmentRange): number =>
  segments.filter((segment) => !isSegmentWithinRange(segment, range)).length;

/**
 * 区間を受付時間に合わせて切りそろえる。
 * 完全に外の区間は消し、範囲の端をまたぐ区間は内側へ切る。切ったあとの長さが刻みに届かない区間も消す。
 * 切った端が刻みから外れないよう、範囲は alignStaffingSegmentRange で、刻みに乗る内側へ寄せる。
 * 返す配列は正規化してある。
 */
export const trimSegmentsToRange = (input: {
  segments: readonly StaffingSegment[];
  range: StaffingSegmentRange;
  unitMinutes: number;
}): StaffingSegment[] => {
  const range = alignStaffingSegmentRange(input.range, input.unitMinutes);
  return normalizeStaffingSegments(
    input.segments.flatMap((segment) => {
      const startMinutes = Math.max(timeToMinutes(segment.startTime), range.startMinutes);
      const endMinutes = Math.min(timeToMinutes(segment.endTime), range.endMinutes);
      if (endMinutes - startMinutes < input.unitMinutes) return [];
      return [toSegment(segment.positionId, { startMinutes, endMinutes, count: segment.count })];
    }),
  );
};

export type StaffingSegmentRejection =
  // 終了が開始より前、または長さが刻みに届かない
  | "TOO_SHORT"
  // 開始か終了が刻みに合っていない
  | "NOT_ON_UNIT"
  // 受付時間の外にかかる
  | "OUT_OF_RANGE"
  // 同じポジションの区間が重なっている
  | "OVERLAP"
  // 人数が1以上、上限以下の整数でない
  | "INVALID_COUNT";

export type StaffingSegmentValidation = { ok: true } | { ok: false; reason: StaffingSegmentRejection };

/**
 * 区間を保存できる形か確かめる。最初に見つかった理由を返す。
 * 時刻は刻みに乗り、受付時間の内側にあること。同じポジションの区間は重ならないこと。人数は1以上、上限以下の整数であること。
 * 並びと、同じ人数の区間がまとまっているかは確かめない。保存の前に normalizeStaffingSegments でそろえる。
 */
export const validateStaffingSegments = (input: {
  segments: readonly StaffingSegment[];
  range: StaffingSegmentRange;
  /** 刻み（分）。区間の最小の長さでもある。未指定は30分。 */
  unitMinutes?: number;
  /** 人数の上限。未指定は50人。 */
  maxCount?: number;
}): StaffingSegmentValidation => {
  const { segments, range } = input;
  const unitMinutes = input.unitMinutes ?? STAFFING_SEGMENT_UNIT_MINUTES;
  const maxCount = input.maxCount ?? DEFAULT_STAFFING_COUNT_LIMIT;

  for (const segment of segments) {
    const start = timeToMinutes(segment.startTime);
    const end = timeToMinutes(segment.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { ok: false, reason: "NOT_ON_UNIT" };
    if (end - start < unitMinutes) return { ok: false, reason: "TOO_SHORT" };
    if (start % unitMinutes !== 0 || end % unitMinutes !== 0) return { ok: false, reason: "NOT_ON_UNIT" };
    if (start < range.startMinutes || end > range.endMinutes) return { ok: false, reason: "OUT_OF_RANGE" };
    if (!Number.isInteger(segment.count) || segment.count < 1 || segment.count > maxCount) {
      return { ok: false, reason: "INVALID_COUNT" };
    }
  }

  for (const positionId of listPositionIds(segments)) {
    const sorted = segments
      .filter((segment) => segment.positionId === positionId)
      .map((segment) => ({ start: timeToMinutes(segment.startTime), end: timeToMinutes(segment.endTime) }))
      .sort((a, b) => a.start - b.start);
    // 端が接しているだけの区間は、重なりに数えない。
    if (sorted.some((item, index) => index > 0 && item.start < sorted[index - 1].end)) {
      return { ok: false, reason: "OVERLAP" };
    }
  }
  return { ok: true };
};
