import { minutesToTime, timeToMinutes } from "../../_lib/time";
import { getMinutesOverNoBreakSpan, getRequiredBreakMinutes } from "./breakStandard";
import {
  addAssignedAmount,
  buildSelectionContext,
  compareCandidates,
  isNewcomer,
  isUnavailable,
  pickCandidate,
  recordRequestedDay,
  type SelectionContext,
} from "./selection";
import type { AutoCreatedShift, AutoCreateInput, AutoCreateResult } from "./types";

// 時間指定の自動作成。1日ごとに、必要人数を15分のマスに直し、希望の時間の中で足りない時間を埋める。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 人数を数えるマスの長さ。休憩が15分単位のため、15分にする。 */
const CELL_MINUTES = 15;
/** 勤務の開始と終了、ポジションの境目は30分単位にそろえる。 */
const SHIFT_UNIT_CELLS = 2;
/** 勤務の最短（2時間）。希望がこれより短い日は、希望どおりの長さで入れられる場合だけ作る。 */
const MIN_SHIFT_CELLS = 8;
/** 勤務の長さの目安の下限（3時間）。まずこの長さ以上で入れ、どうしても入れられない時間だけを、最短の長さで埋める。 */
const PREFERRED_MIN_SHIFT_CELLS = 12;
/** 1つのポジションを続ける最短（1時間）。 */
const MIN_POSITION_CELLS = 4;
/**
 * 時間を分け合うときの、1つの勤務の長さの上限の下限（3時間）。分け合っても、これより細かくは刻まない。
 * 勤務の長さの目安の下限とそろえる。希望者の多い時間帯で、1人が長く入り、ほかの人が1日入れない偏りを減らすためである。
 */
const MIN_SHARE_CAP_CELLS = PREFERRED_MIN_SHIFT_CELLS;
/**
 * 希望した日に勤務が入らないことが1日続くごとに、人を選ぶ順で、今回入った量から引く長さ（3時間）。
 * 勤務時間の合計が同じでも、入れない日が続く人が出ないよう、日ごとに交代させるために置く。
 */
const UNASSIGNED_STREAK_CELLS = PREFERRED_MIN_SHIFT_CELLS;
/** 休憩を、勤務の開始と終了から離す長さ（1時間）。 */
const BREAK_MARGIN_CELLS = 4;
/** 休憩を、ポジションの違う人ともずらす範囲。休憩の中央が、勤務の中央の前後2時間に入る時刻である。 */
const BREAK_STAGGER_RANGE_CELLS = 8;
/** 休憩で足りなくなった時間を埋め直す回数。 */
const REFILL_ROUND_LIMIT = 3;
/** 勤務を縮める側を選ぶときの、そのポジションにだれもいなくなる時間の重み。不足が1人増えることより重くする。 */
const EMPTY_POSITION_PENALTY = 100;
/** 勤務を縮める側を選ぶときの、端のポジションが1時間より短く残ることの重み。ほかの理由より重くする。 */
const SHORT_POSITION_PENALTY = 10_000;

type Range = { start: number; end: number };

type DayShift = {
  staffId: string;
  /** この勤務を入れた希望の時間。勤務を伸ばすときも、この外へは出さない。 */
  window: Range;
  start: number;
  end: number;
  /** マスごとのポジション（`positions`の添字）。勤務の外は-1。 */
  cellPositions: number[];
  breakRange: Range | null;
  /** 勤務を新しく入れたか、長さを変えたため、休憩を決め直す必要がある。 */
  needsBreakPlacement: boolean;
};

type DayState = {
  /** 休憩を入れるか。入れない場合は、休憩の長さに合わせた勤務の長さの調整もしない。 */
  includesBreaks: boolean;
  /** 新しく入れる勤務の最短。はじめは目安の下限（3時間）にし、埋められなかった時間を埋めるときに最短（2時間）へ下げる。 */
  minShiftCells: number;
  cellCount: number;
  positions: readonly string[];
  /** ポジション×マスの必要人数。 */
  demand: number[][];
  /** ポジション×マスの、休憩中でない人数。 */
  work: number[][];
  /** ポジション×マスの、休憩中の人数。 */
  onBreak: number[][];
  /** その日の希望の時間。30分単位にそろえ、重なるものはまとめてある。 */
  windows: Map<string, Range[]>;
  /** スタッフごとの、担当外でないポジションの添字。 */
  skilledPositions: Map<string, number[]>;
  /** スタッフごとの、その日に入れる長さ。希望の時間のうち、担当できるポジションに必要人数があるマスの数。 */
  potentialCells: Map<string, number>;
  /** スタッフごとの、その日の取り分。15分ごとの「希望者で埋められる必要人数 ÷ その時間の希望者の数」を、入れる時間の分だけ合計したマスの数。 */
  shareCells: Map<string, number>;
  /** スタッフごとの、1つの勤務の長さの上限。希望者が多い日に、時間を分け合うために置く。上限のない人は持たない。 */
  shareCaps: Map<string, number>;
  shifts: Map<string, DayShift>;
};

const roundUpToUnit = (cell: number) => Math.ceil(cell / SHIFT_UNIT_CELLS) * SHIFT_UNIT_CELLS;
const roundDownToUnit = (cell: number) => Math.floor(cell / SHIFT_UNIT_CELLS) * SHIFT_UNIT_CELLS;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isShort(state: DayState, position: number, cell: number): boolean {
  return state.work[position][cell] < state.demand[position][cell];
}

/**
 * 足りないマスの続き`[runStart, runEnd)`を、30分単位の勤務の範囲に直す。
 * 境目が15分ずれている側は、希望の内側なら15分だけ外へ広げ（15分の余りを許す）、広げられなければ15分だけ内へ縮める。
 */
function alignRun(runStart: number, runEnd: number, window: Range): Range {
  let start = runStart;
  if (start % SHIFT_UNIT_CELLS !== 0) start = start - 1 >= window.start ? start - 1 : start + 1;
  let end = runEnd;
  if (end % SHIFT_UNIT_CELLS !== 0) end = end + 1 <= window.end ? end + 1 : end - 1;
  return { start, end };
}

