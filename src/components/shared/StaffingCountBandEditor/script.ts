import {
  alignStaffingSegmentRange,
  type StaffingCountSpan,
  type StaffingSegmentRange,
} from "@/src/domains/shift/staffingSegments";
import {
  formatShiftClockTimeRange,
  generateShiftTimeOptions,
  minutesToTime,
  type ShiftTimeOption,
} from "@/src/domains/shift/time";
import type { TimeRange } from "@/src/domains/shift/types";

// 必要人数の「数字の帯」の編集部品に閉じる、表示用の純粋処理。

/** 編集部品が受け取るポジション。 */
export type StaffingCountBandPosition = {
  id: string;
  name: string;
  color: string;
};

/** 帯の出し方。wideは幅1024px以上、narrowはそれより狭い画面にあたる。 */
export type StaffingCountBandLayout = "wide" | "narrow";

/** 帯の寸法（px）。 */
export type BandMetrics = {
  /** ポジション名を置く、左の列の幅。narrowでは名前を帯の上に置くため0にする。 */
  labelColumnWidth: number;
  /** 「時間を選んで入れる」のボタンを置く、右の列の幅。narrowでは名前の横に置くため0にする。 */
  actionColumnWidth: number;
  /** 時間の軸の左右のパディング。端の時刻の見出しを収める。 */
  axisPadding: number;
  /** 1時間の幅の下限。これより狭くなる幅では、帯を横にスクロールさせる。 */
  minHourWidth: number;
  rowHeight: number;
};

/**
 * 画面の幅から、帯の寸法を決める。
 * 狭い画面は、ポジション名を帯の上に置き、帯を画面の幅いっぱいに使う。
 * 行は、指でも押せる44pxにそろえる。
 */
export const getBandMetrics = (layout: StaffingCountBandLayout): BandMetrics => ({
  ...(layout === "narrow"
    ? { labelColumnWidth: 0, actionColumnWidth: 0, axisPadding: 14, minHourWidth: 16 }
    : { labelColumnWidth: 120, actionColumnWidth: 44, axisPadding: 16, minHourWidth: 32 }),
  rowHeight: 44,
});

/**
 * 部品の幅から、1時間の幅を決める。
 * 幅に1日を収め、1時間が下限より狭くなるときは下限で止める（帯は横にスクロールする）。
 */
export const resolveBandHourWidth = (input: {
  /** 部品を置く入れ物の幅 */
  containerWidth: number;
  totalHours: number;
  metrics: Pick<BandMetrics, "labelColumnWidth" | "actionColumnWidth" | "axisPadding" | "minHourWidth">;
}): number => {
  const { containerWidth, totalHours, metrics } = input;
  const trackWidth = containerWidth - metrics.labelColumnWidth - metrics.actionColumnWidth;
  if (totalHours <= 0 || trackWidth <= 0) return metrics.minHourWidth;
  return Math.max(metrics.minHourWidth, (trackWidth - metrics.axisPadding * 2) / totalHours);
};

/** 受付時間（分）から、時間の軸の表示範囲を作る。表示は1時間単位へ広げ、編集できる範囲は受付時間のままにする。 */
export const buildBandTimeRange = (range: StaffingSegmentRange, unitMinutes: number): TimeRange => ({
  start: Math.floor(range.startMinutes / 60),
  end: Math.ceil(range.endMinutes / 60),
  unit: unitMinutes,
  editableStartMinutes: range.startMinutes,
  editableEndMinutes: range.endMinutes,
});

/**
 * 時間の軸の上の時刻（分）を、その時刻が入るマスの開始（分）にする。
 * マスは、範囲の開始から刻みごとに並ぶ。範囲の外の時刻は、端のマスへ寄せる。
 */
export const toCellStartMinutes = (input: {
  rawMinutes: number;
  range: StaffingSegmentRange;
  unitMinutes: number;
}): number => {
  const { rawMinutes, range, unitMinutes } = input;
  const cellIndex = Math.floor((rawMinutes - range.startMinutes) / unitMinutes);
  const lastIndex = Math.max(0, Math.floor((range.endMinutes - range.startMinutes) / unitMinutes) - 1);
  return range.startMinutes + Math.min(lastIndex, Math.max(0, cellIndex)) * unitMinutes;
};

/** なぞり始めたマスと、いまのマスから、選んだ範囲（分）を作る。どちらの向きになぞっても同じ範囲になる。 */
export const getSwipedRange = (input: {
  anchorMinutes: number;
  currentMinutes: number;
  unitMinutes: number;
}): { startMinutes: number; endMinutes: number } => ({
  startMinutes: Math.min(input.anchorMinutes, input.currentMinutes),
  endMinutes: Math.max(input.anchorMinutes, input.currentMinutes) + input.unitMinutes,
});

