import { minutesToTime, timeToMinutes } from "./time";
import type { StaffingBar } from "./types";

// 時間指定の必要人数を、バーの集合として扱う純粋処理。
// 1本のバーが1人分で、ある時刻のポジションの必要人数は、その時刻に重なるバーの本数になる。
// 行は保存しない。表示のたびに packStaffingBars で行へ詰める。
// 隣り合うバー（10:00-14:00と14:00-18:00）は、2人の交代と1人の通しを区別するため、つなげない。

/** 編集中のバー。idは画面側で振る、一覧の中で一意な値である。保存するときは toStoredStaffingBars で外す。 */
export type EditableStaffingBar = StaffingBar & { id: string };

/** バーを置ける時刻の範囲（分）。店舗の受付時間にあたる。 */
export type StaffingBarRange = { startMinutes: number; endMinutes: number };

export type StaffingBarLimits = {
  /** 1ポジションで同時に重ねられるバーの本数 */
  maxConcurrentPerPosition: number;
  /** 1つの型に置けるバーの本数 */
  maxBars: number;
};

export type StaffingBarRules = {
  range: StaffingBarRange;
  /** 刻み（分）。バーの最小の長さでもある。 */
  unitMinutes: number;
  limits: StaffingBarLimits;
};

export const STAFFING_BAR_UNIT_MINUTES = 30;

export const DEFAULT_STAFFING_BAR_LIMITS: StaffingBarLimits = {
  maxConcurrentPerPosition: 10,
  maxBars: 200,
};

export type StaffingBarRejection =
  // 終了が開始より前、または長さが刻みに届かない
  | "TOO_SHORT"
  // 開始か終了が刻みに合っていない
  | "NOT_ON_UNIT"
  // 受付時間の外にかかる
  | "OUT_OF_RANGE"
  // 1つの型のバーの上限を超える
  | "TOO_MANY_BARS"
  // 1ポジションで同時に重なるバーの上限を超える
  | "TOO_MANY_CONCURRENT"
  // 本数が1以上の整数でない
  | "INVALID_COUNT"
  // 対象のバーがない
  | "NOT_FOUND";

/** 操作の結果。受け付けない操作は、バーを変えずに理由のコードを返す。 */
export type StaffingBarResult = { ok: true; bars: EditableStaffingBar[] } | { ok: false; reason: StaffingBarRejection };

type MinuteRange = { start: number; end: number };

const toMinuteRange = (bar: Pick<StaffingBar, "start" | "end">): MinuteRange => ({
  start: timeToMinutes(bar.start),
  end: timeToMinutes(bar.end),
});

const ID_PATTERN = /^bar-(\d+)$/;

// 新しいバーのidは、一覧にある番号の最大の次から振る。乱数や時刻を使わないので、同じ入力から同じ結果になる。
const nextIdNumber = (bars: readonly EditableStaffingBar[]): number =>
  bars.reduce((max, bar) => {
    const matched = ID_PATTERN.exec(bar.id);
    return matched ? Math.max(max, Number(matched[1])) : max;
  }, 0) + 1;

/** 保存済みのバーへ、編集用のidを振る。 */
export const toEditableStaffingBars = (bars: readonly StaffingBar[]): EditableStaffingBar[] =>
  bars.map((bar, index) => ({ id: `bar-${index + 1}`, positionId: bar.positionId, start: bar.start, end: bar.end }));

/** 編集用のidを外し、保存する形へ戻す。並びは変えない。 */
export const toStoredStaffingBars = (bars: readonly StaffingBar[]): StaffingBar[] =>
  bars.map((bar) => ({ positionId: bar.positionId, start: bar.start, end: bar.end }));

/** バーの全体が受付時間の内側にあるか。 */
export const isStaffingBarWithinRange = (bar: Pick<StaffingBar, "start" | "end">, range: StaffingBarRange): boolean => {
  const { start, end } = toMinuteRange(bar);
  return start >= range.startMinutes && end <= range.endMinutes;
};

