import { minutesToTime, timeToMinutes } from "../../../_lib/time";
import { buildSelectionContext } from "../selection";
import type { AutoCreatedShift, AutoCreateInput } from "../types";

// 時間指定の募集を、15分のマスの表として読む。AIへ渡すデータ、AIが返した勤務の検査、結果の比較が同じ数え方を使う。
// マスの切り方は、決まった手順の自動作成（timeAssignments.ts）とそろえる。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 人数を数えるマスの長さ。 */
export const CELL_MINUTES = 15;
/** 勤務の開始と終了、ポジションの境目の単位（30分）。 */
export const SHIFT_UNIT_CELLS = 2;

export type CellRange = { start: number; end: number };

export type TimeGridDay = {
  date: string;
  /** ポジション×マスの必要人数。 */
  demand: number[][];
  /** スタッフごとの希望の時間。30分単位にそろえ、重なるものはまとめてある。 */
  windows: Map<string, CellRange[]>;
};

export type TimeGrid = {
  /** 受付時間の開始（分）。マス0の開始時刻である。 */
  boardStart: number;
  cellCount: number;
  positionIds: readonly string[];
  /** 必要人数のある日だけを、日付の順に持つ。 */
  days: TimeGridDay[];
};

const roundUpToUnit = (cell: number) => Math.ceil(cell / SHIFT_UNIT_CELLS) * SHIFT_UNIT_CELLS;
const roundDownToUnit = (cell: number) => Math.floor(cell / SHIFT_UNIT_CELLS) * SHIFT_UNIT_CELLS;

/** 時間指定の募集をマスの表に直す。時間指定でない募集はnullを返す。 */
export function buildTimeGrid(input: AutoCreateInput): TimeGrid | null {
  if (input.pattern.kind !== "time") return null;

  const boardStart = timeToMinutes(input.pattern.startTime);
  const cellCount = roundDownToUnit(Math.floor((timeToMinutes(input.pattern.endTime) - boardStart) / CELL_MINUTES));
  const positionIndex = new Map(input.positionIds.map((positionId, index) => [positionId, index]));
  const staffIds = new Set(input.staffs.map((staff) => staff.id));
  const requirementsByDate = new Map(input.days.map((day) => [day.date, day.requirements]));

  const days: TimeGridDay[] = [];
  for (const date of [...new Set(input.dates)].sort()) {
    const requirements = requirementsByDate.get(date);
    if (requirements?.kind !== "time" || cellCount <= 0) continue;

    const demand = input.positionIds.map(() => new Array<number>(cellCount).fill(0));
    let hasDemand = false;
    for (const bar of requirements.bars) {
      const position = positionIndex.get(bar.positionId);
      if (position === undefined) continue;
      const start = Math.max(0, Math.ceil((timeToMinutes(bar.startTime) - boardStart) / CELL_MINUTES));
      const end = Math.min(cellCount, Math.floor((timeToMinutes(bar.endTime) - boardStart) / CELL_MINUTES));
      for (let cell = start; cell < end; cell += 1) {
        demand[position][cell] += 1;
        hasDemand = true;
      }
    }
    if (!hasDemand) continue;

    const rawWindows = new Map<string, CellRange[]>();
    for (const request of input.requestedSlots) {
      if (request.date !== date || !staffIds.has(request.staffId)) continue;
      const start = roundUpToUnit(
        Math.max(0, Math.ceil((timeToMinutes(request.startTime) - boardStart) / CELL_MINUTES)),
      );
      const end = roundDownToUnit(
        Math.min(cellCount, Math.floor((timeToMinutes(request.endTime) - boardStart) / CELL_MINUTES)),
      );
      if (end <= start) continue;
      rawWindows.set(request.staffId, [...(rawWindows.get(request.staffId) ?? []), { start, end }]);
    }
    const windows = new Map<string, CellRange[]>();
    for (const [staffId, ranges] of rawWindows) {
      const merged: CellRange[] = [];
      for (const range of ranges.slice().sort((a, b) => a.start - b.start || a.end - b.end)) {
        const last = merged[merged.length - 1];
        if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
        else merged.push({ ...range });
      }
      windows.set(staffId, merged);
    }

    days.push({ date, demand, windows });
  }

  return { boardStart, cellCount, positionIds: input.positionIds, days };
}

