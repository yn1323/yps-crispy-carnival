import { timeToMinutes } from "../../../_lib/time";
import type { AutoCreatedShift, AutoCreateInput } from "../types";
import {
  CELL_MINUTES,
  computeDayShares,
  computeTargetCells,
  countWorkedCells,
  listWorkers,
  type TimeGrid,
} from "./timeGrid";

// 作り方の違う下書きを、同じ数字で比べる。決まった手順だけ、AIが一から、手順のあとAIが見直し、の3通りを並べるために使う。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

export type DraftMetrics = {
  /** 勤務の件数（1人の1日で1件）。 */
  shiftCount: number;
  /** 休憩を除いた勤務時間の合計。 */
  workedHours: number;
  /** 必要人数に足りない時間の合計（人数×時間）。 */
  shortageHours: number;
  /** 必要人数より多い時間の合計（人数×時間）。 */
  excessHours: number;
  /** 必要人数があるのに、働いている人が見習いだけの時間の合計（ポジションごと）。 */
  newcomerOnlyHours: number;
  /** 目安の勤務時間からのずれの、1人あたりの平均。 */
  targetGapHoursAverage: number;
  /** 目安の勤務時間に対して入った割合が、いちばん低い人といちばん高い人。目安が0の人は除く。 */
  targetRatioMin: number;
  targetRatioMax: number;
  /** 始まりから終わりまでが3時間に満たない勤務の件数。 */
  shortShiftCount: number;
  fairness: FairnessMetrics;
};

/** 希望の始まりの時刻で分けた区分。朝は10時より前、昼は10時から15時より前、夕は15時以降である。 */
export type FairnessBand = "morning" | "noon" | "evening";

export type FairnessBandMetrics = {
  /** 対象の日数（1人の1日で1日）。 */
  days: number;
  /** 削った割合の平均。そのまま通った日は0、入れなかった日は1である。 */
  cutRatio: number;
  /** 必要人数が希望者より少ないために、避けられない削りの割合の平均。 */
  unavoidableCutRatio: number;
  /** 削った割合から、避けられない分を引いた値の平均。0より大きいほど、余計に削られている。 */
  gap: number;
};

/**
 * 公平さの指標。割合はどれも0から1の値で、100倍すると%になる。
 * 対象は、その日の希望の合計が8時間以下で、担当できるポジションに必要人数がある時間を希望した、1人の1日である。
 * 8時間を超える希望は、通らない時間が長くなるのが当たり前で、削った割合を押し上げるため、対象から外す。
 */
export type FairnessMetrics = {
  /** 対象の日数。 */
  days: number;
  cutRatio: number;
  unavoidableCutRatio: number;
  bands: Record<FairnessBand, FairnessBandMetrics>;
  /** 指標1: 時間帯の偏り。区分ごとの差（`gap`）の、最大と最小の開き。対象の日がない区分は除く。 */
  bandGapSpread: number;
  /** 指標2: いちばん不利な人。人ごとの差の平均の、いちばん大きい値。 */
  staffGapMax: number;
  /** 人ごとの差の平均の、いちばん小さい値。いちばん有利な人である。 */
  staffGapMin: number;
  /** 指標3: 対象の日を日付の順に並べたとき、勤務が入らない日が続いた最長の日数。全員のうち、いちばん長い値。 */
  longestUnassignedStreak: number;
  /** 人ごとの最長の日数の平均。 */
  averageUnassignedStreak: number;
};

const HOURS_PER_CELL = CELL_MINUTES / 60;
const SHORT_SHIFT_MINUTES = 3 * 60;
/** 公平さの指標の対象にする、1日の希望の長さの上限（8時間）。 */
const FAIRNESS_MAX_REQUEST_CELLS = (8 * 60) / CELL_MINUTES;
const NOON_START_MINUTES = 10 * 60;
const EVENING_START_MINUTES = 15 * 60;