/** 勤務の長さとして認められるか。`minCells`以上か、希望の時間をちょうど使い切る場合に認める。 */
function isAllowedShiftLength(range: Range, window: Range, minCells: number): boolean {
  if (range.end - range.start >= minCells) return true;
  return range.end > range.start && range.start === window.start && range.end === window.end;
}

function buildDayState(input: AutoCreateInput, date: string, boardStart: number, cellCount: number): DayState | null {
  const requirements = input.days.find((item) => item.date === date)?.requirements;
  if (requirements?.kind !== "time") return null;

  const positions = input.positionIds;
  const positionIndex = new Map(positions.map((positionId, index) => [positionId, index]));
  const demand = positions.map(() => new Array<number>(cellCount).fill(0));
  let hasDemand = false;
  for (const bar of requirements.bars) {
    const position = positionIndex.get(bar.positionId);
    if (position === undefined) continue;
    // 受付時間の外にはみ出したバーは、内側だけを数える。
    const start = Math.max(0, Math.ceil((timeToMinutes(bar.startTime) - boardStart) / CELL_MINUTES));
    const end = Math.min(cellCount, Math.floor((timeToMinutes(bar.endTime) - boardStart) / CELL_MINUTES));
    for (let cell = start; cell < end; cell += 1) {
      demand[position][cell] += 1;
      hasDemand = true;
    }
  }
  if (!hasDemand) return null;

  const staffIds = new Set(input.staffs.map((staff) => staff.id));
  const rawWindows = new Map<string, Range[]>();
  for (const request of input.requestedSlots) {
    if (request.date !== date || !staffIds.has(request.staffId)) continue;
    const start = roundUpToUnit(Math.max(0, Math.ceil((timeToMinutes(request.startTime) - boardStart) / CELL_MINUTES)));
    const end = roundDownToUnit(
      Math.min(cellCount, Math.floor((timeToMinutes(request.endTime) - boardStart) / CELL_MINUTES)),
    );
    if (end <= start) continue;
    const ranges = rawWindows.get(request.staffId) ?? [];
    ranges.push({ start, end });
    rawWindows.set(request.staffId, ranges);
  }
  const windows = new Map<string, Range[]>();
  for (const [staffId, ranges] of rawWindows) {
    const merged: Range[] = [];
    for (const range of ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end)) {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
      else merged.push({ ...range });
    }
    windows.set(staffId, merged);
  }

  return {
    includesBreaks: input.includesBreaks,
    minShiftCells: PREFERRED_MIN_SHIFT_CELLS,
    cellCount,
    positions,
    demand,
    work: positions.map(() => new Array<number>(cellCount).fill(0)),
    onBreak: positions.map(() => new Array<number>(cellCount).fill(0)),
    windows,
    skilledPositions: new Map(),
    potentialCells: new Map(),
    shareCells: new Map(),
    shareCaps: new Map(),
    shifts: new Map(),
  };
}

/**
 * その日に入れる長さ、その日の取り分、1つの勤務の長さの上限を決める。
 * 取り分は、マスごとの「希望者で埋められる必要人数 ÷ そのマスの希望者の数」（1を超えるマスは1）を、入れる時間の分だけ合計した値である。
 * 上限は、次の2つの短いほうにする。
 * - 希望者の入れる長さの合計が、必要な長さの合計より多い日に、必要な長さを希望者で均等に分けた長さ。
 *   入れる長さが短い人は、その長さまでを先に割り当て、残りをほかの人で分ける。30分単位に切り上げる。
 * - その人の取り分。30分単位に切り捨てる。希望者の多い時間帯だけを希望した人が、1日入れないままになる偏りを減らすためである。
 * 上限は3時間より短くはしない。6時間を少し超える長さになる場合は、6時間にする。
 */
function computeShareCaps(state: DayState, context: SelectionContext): void {
  const { cellCount } = state;
  const coverCount = state.positions.map(() => new Array<number>(cellCount).fill(0));
  // マスごとの、その時間に入れる希望者の数。
  const candidateCount = new Array<number>(cellCount).fill(0);
  const potentialCellsOf = new Map<string, number[]>();
  for (const [staffId, windows] of state.windows) {
    const skilled = getSkilledPositions(state, context, staffId);
    const cells: number[] = [];
    for (const window of windows) {
      for (let cell = window.start; cell < window.end; cell += 1) {
        let hasDemand = false;
        for (const position of skilled) {
          if (state.demand[position][cell] === 0) continue;
          coverCount[position][cell] += 1;
          hasDemand = true;
        }
        if (hasDemand) {
          cells.push(cell);
          candidateCount[cell] += 1;
        }
      }
    }
    potentialCellsOf.set(staffId, cells);
    state.potentialCells.set(staffId, cells.length);
  }

  // 希望者で埋められる必要人数の合計。だれも入れない時間の必要人数は、分け合う対象に入れない。
  let remaining = 0;
  state.demand.forEach((cells, position) => {
    cells.forEach((demand, cell) => {
      remaining += Math.min(demand, coverCount[position][cell]);
    });
  });

  const potentials = [...state.potentialCells.entries()]
    .filter(([, potential]) => potential > 0)
    .sort((a, b) => a[1] - b[1] || compareText(a[0], b[0]));
  let share = Number.POSITIVE_INFINITY;
  potentials.some(([, potential], index) => {
    const even = remaining / (potentials.length - index);
    if (potential <= even) {
      remaining -= potential;
      return false;
    }
    share = even;
    return true;
  });

  // 6時間を少し超える長さを避けて、上限を決める。3時間より短くはしない。
  const toCap = (cells: number) => {
    const cap = Math.max(MIN_SHARE_CAP_CELLS, cells);
    return state.includesBreaks ? cap - getCellsOverNoBreakSpan(cap) : cap;
  };
  // マスごとの、希望者で埋められる必要人数。
  const fillableDemand = Array.from({ length: cellCount }, (_, cell) =>
    state.positions.reduce(
      (sum, _position, position) => sum + Math.min(state.demand[position][cell], coverCount[position][cell]),
      0,
    ),
  );
  const dayCap = Number.isFinite(share) ? toCap(roundUpToUnit(Math.ceil(share))) : Number.POSITIVE_INFINITY;
  for (const [staffId, potential] of potentials) {
    // 希望者の多い時間帯だけを希望した人ほど、取り分は短くなる。
    // 取り分を数えるマスは、希望者にその人自身を含むため、希望者の数は1以上である。
    let localShare = 0;
    for (const cell of potentialCellsOf.get(staffId) ?? []) {
      localShare += Math.min(1, fillableDemand[cell] / candidateCount[cell]);
    }
    state.shareCells.set(staffId, localShare);
    // 時間帯の取り分は切り捨てる。切り上げると、希望者の多い時間帯で1人の勤務が長くなり、入れない人が増える。
    const cap = Math.min(dayCap, toCap(roundDownToUnit(Math.floor(localShare))));
    if (potential > cap) state.shareCaps.set(staffId, cap);
  }
}

