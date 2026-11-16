import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { minutesToTime, timeToMinutes } from "../_lib/time";
import { SHIFT_BOARD_TIME_UNIT_MINUTES } from "../constants";
import {
  compareStaffingBars,
  type DayRequirements,
  SHIFT_SETUP_WEEKDAYS,
  type ShiftSetupWeekday,
  type StaffingBar,
} from "./dayTemplates";

// AIサポートの下書きを作る純粋処理。
// いまは実際のAIにつながず、必要人数をランダムな値で埋める。
// 実際のAIへつなぐときは、この関数の呼び出しを置き換える。

export type ShiftSetupDraftTemplate<PositionId extends string = string> = {
  name: string;
  weekdays: ShiftSetupWeekday[];
  appliesToHolidays: boolean;
  requirements: DayRequirements<PositionId>;
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

// 時間指定で人を足す時間帯。昼と夜の混む時間として一般的な時刻を使う。
const BUSY_TIME_BANDS = [
  { startTime: "11:00", endTime: "14:00" },
  { startTime: "17:00", endTime: "21:00" },
] as const;
// 混む時間帯へ足すバーの本数（週末は1本多い）。通しの1本と合わせても、同時に重ねられる上限に届かない。
const DRAFT_EXTRA_BAR_MAX = 2;
const DRAFT_COUNT_MIN = 1;
const DRAFT_COUNT_MAX = 3;

/** min以上max以下の整数を、乱数から選ぶ。 */
function randomInteger(random: () => number, min: number, max: number): number {
  const span = max - min + 1;
  return min + Math.min(span - 1, Math.max(0, Math.floor(random() * span)));
}

/** 時間帯を、受付時間の内側の刻みにそろった範囲へ切る。刻み1つ分に満たない場合はnullを返す。 */
function clipBandToUnit(
  band: { startTime: string; endTime: string },
  range: { startTime: string; endTime: string },
): { startTime: string; endTime: string } | null {
  const unit = SHIFT_BOARD_TIME_UNIT_MINUTES;
  const start = Math.ceil(Math.max(timeToMinutes(band.startTime), timeToMinutes(range.startTime)) / unit) * unit;
  const end = Math.floor(Math.min(timeToMinutes(band.endTime), timeToMinutes(range.endTime)) / unit) * unit;
  return end - start >= unit ? { startTime: minutesToTime(start), endTime: minutesToTime(end) } : null;
}

/**
 * 時間指定の下書き。ポジションごとに、受付時間いっぱいのバーを1本置き、
 * 昼と夜の時間帯（受付時間に収まる範囲）へランダムな本数のバーを足す。
 */
function buildDraftBars<PositionId extends string>(
  pattern: { startTime: string; endTime: string },
  positionIds: readonly PositionId[],
  random: () => number,
  extra: number,
): StaffingBar<PositionId>[] {
  const fullDay = clipBandToUnit(pattern, pattern);
  const busyBands = BUSY_TIME_BANDS.flatMap((band) => clipBandToUnit(band, pattern) ?? []);
  return positionIds
    .flatMap((positionId) => [
      ...(fullDay ? [{ positionId, ...fullDay }] : []),
      ...busyBands.flatMap((band) =>
        Array.from({ length: randomInteger(random, 0, DRAFT_EXTRA_BAR_MAX) + extra }, () => ({ positionId, ...band })),
      ),
    ])
    .sort(compareStaffingBars);
}

function buildDraftRequirements<PositionId extends string>(
  input: BuildRandomShiftSetupDraftInput<PositionId>,
  extra: number,
): DayRequirements<PositionId> {
  const { pattern, positionIds, random } = input;
  const toCounts = () =>
    positionIds.map((positionId) => ({
      positionId,
      count: randomInteger(random, DRAFT_COUNT_MIN, DRAFT_COUNT_MAX) + extra,
    }));

  if (pattern.kind === "time") return { kind: "time", bars: buildDraftBars(pattern, positionIds, random, extra) };
  if (pattern.kind === "shiftType") {
    return {
      kind: "shiftType",
      options: pattern.options.map((option) => ({ optionId: option.id, counts: toCounts() })),
    };
  }
  return { kind: "dateOnly", counts: toCounts() };
}

export function buildRandomShiftSetupDraft<PositionId extends string>(
  input: BuildRandomShiftSetupDraftInput<PositionId>,
): ShiftSetupDraftTemplate<PositionId>[] {
  const closedDays = new Set(input.regularClosedDays);

  return WEEKDAY_GROUPS.flatMap((group) => {
    const weekdays = SHIFT_SETUP_WEEKDAYS.filter((day) => group.weekdays.includes(day) && !closedDays.has(day));
    if (weekdays.length === 0) return [];
    return [
      {
        name: group.name,
        weekdays,
        // 祝日に使う型は、店舗が自分で選ぶ。
        appliesToHolidays: false,
        requirements: buildDraftRequirements(input, group.extra),
      },
    ];
  });
}
