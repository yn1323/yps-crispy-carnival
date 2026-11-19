import type { MinuteRange } from "./breaks";
import type { PositionStaffingBand, PositionStaffingBandSegment } from "./staffing";
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
 * その日の充足率（%）を、整数に切り捨てて返す。
 * Σ min(人数, 必要人数) × 区間の長さ ÷ Σ 必要人数 × 区間の長さ で求める。
 * 多い区間で余った人数は足さない。ほかの時間の不足を隠さないためである。
 * 必要人数が1つもない日はnullを返す。
 */
export const calculateFulfillmentPercent = (
  bands: ReadonlyArray<Pick<PositionStaffingBand, "segments">>,
): number | null => {
  let filled = 0;
  let required = 0;
  for (const band of bands) {
    for (const segment of band.segments) {
      if (segment.required === null) continue;
      const length = timeToMinutes(segment.end) - timeToMinutes(segment.start);
      filled += Math.min(segment.count, segment.required) * length;
      required += segment.required * length;
    }
  }
  return required === 0 ? null : Math.floor((filled * 100) / required);
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