/** そのポジションで同時に重なるバーの、最大の本数。隣り合うバーは重なりに数えない。 */
export const getPeakStaffingBarCount = (bars: readonly StaffingBar[], positionId: string): number => {
  const events: Array<{ minute: number; delta: number }> = [];
  for (const bar of bars) {
    if (bar.positionId !== positionId) continue;
    const { start, end } = toMinuteRange(bar);
    if (!(start < end)) continue;
    events.push({ minute: start, delta: 1 }, { minute: end, delta: -1 });
  }
  // 同じ時刻では終了を先に数え、14:00で終わるバーと14:00から始まるバーを重ねない。
  events.sort((a, b) => a.minute - b.minute || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return peak;
};

const findTimeRejection = (
  bar: Pick<StaffingBar, "start" | "end">,
  rules: StaffingBarRules,
): StaffingBarRejection | null => {
  const { start, end } = toMinuteRange(bar);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "NOT_ON_UNIT";
  if (end - start < rules.unitMinutes) return "TOO_SHORT";
  if (start % rules.unitMinutes !== 0 || end % rules.unitMinutes !== 0) return "NOT_ON_UNIT";
  if (start < rules.range.startMinutes || end > rules.range.endMinutes) return "OUT_OF_RANGE";
  return null;
};

// 同時に重なる本数は、操作で最大の本数が増え、上限を超えるときだけ受け付けない。
// 上限を超えた保存済みのバーがあっても、縮める操作と削除は受け付けられるようにするためである。
const exceedsConcurrentLimit = (
  before: readonly StaffingBar[],
  after: readonly StaffingBar[],
  positionId: string,
  limits: StaffingBarLimits,
): boolean => {
  const peak = getPeakStaffingBarCount(after, positionId);
  return peak > limits.maxConcurrentPerPosition && peak > getPeakStaffingBarCount(before, positionId);
};

const isValidCount = (count: number): boolean => Number.isInteger(count) && count >= 1;

type AddStaffingBarsInput = {
  bars: readonly EditableStaffingBar[];
  bar: StaffingBar;
  /** 同じ時間に足す本数 */
  count: number;
  rules: StaffingBarRules;
};

/** 同じポジション、同じ時間のバーを、本数分だけ足す。 */
export const addStaffingBars = ({ bars, bar, count, rules }: AddStaffingBarsInput): StaffingBarResult => {
  if (!isValidCount(count)) return { ok: false, reason: "INVALID_COUNT" };
  const timeRejection = findTimeRejection(bar, rules);
  if (timeRejection) return { ok: false, reason: timeRejection };
  if (bars.length + count > rules.limits.maxBars) return { ok: false, reason: "TOO_MANY_BARS" };

  const firstId = nextIdNumber(bars);
  const added: EditableStaffingBar[] = Array.from({ length: count }, (_, index) => ({
    id: `bar-${firstId + index}`,
    positionId: bar.positionId,
    start: bar.start,
    end: bar.end,
  }));
  const next = [...bars, ...added];
  if (exceedsConcurrentLimit(bars, next, bar.positionId, rules.limits)) {
    return { ok: false, reason: "TOO_MANY_CONCURRENT" };
  }
  return { ok: true, bars: next };
};

/** バーを1本足す。 */
export const addStaffingBar = (input: Omit<AddStaffingBarsInput, "count">): StaffingBarResult =>
  addStaffingBars({ ...input, count: 1 });

type UpdateStaffingBarInput = {
  bars: readonly EditableStaffingBar[];
  barId: string;
  start: string;
  end: string;
  rules: StaffingBarRules;
};

/** バーの開始と終了を、選んだ時刻へ変える。最小の長さに届かない時刻は受け付けない。 */
export const updateStaffingBar = ({ bars, barId, start, end, rules }: UpdateStaffingBarInput): StaffingBarResult => {
  const target = bars.find((bar) => bar.id === barId);
  if (!target) return { ok: false, reason: "NOT_FOUND" };
  const timeRejection = findTimeRejection({ start, end }, rules);
  if (timeRejection) return { ok: false, reason: timeRejection };
  if (target.start === start && target.end === end) return { ok: true, bars: bars.slice() };

  const next = bars.map((bar) => (bar.id === barId ? { ...bar, start, end } : bar));
  if (exceedsConcurrentLimit(bars, next, target.positionId, rules.limits)) {
    return { ok: false, reason: "TOO_MANY_CONCURRENT" };
  }
  return { ok: true, bars: next };
};

type ResizeStaffingBarInput = {
  bars: readonly EditableStaffingBar[];
  barId: string;
  /** 動かす端 */
  edge: "start" | "end";
  /** 端を動かした先の時刻（分） */
  minutes: number;
  rules: StaffingBarRules;
};

/**
 * バーの端をドラッグで動かす。
 * 動かした先は刻みへ寄せ、受付時間の内側と、最小の長さが残る位置で止める。
 * 反対の端を越えるドラッグでも、バーは消さずに最小の長さで残す。
 */
export const resizeStaffingBar = ({ bars, barId, edge, minutes, rules }: ResizeStaffingBarInput): StaffingBarResult => {
  const target = bars.find((bar) => bar.id === barId);
  if (!target) return { ok: false, reason: "NOT_FOUND" };
  // 受付時間の外にかかるバーは、先に「受付時間に合わせる」で切りそろえる。
  if (!isStaffingBarWithinRange(target, rules.range)) return { ok: false, reason: "OUT_OF_RANGE" };

  const { unitMinutes, range } = rules;
  const current = toMinuteRange(target);
  const snapped = Math.round(minutes / unitMinutes) * unitMinutes;
  const resized: MinuteRange =
    edge === "start"
      ? { start: Math.min(Math.max(snapped, range.startMinutes), current.end - unitMinutes), end: current.end }
      : { start: current.start, end: Math.max(Math.min(snapped, range.endMinutes), current.start + unitMinutes) };

  return updateStaffingBar({
    bars,
    barId,
    start: minutesToTime(resized.start),
    end: minutesToTime(resized.end),
    rules,
  });
};

/** バーを消す。 */
export const removeStaffingBars = (
  bars: readonly EditableStaffingBar[],
  barIds: readonly string[],
): EditableStaffingBar[] => {
  const removed = new Set(barIds);
  return bars.filter((bar) => !removed.has(bar.id));
};

/** バーを1本消す。 */
export const removeStaffingBar = (bars: readonly EditableStaffingBar[], barId: string): EditableStaffingBar[] =>
  removeStaffingBars(bars, [barId]);

export type StaffingBarGroup = {
  start: string;
  end: string;
  /** 同じ時間のバーのid。本数はこの件数である。 */
  barIds: string[];
};

/** 一覧で見せるために、同じポジション、同じ時間のバーを1件にまとめ、開始の早い順に並べる。 */
export const groupStaffingBars = (bars: readonly EditableStaffingBar[], positionId: string): StaffingBarGroup[] => {
  const groups = new Map<string, StaffingBarGroup>();
  for (const bar of bars) {
    if (bar.positionId !== positionId) continue;
    const key = `${bar.start}-${bar.end}`;
    const group = groups.get(key);
    if (group) group.barIds.push(bar.id);
    else groups.set(key, { start: bar.start, end: bar.end, barIds: [bar.id] });
  }
  return [...groups.values()].sort(
    (a, b) => timeToMinutes(a.start) - timeToMinutes(b.start) || timeToMinutes(a.end) - timeToMinutes(b.end),
  );
};

type SetStaffingBarGroupInput = {
  bars: readonly EditableStaffingBar[];
  /** まとめて変えるバーのid。同じポジションのバーを渡す。 */
  barIds: readonly string[];
  start: string;
  end: string;
  /** 変えたあとの本数 */
  count: number;
  rules: StaffingBarRules;
};

/**
 * 一覧でまとめたバーの、時間と本数を変える。
 * 本数を減らすと後ろのバーから消し、増やすと同じ時間のバーを足す。0本にはできない（消すときは removeStaffingBars を使う）。
 */
export const setStaffingBarGroup = ({
  bars,
  barIds,
  start,
  end,
  count,
  rules,
}: SetStaffingBarGroupInput): StaffingBarResult => {
  const targetIds = new Set(barIds);
  const targets = bars.filter((bar) => targetIds.has(bar.id));
  if (targets.length === 0) return { ok: false, reason: "NOT_FOUND" };
  if (!isValidCount(count)) return { ok: false, reason: "INVALID_COUNT" };
  const timeRejection = findTimeRejection({ start, end }, rules);
  if (timeRejection) return { ok: false, reason: timeRejection };
  if (bars.length - targets.length + count > rules.limits.maxBars) return { ok: false, reason: "TOO_MANY_BARS" };

  const positionId = targets[0].positionId;
  const keptIds = new Set(targets.slice(0, count).map((bar) => bar.id));
  const firstId = nextIdNumber(bars);
  const added: EditableStaffingBar[] = Array.from({ length: Math.max(0, count - targets.length) }, (_, index) => ({
    id: `bar-${firstId + index}`,
    positionId,
    start,
    end,
  }));
  const next = [
    ...bars.flatMap((bar) => {
      if (!targetIds.has(bar.id)) return [bar];
      return keptIds.has(bar.id) ? [{ ...bar, start, end }] : [];
    }),
    ...added,
  ];
  if (exceedsConcurrentLimit(bars, next, positionId, rules.limits)) {
    return { ok: false, reason: "TOO_MANY_CONCURRENT" };
  }
  return { ok: true, bars: next };
};

export type PackedStaffingBars<Bar extends StaffingBar> = {
  positionId: string;
  /**
   * 上から順の行。行の中のバーは開始の早い順で、重ならない。
   * 最後の行は常に空で、新しいバーを引く場所になる。
   */
  rows: Bar[][];
};

/**
 * ポジションごとに、バーを行へ詰める。
 * 開始の早い順に、その時間が空いている一番上の行へ置く。隣り合うバーは同じ行に並べる。
 * 開始が同じバーは、長いバーを先に置く。
 */
export const packStaffingBars = <Bar extends StaffingBar>(input: {
  bars: readonly Bar[];
  /** 行を作るポジションのID。並び順は表示順。一覧にないポジションのバーは置かない。 */
  positionIds: readonly string[];
}): PackedStaffingBars<Bar>[] =>
  input.positionIds.map((positionId) => {
    const sorted = input.bars
      .map((bar, index) => ({ bar, index, ...toMinuteRange(bar) }))
      .filter((item) => item.bar.positionId === positionId && item.start < item.end)
      .sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);

    const rows: Bar[][] = [];
    const rowEnds: number[] = [];
    for (const item of sorted) {
      const freeRow = rowEnds.findIndex((rowEnd) => rowEnd <= item.start);
      const rowIndex = freeRow === -1 ? rows.length : freeRow;
      if (freeRow === -1) rows.push([]);
      rows[rowIndex].push(item.bar);
      rowEnds[rowIndex] = item.end;
    }
    rows.push([]);
    return { positionId, rows };
  });

