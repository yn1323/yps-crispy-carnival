import { getEffectiveBreaks } from "./breaks";
import { isCanonicalWorkPosition } from "./positions";
import { timeToMinutes } from "./time";
import type { ShiftData, StaffingSlot, StaffingSlotKey } from "./types";

// 区切りごと・ポジションごとの人数と、必要人数との過不足を数える純粋処理。
// 時間帯の人数は「その時間帯を通していられる人数」とし、時間帯の中で最も少ない時点の人数を数える。
// 途中で人が抜ける時間帯を、足りていると見せないためである。

const HEADCOUNT_STEP_MINUTES = 15;
const HOUR_MINUTES = 60;

export type StaffingPositionCount = {
  positionId: string;
  count: number;
  // 必要人数。未設定のポジションはnull。
  required: number | null;
  // 足りない人数。足りている場合と必要人数が未設定の場合は0。
  shortage: number;
};

export type StaffingSlotCount = {
  key: StaffingSlotKey;
  // 区切りにいる人数（ポジションを問わない）
  total: number;
  positions: StaffingPositionCount[];
  hasShortage: boolean;
};

type CountInput = {
  // 数える対象の日の勤務（シフト対象のスタッフ分）
  shifts: readonly ShiftData[];
  // 人数を出すポジションのID。並び順は表示順。
  positionIds: readonly string[];
};

const buildSlotCount = (
  key: StaffingSlotKey,
  total: number,
  countByPositionId: ReadonlyMap<string, number>,
  positionIds: readonly string[],
  requirements: StaffingSlot["requirements"],
): StaffingSlotCount => {
  const requiredByPositionId = new Map(requirements.map((requirement) => [requirement.positionId, requirement.count]));
  const positions = positionIds.map((positionId) => {
    const count = countByPositionId.get(positionId) ?? 0;
    const required = requiredByPositionId.get(positionId) ?? null;
    return { positionId, count, required, shortage: required === null ? 0 : Math.max(0, required - count) };
  });
  return { key, total, positions, hasShortage: positions.some((position) => position.shortage > 0) };
};

// その時点（分）に勤務していて、休憩中でない人を、ポジションごとに数える。
const countWorkingAt = (shifts: readonly ShiftData[], minute: number) => {
  const countByPositionId = new Map<string, number>();
  let total = 0;
  for (const shift of shifts) {
    const segment = shift.positions
      .filter(isCanonicalWorkPosition)
      .find((position) => timeToMinutes(position.start) <= minute && minute < timeToMinutes(position.end));
    if (!segment) continue;
    const isOnBreak = getEffectiveBreaks(shift, { clipToWork: true }).some(
      (range) => timeToMinutes(range.start) <= minute && minute < timeToMinutes(range.end),
    );
    if (isOnBreak) continue;
    total += 1;
    countByPositionId.set(segment.positionId, (countByPositionId.get(segment.positionId) ?? 0) + 1);
  }
  return { total, countByPositionId };
};

const countTimeRange = (shifts: readonly ShiftData[], startMinutes: number, endMinutes: number) => {
  let total = Number.POSITIVE_INFINITY;
  const countByPositionId = new Map<string, number>();
  let isFirst = true;
  for (let minute = startMinutes; minute < endMinutes; minute += HEADCOUNT_STEP_MINUTES) {
    const snapshot = countWorkingAt(shifts, minute);
    total = Math.min(total, snapshot.total);
    if (isFirst) {
      for (const [positionId, count] of snapshot.countByPositionId) countByPositionId.set(positionId, count);
      isFirst = false;
      continue;
    }
    for (const positionId of countByPositionId.keys()) {
      countByPositionId.set(
        positionId,
        Math.min(countByPositionId.get(positionId) ?? 0, snapshot.countByPositionId.get(positionId) ?? 0),
      );
    }
  }
  return { total: Number.isFinite(total) ? total : 0, countByPositionId };
};

/** 時間指定: 日の型の時間帯ごとに、ポジション別の人数と過不足を数える。 */
export const countStaffingByTimeSlots = (input: CountInput & { slots: readonly StaffingSlot[] }): StaffingSlotCount[] =>
  input.slots.flatMap((slot) => {
    if (slot.key.kind !== "time") return [];
    const { total, countByPositionId } = countTimeRange(
      input.shifts,
      timeToMinutes(slot.key.startTime),
      timeToMinutes(slot.key.endTime),
    );
    return [buildSlotCount(slot.key, total, countByPositionId, input.positionIds, slot.requirements)];
  });

/** 時間指定で日の型がない日: 1時間ごとの人数だけを数える。 */
export const countStaffingByHour = (
  input: CountInput & { startMinutes: number; endMinutes: number },
): StaffingSlotCount[] => {
  const result: StaffingSlotCount[] = [];
  const firstHour = Math.floor(input.startMinutes / HOUR_MINUTES) * HOUR_MINUTES;
  for (let hourStart = firstHour; hourStart < input.endMinutes; hourStart += HOUR_MINUTES) {
    const start = Math.max(hourStart, input.startMinutes);
    const end = Math.min(hourStart + HOUR_MINUTES, input.endMinutes);
    const { total, countByPositionId } = countTimeRange(input.shifts, start, end);
    result.push(
      buildSlotCount(
        {
          kind: "time",
          startTime: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
          endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
        },
        total,
        countByPositionId,
        input.positionIds,
        [],
      ),
    );
  }
  return result;
};

/** パターン選択: 勤務パターンごとに、ポジション別の人数と過不足を数える。休憩では人数を変えない。 */
export const countStaffingByShiftType = (
  input: CountInput & { optionIds: readonly string[]; slots: readonly StaffingSlot[] },
): StaffingSlotCount[] =>
  input.optionIds.map((optionId) => {
    const countByPositionId = new Map<string, number>();
    let total = 0;
    for (const shift of input.shifts) {
      const segment = shift.positions
        .filter(isCanonicalWorkPosition)
        .find((position) => position.shiftTypeOptionId === optionId);
      if (!segment) continue;
      total += 1;
      countByPositionId.set(segment.positionId, (countByPositionId.get(segment.positionId) ?? 0) + 1);
    }
    const slot = input.slots.find((item) => item.key.kind === "shiftType" && item.key.optionId === optionId);
    return buildSlotCount(
      { kind: "shiftType", optionId },
      total,
      countByPositionId,
      input.positionIds,
      slot?.requirements ?? [],
    );
  });

/** 日付選択: 1日の、ポジション別の人数と過不足を数える。休憩では人数を変えない。 */
export const countStaffingByDay = (input: CountInput & { slots: readonly StaffingSlot[] }): StaffingSlotCount => {
  const countByPositionId = new Map<string, number>();
  let total = 0;
  for (const shift of input.shifts) {
    const segment = shift.positions.find(isCanonicalWorkPosition);
    if (!segment) continue;
    total += 1;
    countByPositionId.set(segment.positionId, (countByPositionId.get(segment.positionId) ?? 0) + 1);
  }
  const slot = input.slots.find((item) => item.key.kind === "allDay");
  return buildSlotCount({ kind: "allDay" }, total, countByPositionId, input.positionIds, slot?.requirements ?? []);
};