const average = (values: readonly number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const getShiftSpanCells = (shift: AutoCreatedShift): number => {
  const first = shift.segments[0];
  const last = shift.segments[shift.segments.length - 1];
  return first && last ? (timeToMinutes(last.endTime) - timeToMinutes(first.startTime)) / CELL_MINUTES : 0;
};

/**
 * 公平さの指標を数える。
 * 削った割合は、1 − 入れた時間 ÷ 希望した時間である。希望した時間は、希望のうち、担当できるポジションに必要人数がある時間に限る。
 * 避けられない分は、1 − 取り分 ÷ 希望した時間である。取り分は、15分ごとの「希望者で埋められる必要人数 ÷ その時間の希望者の数」（1を超える時間は1）を、希望した時間の分だけ合計した値である。
 */
export function evaluateFairness(
  input: AutoCreateInput,
  grid: TimeGrid,
  shifts: readonly AutoCreatedShift[],
): FairnessMetrics {
  const spanByKey = new Map(shifts.map((shift) => [`${shift.date}|${shift.staffId}`, getShiftSpanCells(shift)]));

  type DayRow = { staffId: string; band: FairnessBand; cut: number; unavoidable: number; isAssigned: boolean };
  const rows: DayRow[] = [];
  for (const day of grid.days) {
    for (const [staffId, { cells, share }] of computeDayShares(input, grid, day)) {
      const windows = day.windows.get(staffId) ?? [];
      if (windows.reduce((sum, window) => sum + (window.end - window.start), 0) > FAIRNESS_MAX_REQUEST_CELLS) continue;
      const span = spanByKey.get(`${day.date}|${staffId}`) ?? 0;
      const startMinutes = grid.boardStart + Math.min(...windows.map((window) => window.start)) * CELL_MINUTES;
      rows.push({
        staffId,
        band: startMinutes < NOON_START_MINUTES ? "morning" : startMinutes < EVENING_START_MINUTES ? "noon" : "evening",
        cut: 1 - Math.min(span, cells.length) / cells.length,
        unavoidable: 1 - share / cells.length,
        isAssigned: span > 0,
      });
    }
  }

  const toBand = (band: FairnessBand): FairnessBandMetrics => {
    const bandRows = rows.filter((row) => row.band === band);
    return {
      days: bandRows.length,
      cutRatio: round3(average(bandRows.map((row) => row.cut))),
      unavoidableCutRatio: round3(average(bandRows.map((row) => row.unavoidable))),
      gap: round3(average(bandRows.map((row) => row.cut - row.unavoidable))),
    };
  };
  const bands = { morning: toBand("morning"), noon: toBand("noon"), evening: toBand("evening") };
  const bandGaps = Object.values(bands)
    .filter((band) => band.days > 0)
    .map((band) => band.gap);

  // 日付の順に並んだ`rows`を、人ごとに分ける。
  const rowsByStaff = new Map<string, DayRow[]>();
  for (const row of rows) rowsByStaff.set(row.staffId, [...(rowsByStaff.get(row.staffId) ?? []), row]);
  const staffGaps: number[] = [];
  const staffStreaks: number[] = [];
  for (const staffRows of rowsByStaff.values()) {
    staffGaps.push(average(staffRows.map((row) => row.cut - row.unavoidable)));
    let longest = 0;
    let current = 0;
    for (const row of staffRows) {
      current = row.isAssigned ? 0 : current + 1;
      longest = Math.max(longest, current);
    }
    staffStreaks.push(longest);
  }

  return {
    days: rows.length,
    cutRatio: round3(average(rows.map((row) => row.cut))),
    unavoidableCutRatio: round3(average(rows.map((row) => row.unavoidable))),
    bands,
    bandGapSpread: bandGaps.length > 0 ? round3(Math.max(...bandGaps) - Math.min(...bandGaps)) : 0,
    staffGapMax: staffGaps.length > 0 ? round3(Math.max(...staffGaps)) : 0,
    staffGapMin: staffGaps.length > 0 ? round3(Math.min(...staffGaps)) : 0,
    longestUnassignedStreak: staffStreaks.length > 0 ? Math.max(...staffStreaks) : 0,
    averageUnassignedStreak: round3(average(staffStreaks)),
  };
}
const round = (value: number) => Math.round(value * 100) / 100;
/** 公平さの割合は、%にしたときに小数第1位まで読めるよう、小数第3位までにする。 */
const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function evaluateDraft(
  input: AutoCreateInput,
  grid: TimeGrid,
  shifts: readonly AutoCreatedShift[],
): DraftMetrics {
  const newcomerPositions = new Map(
    input.staffs.map((staff) => [
      staff.id,
      new Set(staff.positionSkills.filter((skill) => skill.level === "newcomer").map((skill) => skill.positionId)),
    ]),
  );

  let shortageCells = 0;
  let excessCells = 0;
  let newcomerOnlyCells = 0;
  for (const day of grid.days) {
    const workers = listWorkers(grid, day, shifts);
    grid.positionIds.forEach((positionId, position) => {
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        const demand = day.demand[position][cell];
        const staffIds = workers[position][cell];
        shortageCells += Math.max(0, demand - staffIds.length);
        excessCells += Math.max(0, staffIds.length - demand);
        if (
          demand > 0 &&
          staffIds.length > 0 &&
          staffIds.every((staffId) => newcomerPositions.get(staffId)?.has(positionId))
        ) {
          newcomerOnlyCells += 1;
        }
      }
    });
  }

  const workedCells = new Map<string, number>();
  for (const shift of shifts) {
    workedCells.set(shift.staffId, (workedCells.get(shift.staffId) ?? 0) + countWorkedCells(grid, shift));
  }
  const { target } = computeTargetCells(input, grid);
  const shortShiftCount = shifts.filter(
    (shift) => shift.segments.length > 0 && getShiftSpanCells(shift) * CELL_MINUTES < SHORT_SHIFT_MINUTES,
  ).length;
  let gapCells = 0;
  let ratioMin = Number.POSITIVE_INFINITY;
  let ratioMax = Number.NEGATIVE_INFINITY;
  for (const staff of input.staffs) {
    const worked = workedCells.get(staff.id) ?? 0;
    const targetCells = target.get(staff.id) ?? 0;
    gapCells += Math.abs(worked - targetCells);
    if (targetCells > 0) {
      ratioMin = Math.min(ratioMin, worked / targetCells);
      ratioMax = Math.max(ratioMax, worked / targetCells);
    }
  }

  return {
    shiftCount: shifts.length,
    workedHours: round([...workedCells.values()].reduce((sum, cells) => sum + cells, 0) * HOURS_PER_CELL),
    shortageHours: round(shortageCells * HOURS_PER_CELL),
    excessHours: round(excessCells * HOURS_PER_CELL),
    newcomerOnlyHours: round(newcomerOnlyCells * HOURS_PER_CELL),
    targetGapHoursAverage: input.staffs.length > 0 ? round((gapCells * HOURS_PER_CELL) / input.staffs.length) : 0,
    targetRatioMin: Number.isFinite(ratioMin) ? round(ratioMin) : 0,
    targetRatioMax: Number.isFinite(ratioMax) ? round(ratioMax) : 0,
    shortShiftCount,
    fairness: evaluateFairness(input, grid, shifts),
  };
}