/**
 * 勤務の範囲が上限より長い場合に、決めたいマスを含む、上限の長さの範囲へ縮める。
 * 縮めて前か後ろに時間を残す場合は、その側に残る足りない時間の続きが3時間以上になる位置だけを選ぶ。
 * 残りが3時間に満たないと、ほかの人の勤務として短すぎるためである。そのような位置がない場合は、縮めずにそのまま返す。
 * 残りの長さは、`shortRun`（その人の希望の時間に限らない、足りない時間の続き）で数える。
 * その人の希望の外に続く時間も、ほかの人が残りとつないで入れるためである。
 * 位置が複数ある場合は、希望者の少ないマスへ寄せる。マスごとの`scarcityAt`（1 ÷ そのマスに入れる、まだ勤務のない人の数）の合計がいちばん大きい所である。
 * その人にしか埋められない時間を削らず、希望者の多い時間を、その時間にしか入れない人へ残すためである。
 * 同じなら、早い時刻から取る。
 */
function limitToShareCap(
  range: Range,
  cell: number,
  cap: number | undefined,
  shortRun: Range,
  scarcityAt: (cell: number) => number,
): Range {
  if (cap === undefined || range.end - range.start <= cap) return range;
  // `left`は縮めてその側に残す長さ、`rest`はその側に残る足りない時間の続きの長さである。
  const isUsableRest = (left: number, rest: number) => left <= 0 || Math.max(left, rest) >= MIN_SHARE_CAP_CELLS;
  const firstStart = Math.max(range.start, roundUpToUnit(cell - cap + 1));
  const lastStart = Math.min(roundDownToUnit(cell), range.end - cap);
  let best: { start: number; score: number } | null = null;
  for (let start = firstStart; start <= lastStart; start += SHIFT_UNIT_CELLS) {
    const end = start + cap;
    if (!isUsableRest(start - range.start, start - shortRun.start)) continue;
    if (!isUsableRest(range.end - end, shortRun.end - end)) continue;
    let score = 0;
    for (let index = start; index < end; index += 1) score += scarcityAt(index);
    if (!best || score > best.score) best = { start, score };
  }
  // 残りが短くなる位置しかない場合は1人が続けて入り、だれが入るかは、期間を通した勤務時間の公平で日ごとに替わる。
  return best ? { start: best.start, end: best.start + cap } : range;
}

function getSkilledPositions(state: DayState, context: SelectionContext, staffId: string): number[] {
  const cached = state.skilledPositions.get(staffId);
  if (cached) return cached;
  const skilled = state.positions
    .map((positionId, index) => (isUnavailable(context, staffId, positionId) ? -1 : index))
    .filter((index) => index >= 0);
  state.skilledPositions.set(staffId, skilled);
  return skilled;
}

function listFreeStaff(state: DayState): string[] {
  return [...state.windows.keys()].filter((staffId) => !state.shifts.has(staffId)).sort(compareText);
}

function addShift(
  state: DayState,
  context: SelectionContext,
  staffId: string,
  window: Range,
  range: Range,
  positionAt: (cell: number) => number,
): void {
  const cellPositions = new Array<number>(state.cellCount).fill(-1);
  for (let cell = range.start; cell < range.end; cell += 1) {
    const position = positionAt(cell);
    cellPositions[cell] = position;
    state.work[position][cell] += 1;
  }
  state.shifts.set(staffId, {
    staffId,
    window,
    start: range.start,
    end: range.end,
    cellPositions,
    breakRange: null,
    needsBreakPlacement: true,
  });
  addAssignedAmount(context, staffId, range.end - range.start);
}

/** そのマスの勤務に、そのポジションで見習いでない人がいるか。`exceptStaffId`の人は数えない。休憩中の人も数えない。 */
function hasNonNewcomerAt(
  state: DayState,
  context: SelectionContext,
  position: number,
  cell: number,
  exceptStaffId?: string,
): boolean {
  for (const shift of state.shifts.values()) {
    if (shift.staffId === exceptStaffId || shift.cellPositions[cell] !== position) continue;
    if (shift.breakRange && shift.breakRange.start <= cell && cell < shift.breakRange.end) continue;
    if (!isNewcomer(context, shift.staffId, state.positions[position])) return true;
  }
  return false;
}

/**
 * まだ勤務のない希望者を、足りない時間へ入れる。1人の勤務は、1つのポジションの続いた時間にする。
 * 候補の人数を不足の人数で割った値が小さいマスから決める。
 */
