import { getEffectiveBreaks } from "./breaks";
import type { NewcomerStaffIdsByPositionId } from "./positionSkills";
import { isCanonicalWorkPosition } from "./positions";
import { minutesToTime, timeToMinutes } from "./time";
import type { ShiftData, StaffingBar, StaffingSlot, StaffingSlotKey } from "./types";

// 区切りごと・ポジションごとの人数と、必要人数との過不足を数える純粋処理。
// 時間指定は、人数と必要人数が変わる時刻で区切った帯にする（buildPositionStaffingBands）。
// パターン選択は勤務パターンごと、日付選択は1日ごとに数える。

export type StaffingPositionCount = {
  positionId: string;
  count: number;
  // 必要人数。未設定のポジションはnull。
  required: number | null;
  // 足りない人数。足りている場合と必要人数が未設定の場合は0。
  shortage: number;
  // 必要人数より多い人数。多くない場合と必要人数が未設定の場合は0。
  excess: number;
  // そのポジションに1人以上いて、全員がそのポジションで見習いのときtrue。
  isNewcomerOnly: boolean;
};

export type StaffingSlotCount = {
  key: StaffingSlotKey;
  // 区切りにいる人数（ポジションを問わない）
  total: number;
  positions: StaffingPositionCount[];
  hasShortage: boolean;
  hasExcess: boolean;
};

type CountInput = {
  // 数える対象の日の勤務（シフト対象のスタッフ分）
  shifts: readonly ShiftData[];
  // 人数を出すポジションのID。並び順は表示順。
  positionIds: readonly string[];
  // ポジションごとの、見習いのstaffId。省略すると、見習いだけの印は付かない。
  newcomerStaffIdsByPositionId?: NewcomerStaffIdsByPositionId;
};

type MinuteRange = { start: number; end: number };
type PreparedShift = {
  staffId: string;
  segments: Array<MinuteRange & { positionId: string }>;
  breaks: MinuteRange[];
};

// 勤務区間と、実際に効く休憩を、分の範囲へ直す。時刻ごとの判定で同じ計算を繰り返さないために先に作る。
const prepareShift = (shift: ShiftData): PreparedShift => ({
  staffId: shift.staffId,
  segments: shift.positions.filter(isCanonicalWorkPosition).map((position) => ({
    start: timeToMinutes(position.start),
    end: timeToMinutes(position.end),
    positionId: position.positionId,
  })),
  breaks: getEffectiveBreaks(shift, { clipToWork: true }).map((range) => ({
    start: timeToMinutes(range.start),
    end: timeToMinutes(range.end),
  })),
});

// 見習いかどうかは、スタッフではなく、入っているポジションでの値で決める。
const isNewcomerOnly = (
  staffIds: readonly string[],
  positionId: string,
  newcomerStaffIdsByPositionId: NewcomerStaffIdsByPositionId | undefined,
): boolean => {
  const newcomerStaffIds = newcomerStaffIdsByPositionId?.get(positionId);
  return (
    newcomerStaffIds !== undefined && staffIds.length > 0 && staffIds.every((staffId) => newcomerStaffIds.has(staffId))
  );
};

const buildSlotCount = (
  key: StaffingSlotKey,
  staffIdsByPositionId: ReadonlyMap<string, string[]>,
  input: CountInput,
  requirements: StaffingSlot["requirements"],
): StaffingSlotCount => {
  let total = 0;
  for (const staffIds of staffIdsByPositionId.values()) total += staffIds.length;
  const requiredByPositionId = new Map(requirements.map((requirement) => [requirement.positionId, requirement.count]));
  const positions = input.positionIds.map((positionId) => {
    const staffIds = staffIdsByPositionId.get(positionId) ?? [];
    const count = staffIds.length;
    const required = requiredByPositionId.get(positionId) ?? null;
    return {
      positionId,
      count,
      required,
      shortage: required === null ? 0 : Math.max(0, required - count),
      excess: required === null ? 0 : Math.max(0, count - required),
      isNewcomerOnly: isNewcomerOnly(staffIds, positionId, input.newcomerStaffIdsByPositionId),
    };
  });
  return {
    key,
    total,
    positions,
    hasShortage: positions.some((position) => position.shortage > 0),
    hasExcess: positions.some((position) => position.excess > 0),
  };
};

const pushStaffId = (staffIdsByPositionId: Map<string, string[]>, positionId: string, staffId: string) => {
  const staffIds = staffIdsByPositionId.get(positionId);
  if (staffIds) staffIds.push(staffId);
  else staffIdsByPositionId.set(positionId, [staffId]);
};

