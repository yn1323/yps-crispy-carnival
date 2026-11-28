import { getMinutesOverNoBreakSpan, getRequiredBreakMinutes } from "../breakStandard";
import type { AutoCreatedShift, AutoCreateInput } from "../types";
import type { AiDraftShift } from "./aiDraftSchema";
import {
  CELL_MINUTES,
  cellToTime,
  listWorkers,
  SHIFT_UNIT_CELLS,
  type TimeGrid,
  type TimeGridDay,
  timeToCell,
} from "./timeGrid";

// AIが返した勤務を1件ずつ検査し、通ったものだけを下書きへ入れる。
// AIは決まりを破ることがあるため、ここを通らない勤務は画面に出さない。通らなかった人のその日は、元の下書きのまま残す。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

/** 勤務の最短（2時間）。希望の時間がこれより短い日は、希望をちょうど使い切る勤務だけを認める。 */
const MIN_SHIFT_CELLS = 8;
/** 1つのポジションを続ける最短（1時間）。 */
const MIN_POSITION_CELLS = 4;
/** 休憩を、勤務の開始と終了から離す長さ（1時間）。 */
const BREAK_MARGIN_CELLS = 4;

export type AiDraftRejectReason =
  | "UNKNOWN_STAFF"
  | "UNKNOWN_DATE"
  | "DUPLICATED"
  | "INVALID_TIME"
  | "NOT_CONTIGUOUS"
  | "UNKNOWN_POSITION"
  | "UNAVAILABLE_POSITION"
  | "OUTSIDE_REQUEST"
  | "TOO_SHORT"
  | "POSITION_TOO_SHORT"
  | "JUST_OVER_NO_BREAK_SPAN"
  | "BREAK_MISMATCH"
  | "BREAK_POSITION"
  | "EXCEEDS_REQUIREMENT";

export type AiDraftRejection = { staff: number; date: string; reason: AiDraftRejectReason };

export type ApplyAiDraftResult = {
  /** 下書きへ、通った変更を入れた結果。日付、スタッフの順に並ぶ。 */
  shifts: AutoCreatedShift[];
  /** 通った変更。 */
  applied: Array<{ staffId: string; date: string; change: string; isRemoval: boolean }>;
  rejected: AiDraftRejection[];
};

function validateChange(
  input: AutoCreateInput,
  grid: TimeGrid,
  change: AiDraftShift,
): { shift: AutoCreatedShift | null } | { reason: AiDraftRejectReason } {
  const staff = input.staffs[change.staff];
  if (!staff || !Number.isInteger(change.staff)) return { reason: "UNKNOWN_STAFF" };
  const day = grid.days.find((item) => item.date === change.date);
  if (!day) return { reason: "UNKNOWN_DATE" };

  // 区間が空なら、その日を休みにする。
  if (change.segments.length === 0) return { shift: null };

  const segments: Array<{ start: number; end: number; positionId: string }> = [];
  for (const segment of change.segments) {
    const start = timeToCell(grid, segment.from);
    const end = timeToCell(grid, segment.to);
    if (start === null || end === null || end <= start) return { reason: "INVALID_TIME" };
    if (start % SHIFT_UNIT_CELLS !== 0 || end % SHIFT_UNIT_CELLS !== 0) return { reason: "INVALID_TIME" };
    const positionId = grid.positionIds[segment.position];
    if (positionId === undefined || !Number.isInteger(segment.position)) return { reason: "UNKNOWN_POSITION" };
    if (staff.positionSkills.some((skill) => skill.positionId === positionId && skill.level === "unavailable")) {
      return { reason: "UNAVAILABLE_POSITION" };
    }
    const previous = segments[segments.length - 1];
    if (previous && previous.end !== start) return { reason: "NOT_CONTIGUOUS" };
    // 同じポジションが続く区間は、1つにまとめて長さを見る。
    if (previous && previous.positionId === positionId) previous.end = end;
    else segments.push({ start, end, positionId });
  }

  const spanStart = segments[0].start;
  const spanEnd = segments[segments.length - 1].end;
  const window = (day.windows.get(staff.id) ?? []).find((range) => range.start <= spanStart && spanEnd <= range.end);
  if (!window) return { reason: "OUTSIDE_REQUEST" };

  const spanCells = spanEnd - spanStart;
  const usesWholeWindow = spanStart === window.start && spanEnd === window.end;
  if (spanCells < MIN_SHIFT_CELLS && !usesWholeWindow) return { reason: "TOO_SHORT" };
  if (segments.length > 1 && segments.some((segment) => segment.end - segment.start < MIN_POSITION_CELLS)) {
    return { reason: "POSITION_TOO_SHORT" };
  }

  const breaks: Array<{ start: number; end: number }> = [];
  if (input.includesBreaks) {
    const spanMinutes = spanCells * CELL_MINUTES;
    if (getMinutesOverNoBreakSpan(spanMinutes) > 0) return { reason: "JUST_OVER_NO_BREAK_SPAN" };
    const requiredCells = getRequiredBreakMinutes(spanMinutes) / CELL_MINUTES;
    if (requiredCells === 0 ? change.breaks.length > 0 : change.breaks.length !== 1) {
      return { reason: "BREAK_MISMATCH" };
    }
    for (const item of change.breaks) {
      const start = timeToCell(grid, item.from);
      const end = timeToCell(grid, item.to);
      if (start === null || end === null || end <= start) return { reason: "INVALID_TIME" };
      if (end - start !== requiredCells) return { reason: "BREAK_MISMATCH" };
      if (start < spanStart + BREAK_MARGIN_CELLS || end > spanEnd - BREAK_MARGIN_CELLS) {
        return { reason: "BREAK_POSITION" };
      }
      breaks.push({ start, end });
    }
  }

  const toTime = (cell: number) => cellToTime(grid, cell);
  return {
    shift: {
      staffId: staff.id,
      date: change.date,
      segments: segments.map((segment) => ({
        startTime: toTime(segment.start),
        endTime: toTime(segment.end),
        positionId: segment.positionId,
      })),
      breaks: breaks.map((item) => ({ startTime: toTime(item.start), endTime: toTime(item.end) })),
    },
  };
}

