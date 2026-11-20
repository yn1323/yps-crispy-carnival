import { getEditableEndMinutes, getEditableStartMinutes } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { MinuteRange } from "@/src/domains/shift/breaks";
import { toStaffingDisplayPositions } from "@/src/domains/shift/operations";
import { buildPositionStaffingBands } from "@/src/domains/shift/staffing";
import {
  buildFulfillmentSegments,
  calculateFulfillmentPercent,
  type FulfillmentSegment,
  type FulfillmentState,
  getStaffingBarsRange,
} from "@/src/domains/shift/staffingFulfillment";
import { formatShiftClockTimeRange, minutesToTime } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, TimeRange } from "@/src/domains/shift/types";
import { toSPTimelineRange } from "./spTimelineScale";
import { toStaffingBars } from "./staffingPresentation";
import type { ShiftFormStaffingDay } from "./types";

// 時間指定の「充足の帯」と充足率を、画面へ出す形にまとめる。

/** 不足の濃さ。足りない人数が多いほど濃い。1人は1、2人は2、3人以上は3。 */
export type ShortageLevel = 1 | 2 | 3;

export const getShortageLevel = (shortage: number): ShortageLevel => (shortage >= 3 ? 3 : shortage === 2 ? 2 : 1);

// 不足は、足りない人数が多いほど濃い赤にする。スタッフのカードより目立たないよう、1人と2人は薄い地にとどめ、
// いちばん濃い段だけ文字を白にする。
const SHORTAGE_STYLES: Record<ShortageLevel, { bg: string; color: string }> = {
  1: { bg: "red.100", color: "red.700" },
  2: { bg: "red.200", color: "red.700" },
  3: { bg: "red.500", color: "white" },
};

/** 区間の地色と文字色。多い時間の紫は、ポジションの青と橙、警告の色と重ならない色として選んでいる。 */
export const getFulfillmentSegmentStyle = (
  segment: Pick<FulfillmentSegmentView, "state" | "shortageLevel">,
): { bg: string; color: string } => {
  if (segment.state === "shortage") return SHORTAGE_STYLES[segment.shortageLevel ?? 1];
  if (segment.state === "even") return { bg: "green.100", color: "green.800" };
  if (segment.state === "excess") return { bg: "purple.100", color: "purple.800" };
  return { bg: "gray.200", color: "gray.700" };
};

/** 充足率の文字と進捗バーの色。100%は緑、100%未満は不足と同じ赤にする。 */
export const getFulfillmentPercentStyle = (percent: number): { color: string; barColor: string } =>
  percent >= 100 ? { color: "green.700", barColor: "green.500" } : { color: "#be123c", barColor: "#fb7185" };

export type FulfillmentSegmentView = {
  key: string;
  startMinutes: number;
  endMinutes: number;
  state: FulfillmentState;
  /** 不足の濃さ。不足でない区間はnull。 */
  shortageLevel: ShortageLevel | null;
  /** 帯に出す文字。不足は足りない人数、それ以外はnull。幅が足りない区間では、帯の側で隠す。 */
  label: string | null;
  /** 読み上げに使う全文。「09:00〜10:00 2人不足」 */
  description: string;
};

export type FulfillmentBandView = {
  positionId: string;
  name: string;
  color: string;
  segments: FulfillmentSegmentView[];
};

export type FulfillmentTick = {
  minutes: number;
  /** 「9」「24」「翌3」 */
  label: string;
};

export type DayFulfillmentView = {
  /** 充足率（%）。整数に切り捨ててある。 */
  percent: number;
  /** 帯に出す範囲。その日の必要人数の、最初の開始から最後の終了まで。 */
  range: MinuteRange;
  /** 帯と時間の軸を置く物差しの範囲。スタッフのカードのバーと同じ、店舗の表示する時間。 */
  timelineRange: MinuteRange;
  /** 時間の軸に出す時刻。物差しの範囲の中で、3時間ごと。 */
  ticks: FulfillmentTick[];
  /** 帯の後ろに引く縦線の時刻（分）。物差しの範囲の中で、1時間ごと。 */
  hourLines: number[];
  /** 必要人数を入れてあるポジションの帯。入れていないポジションは含めない。 */
  bands: FulfillmentBandView[];
  /** 帯の上にポジション名を出すか。ポジションが1つだけの店舗では出さない。 */
  showsPositionNames: boolean;
};

