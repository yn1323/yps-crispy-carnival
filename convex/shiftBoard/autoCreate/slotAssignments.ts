import { getSubmissionPatternTimeRange } from "../../_lib/submissionPattern";
import { timeToMinutes } from "../../_lib/time";
import {
  addAssignedAmount,
  buildSelectionContext,
  compareCandidates,
  isNewcomer,
  pickCandidate,
  type SelectionContext,
} from "./selection";
import type { AutoCreatedShift, AutoCreateInput, AutoCreateResult } from "./types";

// 日付選択とパターン選択の自動作成。枠（日付選択は「日×ポジション」、パターン選択は「日×勤務パターン×ポジション」）を、
// 必要人数ちょうどまで埋める。
// DBアクセス・Convex APIのインポート禁止（shiftBoard/validation.tsと同じ共有規約）。

type Slot = {
  date: string;
  /** パターン選択の勤務パターン。日付選択ではnull。 */
  optionId: string | null;
  positionId: string;
  required: number;
  startTime: string;
  endTime: string;
  /** その枠を希望していて、そのポジションが担当外でない人。 */
  candidates: string[];
  members: string[];
  /** 同じ条件の枠を並べるための、日付、勤務パターン、ポジションの順。 */
  order: [number, number, number];
};

const cellKey = (staffId: string, date: string) => `${staffId}|${date}`;

function compareSlotOrder(a: Slot, b: Slot): number {
  return a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2];
}

/** 候補の人数を必要人数で割った値が小さい枠を先にする。割り算をせずに掛け算で比べる。 */
function compareSlotScarcity(a: Slot, b: Slot): number {
  return a.candidates.length * b.required - b.candidates.length * a.required || compareSlotOrder(a, b);
}

function overlaps(a: Slot, b: Slot): boolean {
  return timeToMinutes(a.startTime) < timeToMinutes(b.endTime) && timeToMinutes(b.startTime) < timeToMinutes(a.endTime);
}

function buildSlots(input: AutoCreateInput): Slot[] {
  const { pattern } = input;
  if (pattern.kind === "time") return [];

  const staffIds = new Set(input.staffs.map((staff) => staff.id));
  const unavailable = new Set(
    input.staffs.flatMap((staff) =>
      staff.positionSkills
        .filter((skill) => skill.level === "unavailable")
        .map((skill) => `${staff.id}|${skill.positionId}`),
    ),
  );
  const positionIndex = new Map(input.positionIds.map((positionId, index) => [positionId, index]));
  const targetDates = new Set(input.dates);
  const options = pattern.kind === "shiftType" ? pattern.options.slice().sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const optionIndex = new Map(options.map((option, index) => [option.id, index]));
  const boardRange = getSubmissionPatternTimeRange(pattern);

  // 希望を「日」または「日×勤務パターン」ごとにまとめる。
  const requesters = new Map<string, Set<string>>();
  const addRequester = (key: string, staffId: string) => {
    if (!staffIds.has(staffId)) return;
    const set = requesters.get(key) ?? new Set<string>();
    set.add(staffId);
    requesters.set(key, set);
  };
  if (pattern.kind === "dateOnly") {
    for (const request of input.requestedDates) addRequester(request.date, request.staffId);
  } else {
    for (const request of input.requestedSlots) {
      // 勤務パターンのIDを持たない希望は、開始と終了が同じ勤務パターンの希望として読む。
      const optionId =
        request.optionId ??
        options.find((option) => option.startTime === request.startTime && option.endTime === request.endTime)?.id;
      if (optionId) addRequester(`${request.date}|${optionId}`, request.staffId);
    }
  }

  const slots: Slot[] = [];
  const dateOrder = input.dates.slice().sort();
  const dateIndex = new Map(dateOrder.map((date, index) => [date, index]));
  for (const day of input.days) {
    const { requirements } = day;
    if (!requirements || requirements.kind !== pattern.kind || !targetDates.has(day.date)) continue;
    const entries =
      requirements.kind === "dateOnly"
        ? [{ optionId: null as string | null, counts: requirements.counts }]
        : requirements.kind === "shiftType"
          ? requirements.options.filter((option) => optionIndex.has(option.optionId))
          : [];
    for (const entry of entries) {
      const option = entry.optionId === null ? undefined : options[optionIndex.get(entry.optionId) ?? -1];
      const requesterKey = entry.optionId === null ? day.date : `${day.date}|${entry.optionId}`;
      for (const count of entry.counts) {
        const index = positionIndex.get(count.positionId);
        if (index === undefined || count.count <= 0) continue;
        slots.push({
          date: day.date,
          optionId: entry.optionId,
          positionId: count.positionId,
          required: count.count,
          startTime: option?.startTime ?? boardRange.startTime,
          endTime: option?.endTime ?? boardRange.endTime,
          candidates: [...(requesters.get(requesterKey) ?? [])]
            .filter((staffId) => !unavailable.has(`${staffId}|${count.positionId}`))
            .sort(),
          members: [],
          order: [
            dateIndex.get(day.date) ?? 0,
            entry.optionId === null ? 0 : (optionIndex.get(entry.optionId) ?? 0),
            index,
          ],
        });
      }
    }
  }
  return slots;
}