function fillWithFreeStaff(state: DayState, context: SelectionContext): boolean {
  const { cellCount } = state;
  const positionCount = state.positions.length;
  const free = new Set(listFreeStaff(state));
  // ポジション×マスごとの、まだ勤務がなく、そのマスを希望していて、担当外でない人の数。
  const candidateCount = state.positions.map(() => new Array<number>(cellCount).fill(0));
  const adjustCandidateCount = (staffId: string, delta: number) => {
    for (const window of state.windows.get(staffId) ?? []) {
      for (const position of getSkilledPositions(state, context, staffId)) {
        for (let cell = window.start; cell < window.end; cell += 1) candidateCount[position][cell] += delta;
      }
    }
  };
  for (const staffId of free) adjustCandidateCount(staffId, 1);

  const unfillable = state.positions.map(() => new Array<boolean>(cellCount).fill(false));
  let changed = false;

  for (;;) {
    let target: { position: number; cell: number; count: number; shortfall: number; isEmpty: boolean } | null = null;
    for (let position = 0; position < positionCount; position += 1) {
      for (let cell = 0; cell < cellCount; cell += 1) {
        if (unfillable[position][cell] || !isShort(state, position, cell)) continue;
        const count = candidateCount[position][cell];
        if (count === 0) {
          unfillable[position][cell] = true;
          continue;
        }
        const shortfall = state.demand[position][cell] - state.work[position][cell];
        const isEmpty = state.work[position][cell] === 0;
        // だれもいないマスを、すでに人のいるマスより先に選ぶ。必要人数の多いポジションに人が集まり、ほかのポジションが0人のまま残ることを防ぐためである。
        // その中では、候補の人数 ÷ 不足の人数が小さいマスを選ぶ。同じなら、候補の少ないマス、早い時刻、並びが先のポジションの順にする。
        // 候補の少ないマスを先にするのは、その時間に入れる人が、ほかの時間で先に使われるのを防ぐためである。
        const scarcity: number = target ? count * target.shortfall - target.count * shortfall : -1;
        if (
          !target ||
          scarcity < 0 ||
          (scarcity === 0 &&
            (isEmpty !== target.isEmpty
              ? isEmpty
              : count < target.count || (count === target.count && cell < target.cell)))
        ) {
          target = { position, cell, count, shortfall, isEmpty };
        }
      }
    }
    if (!target) break;

    const { position, cell } = target;
    // そのマスを含む、足りない時間の続き。希望の時間に限らない。
    const shortRun = { start: cell, end: cell + 1 };
    while (shortRun.start - 1 >= 0 && isShort(state, position, shortRun.start - 1)) shortRun.start -= 1;
    while (shortRun.end < cellCount && isShort(state, position, shortRun.end)) shortRun.end += 1;
    const blocks = new Map<string, { window: Range; range: Range }>();
    for (const staffId of free) {
      if (!getSkilledPositions(state, context, staffId).includes(position)) continue;
      const window = (state.windows.get(staffId) ?? []).find((item) => item.start <= cell && cell < item.end);
      if (!window) continue;
      let runStart = cell;
      while (runStart - 1 >= window.start && isShort(state, position, runStart - 1)) runStart -= 1;
      let runEnd = cell + 1;
      while (runEnd < window.end && isShort(state, position, runEnd)) runEnd += 1;
      const aligned = alignRun(runStart, runEnd, window);
      if (aligned.start > cell || cell >= aligned.end) continue;
      const range = limitToShareCap(
        aligned,
        cell,
        state.shareCaps.get(staffId),
        shortRun,
        (index) => 1 / Math.max(1, candidateCount[position][index]),
      );
      if (!isAllowedShiftLength(range, window, state.minShiftCells)) continue;
      blocks.set(staffId, { window, range });
    }
    const picked = pickCandidate(context, state.positions[position], [...blocks.keys()].sort(compareText), {
      prefersNonNewcomer: !hasNonNewcomerAt(state, context, position, cell),
    });
    const block = picked ? blocks.get(picked) : undefined;
    if (!picked || !block) {
      unfillable[position][cell] = true;
      continue;
    }

    addShift(state, context, picked, block.window, block.range, () => position);
    free.delete(picked);
    adjustCandidateCount(picked, -1);
    changed = true;
  }
  return changed;
}

type Extension = { range: Range; position: number };

/**
 * `edge`から右へ続く、足りない時間を探す。`previousPosition`と違うポジションは1時間以上、同じポジションは30分以上続く場合だけ返す。
 * いちばん長く続くポジションを選ぶ。
 */
function findRightExtension(
  state: DayState,
  skilled: readonly number[],
  window: Range,
  edge: number,
  previousPosition: number,
): Extension | null {
  let best: Extension | null = null;
  for (const position of skilled) {
    let runEnd = edge;
    while (runEnd < window.end && isShort(state, position, runEnd)) runEnd += 1;
    if (runEnd === edge) continue;
    const end = runEnd % SHIFT_UNIT_CELLS === 0 ? runEnd : runEnd + 1 <= window.end ? runEnd + 1 : runEnd - 1;
    const length = end - edge;
    if (length < (position === previousPosition ? SHIFT_UNIT_CELLS : MIN_POSITION_CELLS)) continue;
    if (!best || length > best.range.end - best.range.start) best = { range: { start: edge, end }, position };
  }
  return best;
}

/** `edge`から左へ続く、足りない時間を探す。条件は`findRightExtension`と同じである。 */
function findLeftExtension(
  state: DayState,
  skilled: readonly number[],
  window: Range,
  edge: number,
  nextPosition: number,
): Extension | null {
  let best: Extension | null = null;
  for (const position of skilled) {
    let runStart = edge;
    while (runStart - 1 >= window.start && isShort(state, position, runStart - 1)) runStart -= 1;
    if (runStart === edge) continue;
    const start =
      runStart % SHIFT_UNIT_CELLS === 0 ? runStart : runStart - 1 >= window.start ? runStart - 1 : runStart + 1;
    const length = edge - start;
    if (length < (position === nextPosition ? SHIFT_UNIT_CELLS : MIN_POSITION_CELLS)) continue;
    if (!best || length > best.range.end - best.range.start) best = { range: { start, end: edge }, position };
  }
  return best;
}

/**
 * まだ勤務のない希望者へ、複数のポジションをつないだ勤務を入れる。
 * 1つのポジションだけでは2時間に届かない足りない時間を、隣り合う別のポジションの足りない時間とつなぐ。
 */