/** 受付時間の中で選べる時刻。受付時間が刻みにそろっていない場合は、刻みに乗る内側の時刻だけを出す。 */
export const buildBandTimeOptions = (range: StaffingSegmentRange, unitMinutes: number): ShiftTimeOption[] => {
  const aligned = alignStaffingSegmentRange(range, unitMinutes);
  return generateShiftTimeOptions({
    startMinutes: aligned.startMinutes,
    endMinutes: aligned.endMinutes,
    stepMinutes: unitMinutes,
  });
};

/**
 * 開始か終了を選び直したあとの範囲（分）を返す。
 * 開始を終了以降にした場合は、終了を開始の刻み1つ分あとへずらす。終了を開始以前にした場合は、開始を刻み1つ分前へずらす。
 */
export const keepRangeOrder = (input: {
  startMinutes: number;
  endMinutes: number;
  /** 選び直した側 */
  changed: "start" | "end";
  unitMinutes: number;
}): { startMinutes: number; endMinutes: number } => {
  const { startMinutes, endMinutes, changed, unitMinutes } = input;
  if (endMinutes - startMinutes >= unitMinutes) return { startMinutes, endMinutes };
  return changed === "start"
    ? { startMinutes, endMinutes: startMinutes + unitMinutes }
    : { startMinutes: endMinutes - unitMinutes, endMinutes };
};

/** 範囲（分）を「11:00〜14:00」の形にする。24時以降は「翌1:00」の形で出す。 */
export const formatBandTimeRange = (range: { startMinutes: number; endMinutes: number }): string =>
  formatShiftClockTimeRange(minutesToTime(range.startMinutes), minutesToTime(range.endMinutes));

/** 区間の読み上げの名前。「ホール 11:00〜14:00 3人」の形にする。 */
export const getSpanLabel = (positionName: string, span: StaffingCountSpan): string =>
  `${positionName} ${formatBandTimeRange(span)} ${span.count}人`;

/** 入力欄の文字を人数へ直す。全角の数字も受け付け、1から上限までの整数でなければnullにする。 */
export const parseCountInput = (text: string, maxCount: number): number | null => {
  const normalized = text.normalize("NFKC").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const count = Number(normalized);
  return count >= 1 && count <= maxCount ? count : null;
};

// 人数を「3人」の形で、区間の左に寄せて出せる幅の下限。これより狭い区間は、数字だけを中央に出す。
const COUNT_UNIT_MIN_WIDTH_PX = 34;

/** 区間の中に出す人数。幅が足りないとき（isCompact）は「人」を省くが、数字は必ず出す。 */
export const getCountLabel = (count: number, widthPx: number): { text: string; isCompact: boolean } => {
  const isCompact = widthPx < COUNT_UNIT_MIN_WIDTH_PX;
  return { text: isCompact ? String(count) : `${count}人`, isCompact };
};

// 区間の地色の濃さ（ポジションの色を白へ混ぜる割合）。
// 明るい今の色でも濃淡を読め、濃い以前の色でも濃い灰色の文字を読める範囲にとどめる。
const SEGMENT_COLOR_MIN_PERCENT = 30;
const SEGMENT_COLOR_MAX_PERCENT = 70;

/** 区間の地色。人数が多い区間ほどポジションの色を濃くする。 */
export const getSegmentBackground = (color: string, count: number, maxCount: number): string => {
  const ratio = maxCount <= 1 ? 0 : (Math.min(count, maxCount) - 1) / (maxCount - 1);
  const percent = Math.round(
    SEGMENT_COLOR_MIN_PERCENT + ratio * (SEGMENT_COLOR_MAX_PERCENT - SEGMENT_COLOR_MIN_PERCENT),
  );
  return `color-mix(in srgb, ${color} ${percent}%, white)`;
};

// なぞっている間の時刻の札の、幅の半分の見積もり。札を帯の左右からはみ出させないために使う。
const SWIPE_TIME_LABEL_HALF_WIDTH_PX = 52;

/** なぞっている間の時刻の札の、中心の横位置。選んだ範囲の中心に置き、帯の幅の内側で止める。 */
export const getSwipeTimeLabelCenter = (input: { left: number; width: number; trackWidth: number }): number => {
  const center = input.left + input.width / 2;
  const max = Math.max(SWIPE_TIME_LABEL_HALF_WIDTH_PX, input.trackWidth - SWIPE_TIME_LABEL_HALF_WIDTH_PX);
  return Math.min(max, Math.max(SWIPE_TIME_LABEL_HALF_WIDTH_PX, center));
};
