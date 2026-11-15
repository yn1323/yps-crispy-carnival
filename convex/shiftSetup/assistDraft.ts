import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { timeToMinutes } from "../_lib/time";
import {
  buildDefaultDayTemplateSlotKeys,
  type DayTemplateSlotKey,
  SHIFT_SETUP_WEEKDAYS,
  type ShiftSetupWeekday,
} from "./dayTemplates";

// AIサポートの下書きを作る純粋処理。
// いまは実際のAIにつながず、区切りを提出方法から作り、必要人数をランダムな値で埋める。
// 実際のAIへつなぐときは、この関数の呼び出しを置き換える。

export type ShiftSetupDraftTemplate<PositionId extends string = string> = {
  name: string;
  weekdays: ShiftSetupWeekday[];
  slots: Array<{ key: DayTemplateSlotKey; requirements: Array<{ positionId: PositionId; count: number }> }>;
};

type BuildRandomShiftSetupDraftInput<PositionId extends string> = {
  pattern: ShiftSubmissionPattern;
  positionIds: readonly PositionId[];
  regularClosedDays: readonly ShiftSetupWeekday[];
  /** 0以上1未満の値を返す乱数。テストでは固定値を渡す。 */
  random: () => number;
};

const WEEKDAY_GROUPS: ReadonlyArray<{ name: string; weekdays: readonly ShiftSetupWeekday[]; extra: number }> = [
  { name: "平日", weekdays: ["mon", "tue", "wed", "thu"], extra: 0 },
  { name: "週末", weekdays: ["fri", "sat", "sun"], extra: 1 },
];

// 時間指定の受付時間を区切る候補。店の開店・昼・夕方・夜の境目として一般的な時刻を使う。
const TIME_BAND_BOUNDARIES = ["11:00", "14:00", "17:00", "21:00"];
const DRAFT_COUNT_MIN = 1;
const DRAFT_COUNT_MAX = 3;

function buildDraftSlotKeys(pattern: ShiftSubmissionPattern): DayTemplateSlotKey[] {
  if (pattern.kind !== "time") return buildDefaultDayTemplateSlotKeys(pattern);

  const start = timeToMinutes(pattern.startTime);
  const end = timeToMinutes(pattern.endTime);
  const boundaries = TIME_BAND_BOUNDARIES.filter((time) => timeToMinutes(time) > start && timeToMinutes(time) < end);
  const edges = [pattern.startTime, ...boundaries, pattern.endTime];
  return edges.slice(0, -1).map((startTime, index) => ({ kind: "time", startTime, endTime: edges[index + 1] }));
}

function randomCount(random: () => number, extra: number): number {
  const span = DRAFT_COUNT_MAX - DRAFT_COUNT_MIN + 1;
  const value = Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
  return DRAFT_COUNT_MIN + value + extra;
}

export function buildRandomShiftSetupDraft<PositionId extends string>(
  input: BuildRandomShiftSetupDraftInput<PositionId>,
): ShiftSetupDraftTemplate<PositionId>[] {
  const closedDays = new Set(input.regularClosedDays);
  const slotKeys = buildDraftSlotKeys(input.pattern);

  return WEEKDAY_GROUPS.flatMap((group) => {
    const weekdays = SHIFT_SETUP_WEEKDAYS.filter((day) => group.weekdays.includes(day) && !closedDays.has(day));
    if (weekdays.length === 0) return [];
    return [
      {
        name: group.name,
        weekdays,
        slots: slotKeys.map((key) => ({
          key,
          requirements: input.positionIds.map((positionId) => ({
            positionId,
            count: randomCount(input.random, group.extra),
          })),
        })),
      },
    ];
  });
}