function composeForFreeStaff(state: DayState, context: SelectionContext): boolean {
  let changed = false;
  const free = listFreeStaff(state).sort((a, b) => compareCandidates(context, "", a, b));
  for (const staffId of free) {
    const skilled = getSkilledPositions(state, context, staffId);
    let best: { window: Range; range: Range; cellPositions: Map<number, number> } | null = null;
    for (const window of state.windows.get(staffId) ?? []) {
      for (const position of skilled) {
        let cell = window.start;
        while (cell < window.end) {
          if (!isShort(state, position, cell)) {
            cell += 1;
            continue;
          }
          let runEnd = cell;
          while (runEnd < window.end && isShort(state, position, runEnd)) runEnd += 1;
          const seed = alignRun(cell, runEnd, window);
          cell = runEnd;
          if (seed.end - seed.start < MIN_POSITION_CELLS) continue;

          const cellPositions = new Map<number, number>();
          const paint = (extension: Extension) => {
            for (let index = extension.range.start; index < extension.range.end; index += 1) {
              cellPositions.set(index, extension.position);
            }
          };
          paint({ range: seed, position });
          const range = { ...seed };
          for (;;) {
            const right = findRightExtension(state, skilled, window, range.end, cellPositions.get(range.end - 1) ?? -1);
            if (!right) break;
            paint(right);
            range.end = right.range.end;
          }
          for (;;) {
            const left = findLeftExtension(state, skilled, window, range.start, cellPositions.get(range.start) ?? -1);
            if (!left) break;
            paint(left);
            range.start = left.range.start;
          }
          if (!isAllowedShiftLength(range, window, state.minShiftCells)) continue;
          if (
            !best ||
            range.end - range.start > best.range.end - best.range.start ||
            (range.end - range.start === best.range.end - best.range.start && range.start < best.range.start)
          ) {
            best = { window, range, cellPositions };
          }
        }
      }
    }
    if (!best) continue;
    const { cellPositions } = best;
    addShift(state, context, staffId, best.window, best.range, (cell) => cellPositions.get(cell) ?? -1);
    changed = true;
  }
  return changed;
}

/** 6時間を超えて6時間45分より短い勤務で、6時間を超えているマスの数。それ以外の勤務は0。 */
function getCellsOverNoBreakSpan(spanCells: number): number {
  return Math.ceil(getMinutesOverNoBreakSpan(spanCells * CELL_MINUTES) / CELL_MINUTES);
}

/**
 * 伸ばした勤務が6時間を少し超える長さになる場合に、伸ばす長さを6時間までに抑える。
 * 抑えると伸ばす長さが足りなくなる場合（別のポジションは1時間、同じポジションは30分に届かない）は、nullを返す。
 */
function limitExtension(
  extension: Extension,
  side: "right" | "left",
  spanCells: number,
  adjacentPosition: number,
): Extension | null {
  const length = extension.range.end - extension.range.start;
  const limited = length - getCellsOverNoBreakSpan(spanCells + length);
  if (limited === length) return extension;
  if (limited < (extension.position === adjacentPosition ? SHIFT_UNIT_CELLS : MIN_POSITION_CELLS)) return null;
  return side === "right"
    ? { ...extension, range: { start: extension.range.start, end: extension.range.start + limited } }
    : { ...extension, range: { start: extension.range.end - limited, end: extension.range.end } };
}

/**
 * 6時間を少し超える勤務（6時間を超えて6時間45分より短い勤務）を、6時間に縮める。
 * 休憩を入れて調整せず、早く上がるか、遅く入る形にする。
 * 縮める側は、そのポジションにだれもいない時間を作らないほう、足りない人数が増えないほうを選ぶ。同じなら、早く上がる形にする。
 */
function trimShiftsJustOverNoBreakSpan(state: DayState, context: SelectionContext): void {
  for (const shift of state.shifts.values()) {
    if (!shift.needsBreakPlacement) continue;
    const overage = getCellsOverNoBreakSpan(shift.end - shift.start);
    if (overage === 0) continue;
    removeBreak(state, shift);

    const costOf = (from: number, to: number, edgeCell: number, step: 1 | -1): number => {
      let cost = 0;
      for (let cell = from; cell < to; cell += 1) {
        const position = shift.cellPositions[cell];
        const remaining = state.work[position][cell] - 1;
        cost += Math.max(0, state.demand[position][cell] - remaining);
        if (remaining === 0) cost += EMPTY_POSITION_PENALTY;
      }
      // 端のポジションが続く長さ。縮めたあとに1時間より短く残る場合は、その側を避ける。
      let edgeLength = 0;
      for (
        let cell = edgeCell;
        cell >= shift.start && cell < shift.end && shift.cellPositions[cell] === shift.cellPositions[edgeCell];
        cell += step
      ) {
        edgeLength += 1;
      }
      const rest = edgeLength - overage;
      if (rest > 0 && rest < MIN_POSITION_CELLS) cost += SHORT_POSITION_PENALTY;
      return cost;
    };
    const leaveEarlyCost = costOf(shift.end - overage, shift.end, shift.end - 1, -1);
    const startLateCost = costOf(shift.start, shift.start + overage, shift.start, 1);
    const trimmed =
      startLateCost < leaveEarlyCost
        ? { start: shift.start, end: shift.start + overage }
        : { start: shift.end - overage, end: shift.end };

    for (let cell = trimmed.start; cell < trimmed.end; cell += 1) {
      state.work[shift.cellPositions[cell]][cell] -= 1;
      shift.cellPositions[cell] = -1;
    }
    if (trimmed.start === shift.start) shift.start = trimmed.end;
    else shift.end = trimmed.start;
    addAssignedAmount(context, shift.staffId, -overage);
  }
}

/**
 * 勤務のある人の勤務を、希望の範囲で、隣り合う足りない時間へ伸ばす。
 * `allowsLongerBreak`がfalseのときは、伸ばすと休憩が長くなる勤務を伸ばさない。休憩の穴を埋めるために、別の穴を作らないためである。
 */