export type RequiredSegment = {
  start: string;
  end: string;
  /** その区間に必要な人数（重なるバーの本数） */
  count: number;
};

export type PositionRequiredSegments = {
  positionId: string;
  segments: RequiredSegment[];
};

/**
 * ポジションごとに、必要人数が変わる時刻で区切った区間を返す。同じ人数が続く区間は1つにまとめる。
 * rangeを渡すと、その内側だけを数える。
 * includeEmptyをtrueにすると0人の区間も返す。rangeがあれば範囲の端から端まで、なければ最初のバーの開始から最後のバーの終了までを埋める。
 */
export const countRequiredSegments = (input: {
  bars: readonly StaffingBar[];
  positionIds: readonly string[];
  range?: StaffingBarRange;
  includeEmpty?: boolean;
}): PositionRequiredSegments[] =>
  input.positionIds.map((positionId) => {
    const { range, includeEmpty = false } = input;
    const ranges = input.bars
      .filter((bar) => bar.positionId === positionId)
      .map(toMinuteRange)
      .map((bar) =>
        range ? { start: Math.max(bar.start, range.startMinutes), end: Math.min(bar.end, range.endMinutes) } : bar,
      )
      .filter((bar) => bar.start < bar.end);

    const points = new Set<number>(ranges.flatMap((bar) => [bar.start, bar.end]));
    if (range && includeEmpty && range.startMinutes < range.endMinutes) {
      points.add(range.startMinutes);
      points.add(range.endMinutes);
    }
    const sortedPoints = [...points].sort((a, b) => a - b);

    const merged: Array<MinuteRange & { count: number }> = [];
    for (let index = 0; index < sortedPoints.length - 1; index += 1) {
      const start = sortedPoints[index];
      const end = sortedPoints[index + 1];
      const count = ranges.filter((bar) => bar.start <= start && start < bar.end).length;
      const previous = merged.at(-1);
      if (previous && previous.count === count) previous.end = end;
      else merged.push({ start, end, count });
    }

    return {
      positionId,
      segments: merged
        .filter((segment) => includeEmpty || segment.count > 0)
        .map((segment) => ({
          start: minutesToTime(segment.start),
          end: minutesToTime(segment.end),
          count: segment.count,
        })),
    };
  });