/** 時刻をマスの番号に直す。15分単位でない時刻と、受付時間の外の時刻はnullを返す。 */
export function timeToCell(grid: TimeGrid, time: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const offset = timeToMinutes(time) - grid.boardStart;
  if (!Number.isFinite(offset) || offset % CELL_MINUTES !== 0) return null;
  const cell = offset / CELL_MINUTES;
  return cell >= 0 && cell <= grid.cellCount ? cell : null;
}

export function cellToTime(grid: TimeGrid, cell: number): string {
  return minutesToTime(grid.boardStart + cell * CELL_MINUTES);
}

/** 勤務の始まりから終わりまでと、そのうち休憩でないマスを返す。時刻を読めない勤務はnullを返す。 */
function readShiftCells(
  grid: TimeGrid,
  shift: AutoCreatedShift,
): { cells: Array<{ cell: number; position: number }>; span: CellRange } | null {
  const positionIndex = new Map(grid.positionIds.map((positionId, index) => [positionId, index]));
  const breakCells = new Set<number>();
  for (const item of shift.breaks) {
    const start = timeToCell(grid, item.startTime);
    const end = timeToCell(grid, item.endTime);
    if (start === null || end === null) return null;
    for (let cell = start; cell < end; cell += 1) breakCells.add(cell);
  }
  const cells: Array<{ cell: number; position: number }> = [];
  let spanStart = Number.POSITIVE_INFINITY;
  let spanEnd = Number.NEGATIVE_INFINITY;
  for (const segment of shift.segments) {
    const start = timeToCell(grid, segment.startTime);
    const end = timeToCell(grid, segment.endTime);
    const position = positionIndex.get(segment.positionId);
    if (start === null || end === null || position === undefined) return null;
    spanStart = Math.min(spanStart, start);
    spanEnd = Math.max(spanEnd, end);
    for (let cell = start; cell < end; cell += 1) {
      if (!breakCells.has(cell)) cells.push({ cell, position });
    }
  }
  if (!Number.isFinite(spanStart)) return null;
  return { cells, span: { start: spanStart, end: spanEnd } };
}

/** 1人の1日の勤務のうち、休憩を除いて働くマスの数。 */
export function countWorkedCells(grid: TimeGrid, shift: AutoCreatedShift): number {
  return readShiftCells(grid, shift)?.cells.length ?? 0;
}

/** その日の、ポジション×マスの働いている人。休憩中の人は数えない。 */
export function listWorkers(grid: TimeGrid, day: TimeGridDay, shifts: readonly AutoCreatedShift[]): string[][][] {
  const workers = grid.positionIds.map(() => Array.from({ length: grid.cellCount }, () => [] as string[]));
  for (const shift of shifts) {
    if (shift.date !== day.date) continue;
    for (const { cell, position } of readShiftCells(grid, shift)?.cells ?? []) {
      workers[position][cell].push(shift.staffId);
    }
  }
  return workers;
}

export type ShortageRange = { positionId: string; startTime: string; endTime: string; short: number };

/** 必要人数に足りない時間を、ポジションごとに、足りない人数が同じ続きでまとめて返す。 */
export function listShortages(grid: TimeGrid, day: TimeGridDay, shifts: readonly AutoCreatedShift[]): ShortageRange[] {
  const workers = listWorkers(grid, day, shifts);
  const ranges: ShortageRange[] = [];
  grid.positionIds.forEach((positionId, position) => {
    let runStart = 0;
    for (let cell = 1; cell <= grid.cellCount; cell += 1) {
      const shortAt = (index: number) => Math.max(0, day.demand[position][index] - workers[position][index].length);
      if (cell < grid.cellCount && shortAt(cell) === shortAt(runStart)) continue;
      const short = shortAt(runStart);
      if (short > 0) {
        ranges.push({ positionId, startTime: cellToTime(grid, runStart), endTime: cellToTime(grid, cell), short });
      }
      runStart = cell;
    }
  });
  return ranges;
}

export type RequirementRange = { positionId: string; startTime: string; endTime: string; count: number };

/** 必要人数を、ポジションごとに、人数が同じ続きでまとめて返す。 */
export function listRequirementRanges(grid: TimeGrid, day: TimeGridDay): RequirementRange[] {
  const ranges: RequirementRange[] = [];
  grid.positionIds.forEach((positionId, position) => {
    let runStart = 0;
    for (let cell = 1; cell <= grid.cellCount; cell += 1) {
      if (cell < grid.cellCount && day.demand[position][cell] === day.demand[position][runStart]) continue;
      const count = day.demand[position][runStart];
      if (count > 0) {
        ranges.push({ positionId, startTime: cellToTime(grid, runStart), endTime: cellToTime(grid, cell), count });
      }
      runStart = cell;
    }
  });
  return ranges;
}