/** パターン選択: 勤務パターンごとに、ポジション別の人数と過不足を数える。休憩では人数を変えない。 */
export const countStaffingByShiftType = (
  input: CountInput & { optionIds: readonly string[]; slots: readonly StaffingSlot[] },
): StaffingSlotCount[] =>
  input.optionIds.map((optionId) => {
    const staffIdsByPositionId = new Map<string, string[]>();
    for (const shift of input.shifts) {
      const segment = shift.positions
        .filter(isCanonicalWorkPosition)
        .find((position) => position.shiftTypeOptionId === optionId);
      if (!segment) continue;
      pushStaffId(staffIdsByPositionId, segment.positionId, shift.staffId);
    }
    const slot = input.slots.find((item) => item.key.kind === "shiftType" && item.key.optionId === optionId);
    return buildSlotCount({ kind: "shiftType", optionId }, staffIdsByPositionId, input, slot?.requirements ?? []);
  });

/** 日付選択: 1日の、ポジション別の人数と過不足を数える。休憩では人数を変えない。 */
export const countStaffingByDay = (input: CountInput & { slots: readonly StaffingSlot[] }): StaffingSlotCount => {
  const staffIdsByPositionId = new Map<string, string[]>();
  for (const shift of input.shifts) {
    const segment = shift.positions.find(isCanonicalWorkPosition);
    if (!segment) continue;
    pushStaffId(staffIdsByPositionId, segment.positionId, shift.staffId);
  }
  const slot = input.slots.find((item) => item.key.kind === "allDay");
  return buildSlotCount({ kind: "allDay" }, staffIdsByPositionId, input, slot?.requirements ?? []);
};

// ==========================================
// 時間指定: ポジションごとの帯
// ==========================================

export type PositionStaffingBandSegment = {
  start: string; // "11:00"
  end: string; // "14:00"
  // その区間に勤務していて、休憩中でない人数
  count: number;
  // 必要人数（重なるバーの本数）。未設定のポジションはnull。
  required: number | null;
  // 人数と必要人数の差。足りないと負、多いと正。未設定は0。
  diff: number;
  // その区間に1人以上いて、全員がそのポジションで見習いのときtrue。
  isNewcomerOnly: boolean;
};

export type PositionStaffingBand = {
  positionId: string;
  // 数える範囲にバーが1本でもかかるポジションはtrue。falseのポジションは過不足を出さない。
  isConfigured: boolean;
  // 数える範囲の端から端までを、すき間なく区切った区間。値が同じ隣どうしは1つにまとめる。
  segments: PositionStaffingBandSegment[];
};

/**
 * 時間指定: シフト表の帯のために、ポジションごとの人数と必要人数を、値が変わる時刻で区切る。
 * 区切る時刻は、バー、勤務、休憩の開始と終了を合わせたものである。休憩中の人は数えない。
 * 必要人数が未設定の日（barsがnull）と、範囲にバーが1本もかからないポジションは、未設定として過不足を出さない。
 */
export const buildPositionStaffingBands = (input: {
  // 数える対象の日の勤務（シフト対象で在籍しているスタッフ分）
  shifts: readonly ShiftData[];
  // その日の必要人数のバー。必要人数が未設定の日はnull。
  bars: readonly StaffingBar[] | null;
  // 帯を出すポジションのID。並び順は表示順。
  positionIds: readonly string[];
  // ポジションごとの、見習いのstaffId。省略すると、見習いだけの印は付かない。
  newcomerStaffIdsByPositionId?: NewcomerStaffIdsByPositionId;
  // 数える範囲（分）。募集の受付時間にあたる。
  startMinutes: number;
  endMinutes: number;
}): PositionStaffingBand[] => {
  const { startMinutes, endMinutes } = input;
  const isInside = (minute: number) => startMinutes < minute && minute < endMinutes;
  const barRanges = (input.bars ?? [])
    .map((bar) => ({ positionId: bar.positionId, start: timeToMinutes(bar.start), end: timeToMinutes(bar.end) }))
    .filter((bar) => bar.start < bar.end && bar.start < endMinutes && startMinutes < bar.end);
  const prepared = input.shifts.map(prepareShift);

  const points = new Set<number>(startMinutes < endMinutes ? [startMinutes, endMinutes] : []);
  for (const range of [...barRanges, ...prepared.flatMap((shift) => [...shift.segments, ...shift.breaks])]) {
    for (const minute of [range.start, range.end]) {
      if (isInside(minute)) points.add(minute);
    }
  }
  const sortedPoints = [...points].sort((a, b) => a - b);

  // 区切りごとに、その時点に勤務していて休憩中でない人を、ポジション別に集める。
  const intervals = sortedPoints.slice(0, -1).map((start, index) => {
    const staffIdsByPositionId = new Map<string, string[]>();
    for (const shift of prepared) {
      const segment = shift.segments.find((item) => item.start <= start && start < item.end);
      if (!segment) continue;
      if (shift.breaks.some((range) => range.start <= start && start < range.end)) continue;
      pushStaffId(staffIdsByPositionId, segment.positionId, shift.staffId);
    }
    return { start, end: sortedPoints[index + 1], staffIdsByPositionId };
  });

  return input.positionIds.map((positionId) => {
    const positionBars = barRanges.filter((bar) => bar.positionId === positionId);
    const isConfigured = positionBars.length > 0;
    const merged: Array<MinuteRange & Omit<PositionStaffingBandSegment, "start" | "end">> = [];
    for (const interval of intervals) {
      const staffIds = interval.staffIdsByPositionId.get(positionId) ?? [];
      const count = staffIds.length;
      const required = isConfigured
        ? positionBars.filter((bar) => bar.start <= interval.start && interval.start < bar.end).length
        : null;
      const newcomerOnly = isNewcomerOnly(staffIds, positionId, input.newcomerStaffIdsByPositionId);
      const previous = merged.at(-1);
      if (
        previous &&
        previous.count === count &&
        previous.required === required &&
        previous.isNewcomerOnly === newcomerOnly
      ) {
        previous.end = interval.end;
        continue;
      }
      merged.push({
        start: interval.start,
        end: interval.end,
        count,
        required,
        diff: required === null ? 0 : count - required,
        isNewcomerOnly: newcomerOnly,
      });
    }
    return {
      positionId,
      isConfigured,
      segments: merged.map((segment) => ({
        ...segment,
        start: minutesToTime(segment.start),
        end: minutesToTime(segment.end),
      })),
    };
  });
};