function hasNonNewcomer(context: SelectionContext, slot: Slot): boolean {
  return slot.members.some((staffId) => !isNewcomer(context, staffId, slot.positionId));
}

/** だれもいない枠を先にし、その中では元の並びを保つ。 */
function emptySlotsFirst(slots: readonly Slot[]): Slot[] {
  return [...slots.filter((slot) => slot.members.length === 0), ...slots.filter((slot) => slot.members.length > 0)];
}

/**
 * 日付選択とパターン選択の勤務を作る。
 * 1回目は1人を1日に1つの枠だけへ入れる。まずどの枠にも1人ずつ入れ、そのあと必要人数まで埋める。
 * 必要人数の多い枠に人が集まり、ほかの枠が0人のまま残ることを防ぐためである。
 * そのあと、不足の残った枠を入れ替えで見直す。
 * パターン選択では、不足の残った枠へ、その日すでに別の勤務パターンに入っている人を入れる。
 * 最後に、だれもいない枠が残っていれば、2人以上いる枠から1人を移す。
 */
export function buildSlotAssignments(input: AutoCreateInput): AutoCreateResult {
  const slots = buildSlots(input);
  const datesWithSlots = new Set(slots.map((slot) => slot.date));
  const skippedDates = input.dates.filter((date) => !datesWithSlots.has(date)).sort();

  const requestedDates = new Map<string, Set<string>>();
  for (const slot of slots) {
    for (const staffId of slot.candidates) {
      const dates = requestedDates.get(staffId) ?? new Set<string>();
      dates.add(slot.date);
      requestedDates.set(staffId, dates);
    }
  }
  const context = buildSelectionContext({
    staffs: input.staffs,
    requestedAmounts: new Map([...requestedDates].map(([staffId, dates]) => [staffId, dates.size])),
    history: input.history,
    periodStart: input.periodStart,
  });

  // その人がその日に入っている枠。
  const cells = new Map<string, { staffId: string; date: string; slots: Slot[] }>();
  const getJoinedSlots = (staffId: string, date: string) => cells.get(cellKey(staffId, date))?.slots ?? [];
  const join = (slot: Slot, staffId: string) => {
    slot.members.push(staffId);
    const key = cellKey(staffId, slot.date);
    const cell = cells.get(key) ?? { staffId, date: slot.date, slots: [] };
    if (cell.slots.length === 0) addAssignedAmount(context, staffId, 1);
    cell.slots.push(slot);
    cells.set(key, cell);
  };
  const isFree = (staffId: string, date: string) => getJoinedSlots(staffId, date).length === 0;

  const ordered = slots.slice().sort(compareSlotScarcity);

  // 1回目: 1人を1日に1つの枠だけへ入れる。先にどの枠にも1人ずつ入れてから、必要人数まで埋める。
  for (const limit of [1, Number.POSITIVE_INFINITY]) {
    for (const slot of ordered) {
      while (slot.members.length < Math.min(slot.required, limit)) {
        const picked = pickCandidate(
          context,
          slot.positionId,
          slot.candidates.filter((staffId) => isFree(staffId, slot.date)),
          { prefersNonNewcomer: !hasNonNewcomer(context, slot) },
        );
        if (!picked) break;
        join(slot, picked);
      }
    }
  }

  // 入れ替え: 不足の残った枠へ、同じ日の別の枠にいる人を移し、空いた枠を別の候補で埋める。だれもいない枠から先に見直す。
  for (const slot of emptySlotsFirst(ordered)) {
    while (slot.members.length < slot.required) {
      const movers = slot.candidates
        .filter((staffId) => !slot.members.includes(staffId))
        .sort((a, b) => compareCandidates(context, slot.positionId, a, b));
      let moved = false;
      for (const mover of movers) {
        const cell = cells.get(cellKey(mover, slot.date));
        if (cell?.slots.length !== 1) continue;
        const source = cell.slots[0];
        const remaining = source.members.filter((staffId) => staffId !== mover);
        const replacement = pickCandidate(
          context,
          source.positionId,
          source.candidates.filter((staffId) => isFree(staffId, source.date)),
          { prefersNonNewcomer: !remaining.some((staffId) => !isNewcomer(context, staffId, source.positionId)) },
        );
        if (!replacement) continue;
        // 移したあとの元の枠が、見習いだけになる入れ替えはしない。
        const sourceKeepsNonNewcomer =
          !hasNonNewcomer(context, source) ||
          [...remaining, replacement].some((staffId) => !isNewcomer(context, staffId, source.positionId));
        if (!sourceKeepsNonNewcomer) continue;

        // 移す人はその日の勤務を持ったままなので、入った日数は変えない。
        source.members = remaining;
        slot.members.push(mover);
        cell.slots = [slot];
        join(source, replacement);
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }

  // パターン選択の2つ目: 不足の残った枠へ、その日すでに別の勤務パターンに入っている人を入れる。だれもいない枠から先に入れる。
  const fillWithSecondOption = () => {
    if (input.pattern.kind !== "shiftType") return;
    for (const slot of emptySlotsFirst(ordered)) {
      while (slot.members.length < slot.required) {
        const picked = pickCandidate(
          context,
          slot.positionId,
          slot.candidates.filter((staffId) => {
            const joined = getJoinedSlots(staffId, slot.date);
            return (
              joined.length > 0 && joined.every((other) => other.optionId !== slot.optionId && !overlaps(other, slot))
            );
          }),
          { prefersNonNewcomer: !hasNonNewcomer(context, slot) },
        );
        if (!picked) break;
        join(slot, picked);
      }
    }
  };
  fillWithSecondOption();

  // だれもいない枠へ、同じ日の2人以上いる枠から1人を移す。移す人はその日の勤務を持ったままなので、入った日数は変えない。
  // 移す元は、必要人数に対して埋まっている割合の高い枠を先にする。元の枠が見習いだけになる移し方は、ほかに移せる人がいない場合だけにする。
  let hasMoved = false;
  for (const slot of ordered) {
    if (slot.members.length > 0) continue;
    const movers = slot.candidates.flatMap((staffId) => {
      const cell = cells.get(cellKey(staffId, slot.date));
      const source = cell?.slots.length === 1 ? cell.slots[0] : undefined;
      if (!cell || !source || source.members.length < 2) return [];
      const leavesNewcomersOnly =
        hasNonNewcomer(context, source) &&
        source.members.every((other) => other === staffId || isNewcomer(context, other, source.positionId));
      return [{ staffId, cell, source, leavesNewcomersOnly }];
    });
    if (movers.length === 0) continue;
    const mover = movers.reduce((best, item) => {
      const order =
        Number(item.leavesNewcomersOnly) - Number(best.leavesNewcomersOnly) ||
        Number(isNewcomer(context, item.staffId, slot.positionId)) -
          Number(isNewcomer(context, best.staffId, slot.positionId)) ||
        best.source.members.length * item.source.required - item.source.members.length * best.source.required ||
        compareCandidates(context, slot.positionId, item.staffId, best.staffId);
      return order < 0 ? item : best;
    });
    mover.source.members = mover.source.members.filter((staffId) => staffId !== mover.staffId);
    slot.members.push(mover.staffId);
    mover.cell.slots = [slot];
    hasMoved = true;
  }
  // 移して1人減った枠を、別の勤務パターンに入っている人で埋め直す。
  if (hasMoved) fillWithSecondOption();

  const shifts: AutoCreatedShift[] = [];
  for (const cell of cells.values()) {
    if (cell.slots.length === 0) continue;
    shifts.push({
      staffId: cell.staffId,
      date: cell.date,
      segments: cell.slots
        .slice()
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime) || compareSlotOrder(a, b))
        .map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          positionId: slot.positionId,
          ...(slot.optionId !== null ? { optionId: slot.optionId } : {}),
        })),
      breaks: [],
    });
  }
  shifts.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0,
  );

  return {
    shifts,
    hasShortage: slots.some((slot) => slot.members.length < slot.required),
    skippedDates,
  };
}
