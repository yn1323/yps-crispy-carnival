import { formatDateWithWeekday } from "@/src/domains/shift/date";
import type { NewcomerOnlyPeriod } from "@/src/domains/shift/staffing";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";

// 確定の前の確認事項に出す、見習いだけの時間帯の一覧。

export type NewcomerOnlyItem = {
  key: string;
  date: string;
  /** 「11/23(月) キッチン 18:00–22:00」 */
  label: string;
};

/**
 * 見習いだけの時間帯を、日、ポジション、時間帯の単位の一覧にする。並びは受け取った順（日付、ポジション、時刻）のままにする。
 * ポジションが1つだけの店舗では、ポジション名を省く。
 */
export const buildNewcomerOnlyItems = (input: {
  periods: readonly NewcomerOnlyPeriod[];
  positions: ReadonlyArray<{ id: string; name: string }>;
  // パターン選択の勤務パターン。ほかの集め方では渡さない。
  options?: ReadonlyArray<{ id: string; name: string }>;
}): NewcomerOnlyItem[] => {
  const positionNameById = new Map(input.positions.map((position) => [position.id, position.name]));
  const optionNameById = new Map((input.options ?? []).map((option) => [option.id, option.name]));
  const showsPositionName = input.positions.length > 1;

  return input.periods.map((period) => {
    const scope = period.scope;
    const scopeLabel =
      scope.kind === "time"
        ? formatShiftClockTimeRange(scope.start, scope.end)
        : scope.kind === "shiftType"
          ? (optionNameById.get(scope.optionId) ?? "勤務パターン")
          : null;
    const scopeKey = scope.kind === "time" ? scope.start : scope.kind === "shiftType" ? scope.optionId : "allDay";
    const positionName = showsPositionName ? (positionNameById.get(period.positionId) ?? null) : null;
    return {
      key: `${period.date}-${period.positionId}-${scopeKey}`,
      date: period.date,
      label: [formatDateWithWeekday(period.date), positionName, scopeLabel].filter(Boolean).join(" "),
    };
  });
};