function extendShifts(state: DayState, context: SelectionContext, options: { allowsLongerBreak: boolean }): boolean {
  let changed = false;
  // その日の取り分に対して勤務が短い人から伸ばす。同じ足りない時間を2人が伸ばせる場合に、短い人へ回すためである。
  const lackOf = (shift: DayShift) => shift.end - shift.start - (state.shareCells.get(shift.staffId) ?? 0);
  const shifts = [...state.shifts.values()].sort(
    (a, b) => lackOf(a) - lackOf(b) || a.start - b.start || compareText(a.staffId, b.staffId),
  );
  for (const shift of shifts) {
    const skilled = getSkilledPositions(state, context, shift.staffId);
    for (;;) {
      const right = findRightExtension(state, skilled, shift.window, shift.end, shift.cellPositions[shift.end - 1]);
      const left = findLeftExtension(state, skilled, shift.window, shift.start, shift.cellPositions[shift.start]);
      const span = shift.end - shift.start;
      const candidates = [
        // 休憩を入れない場合は、6時間を少し超える長さを避ける必要がない。
        right &&
          (state.includesBreaks ? limitExtension(right, "right", span, shift.cellPositions[shift.end - 1]) : right),
        left && (state.includesBreaks ? limitExtension(left, "left", span, shift.cellPositions[shift.start]) : left),
      ].filter((item): item is Extension => {
        if (!item) return false;
        if (options.allowsLongerBreak) return true;
        const extended = span + (item.range.end - item.range.start);
        return getRequiredBreakMinutes(extended * CELL_MINUTES) <= getRequiredBreakMinutes(span * CELL_MINUTES);
      });
      if (candidates.length === 0) break;
      const extension = candidates.reduce((best, item) =>
        item.range.end - item.range.start > best.range.end - best.range.start ? item : best,
      );
      for (let cell = extension.range.start; cell < extension.range.end; cell += 1) {
        shift.cellPositions[cell] = extension.position;
        state.work[extension.position][cell] += 1;
      }
      shift.start = Math.min(shift.start, extension.range.start);
      shift.end = Math.max(shift.end, extension.range.end);
      shift.needsBreakPlacement = true;
      addAssignedAmount(context, shift.staffId, extension.range.end - extension.range.start);
      changed = true;
    }
  }
  return changed;
}

/** 勤務の中で、同じポジションが続く区間の数。1時間に満たない区間がある場合は0を返す。 */
function countUsablePositionRuns(shift: DayShift, cellPositions: readonly number[]): number {
  let count = 0;
  let runStart = shift.start;
  for (let cell = shift.start + 1; cell <= shift.end; cell += 1) {
    if (cell < shift.end && cellPositions[cell] === cellPositions[runStart]) continue;
    if (cell - runStart < MIN_POSITION_CELLS) return 0;
    count += 1;
    runStart = cell;
  }
  return count;
}

/**
 * だれもいないポジションへ、同じ時間に2人以上いるポジションから、担当できる人を移す。
 * 勤務の始まりと終わりは変えず、ポジションだけを変えるため、勤務時間の合計と、だれが入るかは変わらない。
 * 移す範囲は30分単位で、移したあとも、勤務の中の各ポジションが1時間以上続く範囲に限る。
 * 元のポジションには、休憩中でない人を必ず1人以上残す。休憩を入れたあとは、休憩で人がいなくなった時間も同じように埋める。
 * 移せる範囲が複数ある場合は、いちばん長い範囲を選ぶ。同じなら、移した先と元のポジションで見習いだけになる時間の短い人、
 * 勤務の中でポジションの替わる回数が少ない人、早い時刻、並びが先のポジション、スタッフのIDの順にする。
 */
function rebalanceEmptyPositions(state: DayState, context: SelectionContext): void {
  for (;;) {
    let best: { shift: DayShift; position: number; range: Range; newcomerOnlyCells: number; runCount: number } | null =
      null;
    for (let position = 0; position < state.positions.length; position += 1) {
      const isEmptyAt = (cell: number) => state.demand[position][cell] > 0 && state.work[position][cell] === 0;
      for (const shift of state.shifts.values()) {
        if (!getSkilledPositions(state, context, shift.staffId).includes(position)) continue;
        const { breakRange } = shift;
        const isMovableAt = (cell: number) => {
          // 休憩中のマスは、移しても働く人が増えないため、移す範囲に入れない。
          if (breakRange && breakRange.start <= cell && cell < breakRange.end) return false;
          const current = shift.cellPositions[cell];
          return current !== position && isEmptyAt(cell) && state.work[current][cell] >= 2;
        };
        for (let start = shift.start; start < shift.end; start += SHIFT_UNIT_CELLS) {
          for (let end = start; end < shift.end && isMovableAt(end); end += 1) {
            const length = end + 1 - start;
            if ((end + 1) % SHIFT_UNIT_CELLS !== 0 || length < MIN_POSITION_CELLS) continue;
            if (best && length < best.range.end - best.range.start) continue;
            const cellPositions = shift.cellPositions.slice();
            for (let cell = start; cell <= end; cell += 1) cellPositions[cell] = position;
            const runCount = countUsablePositionRuns(shift, cellPositions);
            if (runCount === 0) continue;
            // 移した先と元のポジションで、働く人が見習いだけになるマスの数。
            let newcomerOnlyCells = isNewcomer(context, shift.staffId, state.positions[position]) ? length : 0;
            for (let cell = start; cell <= end; cell += 1) {
              const current = shift.cellPositions[cell];
              if (isNewcomer(context, shift.staffId, state.positions[current])) continue;
              if (!hasNonNewcomerAt(state, context, current, cell, shift.staffId)) newcomerOnlyCells += 1;
            }
            const candidate = { shift, position, range: { start, end: end + 1 }, newcomerOnlyCells, runCount };
            const order: number = best
              ? best.range.end - best.range.start - length ||
                candidate.newcomerOnlyCells - best.newcomerOnlyCells ||
                candidate.runCount - best.runCount ||
                start - best.range.start ||
                position - best.position ||
                compareText(shift.staffId, best.shift.staffId)
              : -1;
            if (order < 0) best = candidate;
          }
        }
      }
    }
    if (!best) break;
    for (let cell = best.range.start; cell < best.range.end; cell += 1) {
      state.work[best.shift.cellPositions[cell]][cell] -= 1;
      state.work[best.position][cell] += 1;
      best.shift.cellPositions[cell] = best.position;
    }
  }
}