// ==========================================
// 見習いだけの時間帯
// ==========================================

/** あるポジションに入っている人が全員、そのポジションで見習いの区切り。確定の前の確認事項に使う。 */
export type NewcomerOnlyPeriod = {
  date: string;
  positionId: string;
  // 時間指定は時間帯、パターン選択は勤務パターン、日付選択は1日。
  scope: { kind: "time"; start: string; end: string } | { kind: "shiftType"; optionId: string } | { kind: "allDay" };
};

export type NewcomerOnlyPattern =
  // 数える範囲（分）。募集の受付時間にあたる。
  | { kind: "time"; startMinutes: number; endMinutes: number }
  | { kind: "shiftType"; optionIds: readonly string[] }
  | { kind: "dateOnly" };

/**
 * 見習いだけの区切りを、日、ポジション、区切りの単位で並べて返す。
 * 時間指定は、見習いだけの状態が続く時間を1件にまとめる（人数が変わっても、見習いだけである限り区切らない）。
 */
export const listNewcomerOnlyPeriods = (input: {
  // 数える対象の勤務（シフト対象で在籍しているスタッフ分）。日付は問わない。
  shifts: readonly ShiftData[];
  // 数える日。並び順は結果の並び順。定休日は渡さない。
  dates: readonly string[];
  positionIds: readonly string[];
  // ポジションごとの、見習いのstaffId。
  newcomerStaffIdsByPositionId: NewcomerStaffIdsByPositionId;
  pattern: NewcomerOnlyPattern;
}): NewcomerOnlyPeriod[] => {
  const { pattern, positionIds, newcomerStaffIdsByPositionId } = input;
  if (newcomerStaffIdsByPositionId.size === 0) return [];

  const shiftsByDate = new Map<string, ShiftData[]>();
  for (const shift of input.shifts) {
    const dayShifts = shiftsByDate.get(shift.date);
    if (dayShifts) dayShifts.push(shift);
    else shiftsByDate.set(shift.date, [shift]);
  }

  return input.dates.flatMap((date): NewcomerOnlyPeriod[] => {
    const shifts = shiftsByDate.get(date) ?? [];
    // 見習いとして入っている勤務がない日は、見習いだけの区切りもない。
    const hasNewcomerWork = shifts.some((shift) =>
      shift.positions.some((position) => newcomerStaffIdsByPositionId.get(position.positionId)?.has(shift.staffId)),
    );
    if (!hasNewcomerWork) return [];
    const base = { shifts, positionIds, newcomerStaffIdsByPositionId };

    if (pattern.kind === "time") {
      const bands = buildPositionStaffingBands({
        ...base,
        bars: null,
        startMinutes: pattern.startMinutes,
        endMinutes: pattern.endMinutes,
      });
      return bands.flatMap((band) => {
        // 区間は時刻の順にすき間なく並ぶため、終了と開始が同じなら続いている。
        const ranges: Array<{ start: string; end: string }> = [];
        for (const segment of band.segments) {
          if (!segment.isNewcomerOnly) continue;
          const last = ranges.at(-1);
          if (last && last.end === segment.start) last.end = segment.end;
          else ranges.push({ start: segment.start, end: segment.end });
        }
        return ranges.map((range) => ({
          date,
          positionId: band.positionId,
          scope: { kind: "time" as const, ...range },
        }));
      });
    }
    if (pattern.kind === "shiftType") {
      const slots = countStaffingByShiftType({ ...base, optionIds: pattern.optionIds, slots: [] });
      return pattern.optionIds.flatMap((optionId, index) =>
        slots[index].positions
          .filter((position) => position.isNewcomerOnly)
          .map((position) => ({
            date,
            positionId: position.positionId,
            scope: { kind: "shiftType" as const, optionId },
          })),
      );
    }
    return countStaffingByDay({ ...base, slots: [] })
      .positions.filter((position) => position.isNewcomerOnly)
      .map((position) => ({ date, positionId: position.positionId, scope: { kind: "allDay" as const } }));
  });
};