/** 受付時間の外にかかるバーの本数。完全に外のバーと、範囲の端をまたぐバーを数える。 */
export const countBarsOutsideRange = (bars: readonly StaffingBar[], range: StaffingBarRange): number =>
  bars.filter((bar) => !isStaffingBarWithinRange(bar, range)).length;

/**
 * バーを受付時間に合わせて切りそろえる。
 * 完全に外のバーは消し、範囲の端をまたぐバーは内側へ切る。切ったあとの長さが刻みに届かないバーも消す。
 */
/**
 * 範囲の両端を、刻みに乗る内側の時刻へ寄せる。
 * 受付時間が刻みにそろっていない店舗（09:15〜20:45など）でも、バーを置ける範囲を刻みの上に保つ。
 */
export const alignStaffingBarRange = (range: StaffingBarRange, unitMinutes: number): StaffingBarRange => ({
  startMinutes: Math.ceil(range.startMinutes / unitMinutes) * unitMinutes,
  endMinutes: Math.floor(range.endMinutes / unitMinutes) * unitMinutes,
});

export const trimBarsToRange = <Bar extends StaffingBar>(input: {
  bars: readonly Bar[];
  range: StaffingBarRange;
  unitMinutes: number;
}): Bar[] => {
  // 切った端が刻みから外れると保存できないため、刻みに乗る内側の範囲へ切る。
  const range = alignStaffingBarRange(input.range, input.unitMinutes);
  return input.bars.flatMap((bar) => {
    if (isStaffingBarWithinRange(bar, range)) return [bar];
    const current = toMinuteRange(bar);
    const start = Math.max(current.start, range.startMinutes);
    const end = Math.min(current.end, range.endMinutes);
    if (end - start < input.unitMinutes) return [];
    return [{ ...bar, start: minutesToTime(start), end: minutesToTime(end) }];
  });
};
