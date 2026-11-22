import type { MinuteRange } from "./breaks";
import type { PositionStaffingBandSegment } from "./staffing";
import { timeToMinutes } from "./time";
import type { StaffingBar } from "./types";

// 時間指定の「充足の帯」と充足率のための純粋処理。
// 人数と必要人数の区切りは buildPositionStaffingBands が作る。ここでは、その区切りを状態ごとにつなげ、充足率を出す。

/** 区間の状態。指定なし（unset）は、必要人数がなく、だれも入っていない時間である。 */
export type FulfillmentState = "shortage" | "even" | "excess" | "unset";

export type FulfillmentSegment = MinuteRange & {
  state: FulfillmentState;
  /** 人数と必要人数の差。足りないと負、多いと正。ちょうどと指定なしは0。 */
  diff: number;
};

/**
 * 人数と必要人数から、区間の状態を決める。
 * 必要人数が0の時間は、だれもいなければ指定なし、人が入っていれば多いとする。
 */
export const resolveFulfillmentState = (count: number, required: number | null): FulfillmentState => {
  if (required === null || (required === 0 && count === 0)) return "unset";
  if (count < required) return "shortage";
  return count > required ? "excess" : "even";
};

/**
 * 帯の区間を、状態と差が同じ隣どうしでつなげる。
 * 人数と必要人数がどちらも変わっても、差が同じなら1つの区間にする（1/3と0/2は、どちらも2人不足）。
 */
export const buildFulfillmentSegments = (segments: readonly PositionStaffingBandSegment[]): FulfillmentSegment[] => {
  const merged: FulfillmentSegment[] = [];
  for (const segment of segments) {
    const state = resolveFulfillmentState(segment.count, segment.required);
    const diff = state === "unset" ? 0 : segment.count - (segment.required ?? 0);
    const startMinutes = timeToMinutes(segment.start);
    const endMinutes = timeToMinutes(segment.end);
    const previous = merged.at(-1);
    if (previous && previous.state === state && previous.diff === diff && previous.end === startMinutes) {
      previous.end = endMinutes;
      continue;
    }
    merged.push({ start: startMinutes, end: endMinutes, state, diff });
  }
  return merged;
};

/**
 * 足りている量と、多い分も含めた量から充足率（%）を整数に切り捨てて返す。
 * 不足が1つでもあれば、多い分を足さずに100%未満で返す。ほかの時間の不足を隠さないためである。
 * 不足がなければ、多い分も足して100%以上で返す。必要の合計が0ならnullを返す。
 */
const toFulfillmentPercent = ({ filled, total, required }: { filled: number; total: number; required: number }) => {
  if (required === 0) return null;
  return Math.floor(((filled === required ? total : filled) * 100) / required);
};

/**
 * その日の充足率（%）を、整数に切り捨てて返す。
 * Σ min(人数, 必要人数) × 区間の長さ ÷ Σ 必要人数 × 区間の長さ で求める。
 * 多い区間で余った人数は、ほかの時間の不足に足さない。不足がない日だけ、多い分も足して100%を超えて返す。
 * 必要人数が1つもない日はnullを返す。
 */
export const calculateFulfillmentPercent = (
  bands: ReadonlyArray<{
    segments: ReadonlyArray<Pick<PositionStaffingBandSegment, "start" | "end" | "count" | "required">>;
  }>,
): number | null => {
  let filled = 0;
  let total = 0;
  let required = 0;
  for (const band of bands) {
    for (const segment of band.segments) {
      if (segment.required === null) continue;
      const length = timeToMinutes(segment.end) - timeToMinutes(segment.start);
      filled += Math.min(segment.count, segment.required) * length;
      total += segment.count * length;
      required += segment.required * length;
    }
  }
  return toFulfillmentPercent({ filled, total, required });
};

/**
 * パターン選択の、その日の充足率（%）。勤務パターンを「開始から終了までの区間」として、時間指定と同じ式で求める。
 * 対象は、必要人数のある「勤務パターン×ポジション」のすべてである。必要人数が1つもない日はnullを返す。
 */
export const calculateShiftTypeFulfillmentPercent = (
  slots: ReadonlyArray<{
    startTime: string;
    endTime: string;
    positions: ReadonlyArray<{ count: number; required: number | null }>;
  }>,
): number | null =>
  calculateFulfillmentPercent(
    slots.map((slot) => ({
      segments: slot.positions.map((position) => ({
        start: slot.startTime,
        end: slot.endTime,
        count: position.count,
        required: position.required,
      })),
    })),
  );

/**
 * 日付選択の充足率（%）を、整数に切り捨てて返す。週の見出しには表示中の週の全日、スマートフォンにはその日の1日分を渡す。
 * Σ min(配置, 必要) ÷ Σ 必要 で求め、対象は必要人数のある「日×ポジション」のすべてである。
 * 多い分は、ほかの不足に足さない。不足がないときだけ、多い分も足して100%を超えて返す。
 * 日付選択の勤務は時刻を持たないため、時間の長さでは重み付けしない。必要人数が1つもなければnullを返す。
 */
export const calculateDateOnlyFulfillmentPercent = (
  days: ReadonlyArray<{ positions: ReadonlyArray<{ count: number; required: number | null }> }>,
): number | null => {
  let filled = 0;
  let total = 0;
  let required = 0;
  for (const day of days) {
    for (const position of day.positions) {
      if (position.required === null) continue;
      filled += Math.min(position.count, position.required);
      total += position.count;
      required += position.required;
    }
  }
  return toFulfillmentPercent({ filled, total, required });
};

/**
 * その日の必要人数の、最初の開始から最後の終了までを返す。範囲（受付時間）の外は切り落とす。
 * 範囲の中に必要人数が1つもなければnullを返す。
 */
export const getStaffingBarsRange = (bars: readonly StaffingBar[], limit: MinuteRange): MinuteRange | null => {
  const ranges = bars
    .map((bar) => ({
      start: Math.max(timeToMinutes(bar.start), limit.start),
      end: Math.min(timeToMinutes(bar.end), limit.end),
    }))
    .filter((range) => range.start < range.end);
  if (ranges.length === 0) return null;
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  };
};