function removeBreak(state: DayState, shift: DayShift): void {
  if (!shift.breakRange) return;
  for (let cell = shift.breakRange.start; cell < shift.breakRange.end; cell += 1) {
    const position = shift.cellPositions[cell];
    state.work[position][cell] += 1;
    state.onBreak[position][cell] -= 1;
  }
  shift.breakRange = null;
}

/** 休憩を置く時刻の候補。人数はどれも、休憩の間でいちばん大きい値である。 */
type BreakCandidate = {
  start: number;
  /** 同じポジションで同時に休憩している人数。 */
  samePositionOverlap: number;
  /** 休憩の中央が、勤務の中央の前後2時間より外にある。 */
  isFarFromCenter: boolean;
  /** 休憩の間に、そのポジションで働く人がだれもいなくなるマスの数。休憩を入れたあとの見直しでだけ比べる。 */
  emptiedCells: number;
  /** ポジションを問わず、同時に休憩している人数。 */
  overlap: number;
  /** 勤務の中央と、休憩の中央の離れ具合。マスの半分を1とする。 */
  distance: number;
  /** 休憩したあとの不足の人数。 */
  deficit: number;
};

/** 休憩を置く時刻の候補を比べ、先に選ぶほうを負の値で返す。同じなら、早い時刻を先にする。 */
function compareBreakCandidates(a: BreakCandidate, b: BreakCandidate): number {
  return (
    a.samePositionOverlap - b.samePositionOverlap ||
    Number(a.isFarFromCenter) - Number(b.isFarFromCenter) ||
    a.overlap - b.overlap ||
    a.distance - b.distance ||
    a.deficit - b.deficit ||
    a.start - b.start
  );
}

/**
 * 休憩を決め直す必要のある勤務へ、休憩を入れる。休憩を順番に取る形にし、休憩のために、ある時間だけ人数が大きく減ることを防ぐ。
 * 次の順で時刻を選ぶ。
 * 1. 同じポジションの人と、同時に休憩する人数がいちばん少ない時刻。
 * 2. 休憩の中央が、勤務の中央の前後2時間に入る時刻。
 * 3. ポジションの違う人も含めて、同時に休憩する人数がいちばん少ない時刻。
 * 4. 勤務の中央にいちばん近い時刻。
 * ポジションの違う人とは、勤務の中央の前後2時間の中でずらす。その範囲に収まらない人数のときは、重ねて中央の近くに置く。
 * 人数がもともと足りない時間帯でも、同じ決め方をする。
 */
function placeBreaks(state: DayState): void {
  const shifts = [...state.shifts.values()]
    .filter((shift) => shift.needsBreakPlacement)
    .sort((a, b) => a.start - b.start || compareText(a.staffId, b.staffId));
  for (const shift of shifts) {
    removeBreak(state, shift);
    shift.needsBreakPlacement = false;
    const best = listBreakCandidates(state, shift).reduce<BreakCandidate | null>(
      (picked, candidate) => (!picked || compareBreakCandidates(candidate, picked) < 0 ? candidate : picked),
      null,
    );
    if (best) setBreak(state, shift, best.start);
  }
}

/** 休憩の長さ（マスの数）。休憩の要らない勤務は0。 */
function getBreakCells(shift: DayShift): number {
  return Math.ceil(getRequiredBreakMinutes((shift.end - shift.start) * CELL_MINUTES) / CELL_MINUTES);
}

/** 休憩の入っていない勤務について、休憩を置ける時刻の候補を、早い順に返す。 */
function listBreakCandidates(state: DayState, shift: DayShift): BreakCandidate[] {
  const span = shift.end - shift.start;
  const length = getBreakCells(shift);
  if (length === 0) return [];

  // 勤務の開始と終了から1時間離せない短い勤務では、15分だけ離す。休憩は勤務の頭とお尻に接して置けない。
  const margin = span >= length + BREAK_MARGIN_CELLS * 2 ? BREAK_MARGIN_CELLS : 1;
  const candidates: BreakCandidate[] = [];
  for (let start = shift.start + margin; start + length <= shift.end - margin; start += 1) {
    // 人数はどれも、休憩の間でいちばん大きい値を見る。
    let samePositionOverlap = 0;
    let overlap = 0;
    let deficit = 0;
    let emptiedCells = 0;
    for (let cell = start; cell < start + length; cell += 1) {
      const position = shift.cellPositions[cell];
      samePositionOverlap = Math.max(samePositionOverlap, state.onBreak[position][cell]);
      overlap = Math.max(
        overlap,
        state.onBreak.reduce((total, cells) => total + cells[cell], 0),
      );
      deficit = Math.max(deficit, state.demand[position][cell] - (state.work[position][cell] - 1));
      if (state.demand[position][cell] > 0 && state.work[position][cell] === 1) emptiedCells += 1;
    }
    const distance = Math.abs(start * 2 + length - (shift.start + shift.end));
    candidates.push({
      start,
      samePositionOverlap,
      isFarFromCenter: distance > BREAK_STAGGER_RANGE_CELLS * 2,
      emptiedCells,
      overlap,
      distance,
      deficit,
    });
  }
  return candidates;
}

function setBreak(state: DayState, shift: DayShift, start: number): void {
  const end = start + getBreakCells(shift);
  shift.breakRange = { start, end };
  for (let cell = start; cell < end; cell += 1) {
    const position = shift.cellPositions[cell];
    state.work[position][cell] -= 1;
    state.onBreak[position][cell] += 1;
  }
}

/**
 * 休憩の間、そのポジションで働く人がだれもいなくなる勤務の休憩を、ほかの人がいる時刻へ動かす。
 * 勤務を伸ばすか、人を入れて埋め直したあとにも、だれもいない時間が残る休憩だけを対象にする。
 * 動かす先は、休憩の中央が勤務の中央の前後2時間に入る時刻に限り、だれもいなくなる時間がいちばん短い時刻にする。
 * だれもいなくなる時間が短くならない場合は、動かさない。
 */