const TICK_INTERVAL_HOURS = 3;

/**
 * 範囲の中の、3時間ごとの時刻を返す。範囲の両端がちょうど3時間ごとの時刻なら、両端も含める。
 * 文字は時だけにする。24時より後は、PCの時間の軸と同じく「翌3」の形にする。
 */
export const listFulfillmentTicks = (range: MinuteRange): FulfillmentTick[] => {
  const ticks: FulfillmentTick[] = [];
  const first = Math.ceil(range.start / 60 / TICK_INTERVAL_HOURS) * TICK_INTERVAL_HOURS;
  for (let hour = first; hour * 60 <= range.end; hour += TICK_INTERVAL_HOURS) {
    ticks.push({ minutes: hour * 60, label: hour > 24 ? `翌${hour - 24}` : `${hour}` });
  }
  return ticks;
};

/** 範囲の中の、ちょうどの時（1時間ごと）を分で返す。範囲の両端がちょうどの時なら、両端も含める。 */
export const listFulfillmentHourLines = (range: MinuteRange): number[] => {
  const lines: number[] = [];
  for (let minutes = Math.ceil(range.start / 60) * 60; minutes <= range.end; minutes += 60) lines.push(minutes);
  return lines;
};

const describeState = (segment: FulfillmentSegment): string => {
  if (segment.state === "shortage") return `${-segment.diff}人不足`;
  if (segment.state === "excess") return `${segment.diff}人多い`;
  return segment.state === "even" ? "ちょうど" : "必要人数の指定なし";
};

const toSegmentView = (segment: FulfillmentSegment): FulfillmentSegmentView => {
  const shortage = segment.state === "shortage" ? -segment.diff : 0;
  const timeLabel = formatShiftClockTimeRange(minutesToTime(segment.start), minutesToTime(segment.end));
  return {
    key: `${segment.start}`,
    startMinutes: segment.start,
    endMinutes: segment.end,
    state: segment.state,
    shortageLevel: shortage > 0 ? getShortageLevel(shortage) : null,
    label: shortage > 0 ? `${shortage}` : null,
    description: `${timeLabel} ${describeState(segment)}`,
  };
};

/**
 * その日の充足率と、ポジションごとの充足の帯を返す。
 * 時間指定の必要人数が1つもない日はnullを返し、充足の欄ごと出さない。
 */
export const buildDayFulfillmentView = (input: {
  // その日の勤務（シフト対象で在籍しているスタッフ分）
  shifts: readonly ShiftData[];
  positions: readonly PositionType[];
  timeRange: TimeRange;
  // サーバーが解決した、その日の必要人数。
  day: ShiftFormStaffingDay | undefined;
}): DayFulfillmentView | null => {
  // 帯に出す名前は、人数の表示と同じにする。ポジションを分けていない店舗では、仮の名前を出さない。
  const positionById = new Map(toStaffingDisplayPositions(input.positions).map((position) => [position.id, position]));
  // 店舗のポジションにないバーは、帯にも充足率にも入らない。帯の範囲にも入れない。
  const bars = toStaffingBars(input.day?.requirements)?.filter((bar) => positionById.has(bar.positionId));
  if (!bars) return null;
  const range = getStaffingBarsRange(bars, {
    start: getEditableStartMinutes(input.timeRange),
    end: getEditableEndMinutes(input.timeRange),
  });
  if (!range) return null;

  const bands = buildPositionStaffingBands({
    shifts: input.shifts,
    bars,
    positionIds: input.positions.map((position) => position.id),
    startMinutes: range.start,
    endMinutes: range.end,
  });
  const percent = calculateFulfillmentPercent(bands);
  if (percent === null) return null;

  const timelineRange = toSPTimelineRange(input.timeRange);
  return {
    percent,
    range,
    timelineRange,
    ticks: listFulfillmentTicks(timelineRange),
    hourLines: listFulfillmentHourLines(timelineRange),
    bands: bands.flatMap((band) => {
      const position = positionById.get(band.positionId);
      if (!position || !band.isConfigured) return [];
      return [
        {
          positionId: position.id,
          name: position.name,
          color: position.color,
          segments: buildFulfillmentSegments(band.segments).map(toSegmentView),
        },
      ];
    }),
    showsPositionNames: input.positions.length > 1,
  };
};
