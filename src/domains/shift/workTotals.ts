import { getWorkedMinutes } from "./breaks";
import { isCanonicalWorkPosition } from "./positions";
import type { ShiftData } from "./types";

// 人ごとの合計。時刻を持つ勤務は休憩を引いた時間、日付選択は出勤日数で数える。
// 表示にとどめ、超過や上限の判定はしない。

export type StaffWorkTotal = { kind: "minutes"; minutes: number } | { kind: "days"; days: number };

export const sumStaffWorkTotals = (
  shifts: readonly ShiftData[],
  unit: StaffWorkTotal["kind"],
): Map<string, StaffWorkTotal> => {
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    const hasWork = shift.positions.some(isCanonicalWorkPosition);
    if (!hasWork) continue;
    const amount = unit === "days" ? 1 : getWorkedMinutes(shift);
    totals.set(shift.staffId, (totals.get(shift.staffId) ?? 0) + amount);
  }
  return new Map(
    [...totals].map(([staffId, amount]) => [
      staffId,
      unit === "days" ? { kind: "days", days: amount } : { kind: "minutes", minutes: amount },
    ]),
  );
};

/** 合計の表示。450分は「7.5h」、3日は「3日」。 */
export const formatStaffWorkTotal = (total: StaffWorkTotal | undefined): string => {
  if (!total) return "-";
  if (total.kind === "days") return `${total.days}日`;
  const hours = Math.round((total.minutes / 60) * 100) / 100;
  return `${hours}h`;
};