function moveBreaksOffEmptyPositions(state: DayState): void {
  const shifts = [...state.shifts.values()].sort((a, b) => a.start - b.start || compareText(a.staffId, b.staffId));
  for (const shift of shifts) {
    const current = shift.breakRange;
    if (!current) continue;
    removeBreak(state, shift);
    const candidates = listBreakCandidates(state, shift);
    const currentCandidate = candidates.find((candidate) => candidate.start === current.start);
    const best = candidates
      .filter((candidate) => !candidate.isFarFromCenter)
      .reduce<BreakCandidate | null>(
        (picked, candidate) =>
          !picked || (candidate.emptiedCells - picked.emptiedCells || compareBreakCandidates(candidate, picked)) < 0
            ? candidate
            : picked,
        null,
      );
    const isBetter = best && currentCandidate && best.emptiedCells < currentCandidate.emptiedCells;
    setBreak(state, shift, best && isBetter ? best.start : current.start);
  }
}

function toCreatedShifts(state: DayState, date: string, boardStart: number): AutoCreatedShift[] {
  const toTime = (cell: number) => minutesToTime(boardStart + cell * CELL_MINUTES);
  return [...state.shifts.values()]
    .sort((a, b) => compareText(a.staffId, b.staffId))
    .map((shift) => {
      const segments: AutoCreatedShift["segments"] = [];
      let segmentStart = shift.start;
      for (let cell = shift.start + 1; cell <= shift.end; cell += 1) {
        if (cell < shift.end && shift.cellPositions[cell] === shift.cellPositions[segmentStart]) continue;
        segments.push({
          startTime: toTime(segmentStart),
          endTime: toTime(cell),
          positionId: state.positions[shift.cellPositions[segmentStart]],
        });
        segmentStart = cell;
      }
      return {
        staffId: shift.staffId,
        date,
        segments,
        breaks: shift.breakRange
          ? [{ startTime: toTime(shift.breakRange.start), endTime: toTime(shift.breakRange.end) }]
          : [],
      };
    });
}

/**
 * 時間指定の勤務を作る。
 * 1つのポジションの勤務を入れ、複数のポジションをつなぎ、勤務を伸ばしてから、だれもいないポジションへ人を移し、休憩を入れる。
 * 休憩で足りなくなった時間は、勤務を伸ばすか、まだ勤務のない希望者を入れて埋め直す。
 * それでも休憩の間だれもいないポジションが残る場合は、休憩を動かすか、人を移す。
 */
export function buildTimeAssignments(input: AutoCreateInput): AutoCreateResult {
  if (input.pattern.kind !== "time")
    return { shifts: [], hasShortage: false, skippedDates: input.dates.slice().sort() };

  const boardStart = timeToMinutes(input.pattern.startTime);
  const cellCount = roundDownToUnit(Math.floor((timeToMinutes(input.pattern.endTime) - boardStart) / CELL_MINUTES));
  const dates = [...new Set(input.dates)].sort();
  const states = new Map<string, DayState>();
  const skippedDates: string[] = [];
  for (const date of dates) {
    const state = cellCount > 0 ? buildDayState(input, date, boardStart, cellCount) : null;
    if (state) states.set(date, state);
    else skippedDates.push(date);
  }

  // 担当外かどうかは入力だけで決まるため、取り分を数える前に、量が空の文脈で上限を決める。
  // 人を選ぶ順の目安は、希望した長さではなく、取り分から作る。希望者の多い時間帯だけを希望した人の目安を、入れる見込みに合わせるためである。
  const skills = buildSelectionContext({
    staffs: input.staffs,
    requestedAmounts: new Map(),
    history: null,
    periodStart: input.periodStart,
  });
  const requestedAmounts = new Map<string, number>();
  for (const state of states.values()) {
    computeShareCaps(state, skills);
    for (const [staffId, share] of state.shareCells) {
      requestedAmounts.set(staffId, (requestedAmounts.get(staffId) ?? 0) + share);
    }
  }
  const context = buildSelectionContext({
    staffs: input.staffs,
    requestedAmounts,
    unassignedStreakAmount: UNASSIGNED_STREAK_CELLS,
    history: input.history,
    periodStart: input.periodStart,
  });

  const shifts: AutoCreatedShift[] = [];
  let hasShortage = false;
  for (const [date, state] of states) {
    // まず、3時間以上の勤務だけで埋める。
    fillWithFreeStaff(state, context);
    composeForFreeStaff(state, context);
    extendShifts(state, context, { allowsLongerBreak: true });
    // 3時間以上では埋められなかった時間だけを、2時間以上の勤務で埋める。
    state.minShiftCells = MIN_SHIFT_CELLS;
    fillWithFreeStaff(state, context);
    composeForFreeStaff(state, context);
    extendShifts(state, context, { allowsLongerBreak: true });
    rebalanceEmptyPositions(state, context);
    if (input.includesBreaks) {
      trimShiftsJustOverNoBreakSpan(state, context);
      placeBreaks(state);
      for (let round = 0; round < REFILL_ROUND_LIMIT; round += 1) {
        const extended = extendShifts(state, context, { allowsLongerBreak: false });
        const filled = fillWithFreeStaff(state, context);
        if (!extended && !filled) break;
        trimShiftsJustOverNoBreakSpan(state, context);
        placeBreaks(state);
      }
      moveBreaksOffEmptyPositions(state);
      rebalanceEmptyPositions(state, context);
    }

    for (const [staffId, potential] of state.potentialCells) {
      if (potential > 0) recordRequestedDay(context, staffId, state.shifts.has(staffId));
    }
    shifts.push(...toCreatedShifts(state, date, boardStart));
    hasShortage ||= state.demand.some((cells, position) => cells.some((_, cell) => isShort(state, position, cell)));
  }

  return { shifts, hasShortage, skippedDates };
}