export type DayShare = {
  /** 希望したマス。希望の時間のうち、担当できるポジションに必要人数があるマスである。 */
  cells: number[];
  /**
   * 取り分。マスごとの「希望者で埋められる必要人数 ÷ そのマスの希望者の数」（1を超えるマスは1）を、希望したマスの分だけ合計した値である。
   * 希望者が必要人数より多い時間帯だけを希望した人ほど、希望した量に対して小さくなる。
   */
  share: number;
};

/** その日の、スタッフごとの希望したマスと取り分を返す。希望したマスのない人は入れない。 */
export function computeDayShares(input: AutoCreateInput, grid: TimeGrid, day: TimeGridDay): Map<string, DayShare> {
  const positionIndex = new Map(grid.positionIds.map((positionId, index) => [positionId, index]));
  const skilledByStaff = new Map(
    input.staffs.map((staff) => {
      const unavailable = new Set(
        staff.positionSkills
          .filter((skill) => skill.level === "unavailable")
          .map((skill) => positionIndex.get(skill.positionId)),
      );
      return [
        staff.id,
        grid.positionIds.map((_, position) => position).filter((position) => !unavailable.has(position)),
      ];
    }),
  );

  // ポジション×マスの、そのマスを希望していて担当できる人の数と、マスごとの希望者の数。
  const coverCount = grid.positionIds.map(() => new Array<number>(grid.cellCount).fill(0));
  const candidateCount = new Array<number>(grid.cellCount).fill(0);
  const cellsByStaff = new Map<string, number[]>();
  for (const [staffId, windows] of day.windows) {
    const skilled = skilledByStaff.get(staffId) ?? [];
    const cells: number[] = [];
    for (const window of windows) {
      for (let cell = window.start; cell < window.end; cell += 1) {
        let hasDemand = false;
        for (const position of skilled) {
          if (day.demand[position][cell] === 0) continue;
          coverCount[position][cell] += 1;
          hasDemand = true;
        }
        if (hasDemand) {
          cells.push(cell);
          candidateCount[cell] += 1;
        }
      }
    }
    if (cells.length > 0) cellsByStaff.set(staffId, cells);
  }

  const shares = new Map<string, DayShare>();
  for (const [staffId, cells] of cellsByStaff) {
    let share = 0;
    for (const cell of cells) {
      const fillable = grid.positionIds.reduce(
        (sum, _positionId, position) => sum + Math.min(day.demand[position][cell], coverCount[position][cell]),
        0,
      );
      share += Math.min(1, fillable / candidateCount[cell]);
    }
    shares.set(staffId, { cells, share });
  }
  return shares;
}

/**
 * スタッフごとの、今回希望した量、取り分、目安の量を、マスの数で返す。
 * 希望した量は、希望の時間のうち、担当できるポジションに必要人数があるマスの数である。
 * 目安の量は、決まった手順の自動作成と同じ計算（取り分 × 過去の割合）を使う。
 * `shareByDate`は、取り分の日ごとの内訳である。
 */
export function computeTargetCells(
  input: AutoCreateInput,
  grid: TimeGrid,
): {
  requested: Map<string, number>;
  share: Map<string, number>;
  target: Map<string, number>;
  shareByDate: Map<string, Map<string, number>>;
} {
  const requested = new Map(input.staffs.map((staff) => [staff.id, 0]));
  const share = new Map(input.staffs.map((staff) => [staff.id, 0]));
  const shareByDate = new Map<string, Map<string, number>>();
  for (const day of grid.days) {
    const dayShares = new Map<string, number>();
    for (const [staffId, item] of computeDayShares(input, grid, day)) {
      requested.set(staffId, (requested.get(staffId) ?? 0) + item.cells.length);
      share.set(staffId, (share.get(staffId) ?? 0) + item.share);
      dayShares.set(staffId, item.share);
    }
    shareByDate.set(day.date, dayShares);
  }
  const context = buildSelectionContext({
    staffs: input.staffs,
    requestedAmounts: share,
    history: input.history,
    periodStart: input.periodStart,
  });
  return { requested, share, target: context.targetAmounts, shareByDate };
}