/** その日の、必要人数より多い人数の合計（ポジション×マス）。 */
function countExcessCells(grid: TimeGrid, day: TimeGridDay, shifts: readonly AutoCreatedShift[]): number {
  const workers = listWorkers(grid, day, shifts);
  let excess = 0;
  grid.positionIds.forEach((_, position) => {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      excess += Math.max(0, workers[position][cell].length - day.demand[position][cell]);
    }
  });
  return excess;
}

/**
 * AIが返した変更を、下書きへ入れる。
 * 変更は1人の1日分をまるごと置き換える。同じ人の同じ日が2回あれば、先のものだけを使う。
 * 休憩を入れない設定では、AIが返した休憩を捨てる。
 * 必要人数より多い時間を増やす変更は捨てる。決まった手順が必要人数ちょうどで止めるのと、そろえるためである。
 * あけた時間を別の人で埋める変更が、あける変更より先に並んでいても通すため、入れられなかった変更は、ほかの変更のあとで確かめ直す。
 */
export function applyAiDraft(args: {
  input: AutoCreateInput;
  grid: TimeGrid;
  draft: readonly AutoCreatedShift[];
  changes: readonly AiDraftShift[];
}): ApplyAiDraftResult {
  const { input, grid } = args;
  const byKey = new Map(args.draft.map((shift) => [`${shift.date}|${shift.staffId}`, shift]));
  const seen = new Set<string>();
  const applied: ApplyAiDraftResult["applied"] = [];
  const rejected: AiDraftRejection[] = [];

  const valid: Array<{ change: AiDraftShift; staffId: string; key: string; shift: AutoCreatedShift | null }> = [];
  for (const change of args.changes) {
    const result = validateChange(input, grid, change);
    if ("reason" in result) {
      rejected.push({ staff: change.staff, date: change.date, reason: result.reason });
      continue;
    }
    const staffId = input.staffs[change.staff].id;
    const key = `${change.date}|${staffId}`;
    if (seen.has(key)) {
      rejected.push({ staff: change.staff, date: change.date, reason: "DUPLICATED" });
      continue;
    }
    seen.add(key);
    // 今の下書きと同じ内容を返した場合は、変更として数えない。
    const current = byKey.get(key);
    if (result.shift ? JSON.stringify(result.shift) === JSON.stringify(current) : current === undefined) continue;
    valid.push({ change, staffId, key, shift: result.shift });
  }

  const shiftsOn = (date: string) => [...byKey.values()].filter((shift) => shift.date === date);
  const increasesExcess = (item: (typeof valid)[number]) => {
    const day = grid.days.find((entry) => entry.date === item.change.date);
    if (!item.shift || !day) return false;
    const before = shiftsOn(day.date);
    const after = [...before.filter((shift) => shift.staffId !== item.staffId), item.shift];
    return countExcessCells(grid, day, after) > countExcessCells(grid, day, before);
  };
  // 通る変更から入れ、入れられなかった変更を、ほかの変更が入ったあとでもう一度確かめる。1件も入らなくなったら終える。
  let pending = valid;
  while (pending.length > 0) {
    const waiting: typeof valid = [];
    for (const item of pending) {
      if (increasesExcess(item)) {
        waiting.push(item);
        continue;
      }
      if (item.shift) byKey.set(item.key, item.shift);
      else byKey.delete(item.key);
      applied.push({
        staffId: item.staffId,
        date: item.change.date,
        change: item.change.change,
        isRemoval: item.shift === null,
      });
    }
    if (waiting.length === pending.length) break;
    pending = waiting;
  }
  for (const item of pending.filter(increasesExcess)) {
    rejected.push({ staff: item.change.staff, date: item.change.date, reason: "EXCEEDS_REQUIREMENT" });
  }

  const shifts = [...byKey.values()].sort(
    (a, b) =>
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
  );
  return { shifts, applied, rejected };
}
