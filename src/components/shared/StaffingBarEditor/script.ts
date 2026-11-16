import {
  alignStaffingBarRange,
  type StaffingBarRange,
  type StaffingBarRejection,
  type StaffingBarRules,
} from "@/src/domains/shift/staffingBars";
import { generateShiftTimeOptions, minutesToTime, type ShiftTimeOption, timeToMinutes } from "@/src/domains/shift/time";
import type { StaffingBar, TimeRange } from "@/src/domains/shift/types";

// 必要人数のバーの編集部品に閉じる、表示用の純粋処理。

/** 編集部品が受け取るポジション。 */
export type StaffingBarEditorPosition = {
  id: string;
  name: string;
  color: string;
};

/** バーの表の出し方。wideは幅1024px以上、narrowはそれより狭い画面にあたる。 */
export type StaffingBarLayout = "wide" | "narrow";

/** バーの表の寸法（px）。 */
export type TimelineMetrics = {
  /** 行の番号を置く、左の列の幅。バーの表と「できあがる必要人数」で時間の軸をそろえるため、同じ値を使う。 */
  labelColumnWidth: number;
  /** 時間の軸の左右のパディング。端の時刻の見出しを収める。 */
  axisPadding: number;
  /** 1時間の幅の下限。これより狭くなる幅では、表を横にスクロールさせる。 */
  minHourWidth: number;
  rowHeight: number;
  barHeight: number;
};

/**
 * 画面の幅から、バーの表の寸法を決める。
 * 狭い画面は、左の列を行の番号だけの幅にし、1日を画面の幅へ収める。
 * 行は、指でも押せて、縦に並んだバーを見分けやすい44pxにそろえる。
 */
export const getTimelineMetrics = (layout: StaffingBarLayout): TimelineMetrics => ({
  ...(layout === "narrow"
    ? { labelColumnWidth: 20, axisPadding: 14, minHourWidth: 16 }
    : { labelColumnWidth: 120, axisPadding: 30, minHourWidth: 32 }),
  rowHeight: 44,
  barHeight: 32,
});

/**
 * 時間の軸を置く列の幅から、1時間の幅を決める。
 * 列の幅に1日を収め、1時間が下限より狭くなるときは下限で止める（表は横にスクロールする）。
 */
export const resolveHourWidth = (input: {
  trackWidth: number;
  totalHours: number;
  metrics: Pick<TimelineMetrics, "axisPadding" | "minHourWidth">;
}): number => {
  const { trackWidth, totalHours, metrics } = input;
  if (totalHours <= 0 || trackWidth <= 0) return metrics.minHourWidth;
  return Math.max(metrics.minHourWidth, (trackWidth - metrics.axisPadding * 2) / totalHours);
};

// バーの中に時刻（「15:00–16:00」）を切らずに出せる幅の下限。これより短いバーは、時刻を省く。
const BAR_LABEL_MIN_WIDTH_PX = 92;

/** 受付時間（分）から、時間の軸の表示範囲を作る。表示は1時間単位へ広げ、編集できる範囲は受付時間のままにする。 */
export const buildTimelineRange = (range: StaffingBarRange, unitMinutes: number): TimeRange => ({
  start: Math.floor(range.startMinutes / 60),
  end: Math.ceil(range.endMinutes / 60),
  unit: unitMinutes,
  editableStartMinutes: range.startMinutes,
  editableEndMinutes: range.endMinutes,
});

/** 時間の軸を置く列の、最小の幅。 */
export const getMinTrackWidth = (
  timeRange: TimeRange,
  metrics: Pick<TimelineMetrics, "axisPadding" | "minHourWidth">,
): number => (timeRange.end - timeRange.start) * metrics.minHourWidth + metrics.axisPadding * 2;

/** 時間の軸の表示範囲（分）にかかるバーか。受付時間を短くしたあとの、表示範囲の外だけにあるバーを除く。 */
export const isBarOnTimeline = (bar: Pick<StaffingBar, "start" | "end">, timeRange: TimeRange): boolean =>
  timeToMinutes(bar.start) < timeRange.end * 60 && timeRange.start * 60 < timeToMinutes(bar.end);

/** バーの中に時刻を出せる幅か。 */
export const canShowBarLabel = (widthPx: number): boolean => widthPx >= BAR_LABEL_MIN_WIDTH_PX;

/** 受付時間の中で選べる時刻。受付時間が刻みにそろっていない場合は、刻みに乗る内側の時刻だけを出す。 */
export const buildTimeOptions = (rules: Pick<StaffingBarRules, "range" | "unitMinutes">): ShiftTimeOption[] => {
  const range = alignStaffingBarRange(rules.range, rules.unitMinutes);
  return generateShiftTimeOptions({
    startMinutes: range.startMinutes,
    endMinutes: range.endMinutes,
    stepMinutes: rules.unitMinutes,
  });
};

/** 開始に選べる時刻。最小の長さが残るよう、受付時間の終わりだけを除く。いまの終了では絞らない。 */
export const getStartOptions = (options: readonly ShiftTimeOption[]): ShiftTimeOption[] => options.slice(0, -1);

/** 終了に選べる時刻。受付時間の始まりだけを除く。いまの開始では絞らない。 */
export const getEndOptions = (options: readonly ShiftTimeOption[]): ShiftTimeOption[] => options.slice(1);

/**
 * 開始か終了を選び直したあとの時刻を返す。
 * 開始を終了以降にした場合は、終了を開始の刻み1つ分あとへずらす。終了を開始以前にした場合は、開始を刻み1つ分前へずらす。
 */
export const keepBarTimeOrder = (input: {
  time: { start: string; end: string };
  /** 選び直した側 */
  changed: "start" | "end";
  unitMinutes: number;
}): { start: string; end: string } => {
  const { time, changed, unitMinutes } = input;
  const start = timeToMinutes(time.start);
  const end = timeToMinutes(time.end);
  if (end - start >= unitMinutes) return time;
  return changed === "start"
    ? { start: time.start, end: minutesToTime(start + unitMinutes) }
    : { start: minutesToTime(end - unitMinutes), end: time.end };
};

/** 人数の最小と最大を「1人」「1〜2人」の形にする。 */
const formatRequiredCountRange = (range: { min: number; max: number }): string =>
  range.min === range.max ? `${range.max}人` : `${range.min}〜${range.max}人`;

/** バーを足す前と足したあとの必要人数を「1人 → 3人」の形にする。時間の中で人数が違う場合は「1〜2人 → 3〜4人」にする。 */
export const formatRequiredCountChange = (current: { min: number; max: number }, addCount: number): string =>
  `${formatRequiredCountRange(current)} → ${formatRequiredCountRange({
    min: current.min + addCount,
    max: current.max + addCount,
  })}`;

/** 受け付けなかった操作の理由を、利用者へ見せる文にする。 */
export const getRejectionMessage = (
  reason: StaffingBarRejection,
  rules: Pick<StaffingBarRules, "unitMinutes" | "limits">,
): string => {
  switch (reason) {
    case "TOO_SHORT":
      return `終了は開始より${rules.unitMinutes}分以上あとにしてください`;
    case "NOT_ON_UNIT":
      return `時刻は${rules.unitMinutes}分単位で選んでください`;
    case "OUT_OF_RANGE":
      return "受付時間の中に置いてください";
    case "TOO_MANY_BARS":
      return `バーは全部で${rules.limits.maxBars}本までです`;
    case "TOO_MANY_CONCURRENT":
      return `同じ時間に重ねられるバーは${rules.limits.maxConcurrentPerPosition}本までです`;
    case "INVALID_COUNT":
      return "本数は1本以上にしてください";
    case "NOT_FOUND":
      return "バーが見つかりません。もう一度選んでください。";
  }
};

// 人数を「3人」の形で出せる幅と、数字だけなら出せる幅の下限。
const COUNT_LABEL_MIN_WIDTH_PX = 28;
const COUNT_NUMBER_MIN_WIDTH_PX = 12;

/**
 * 「できあがる必要人数」の区間の中に出す文字。幅が足りないときは省く。
 * 狭い画面（allowsNumberOnly）では、「人」を省いた数字だけでも出す。
 */
export const getRequiredCountLabel = (input: {
  count: number;
  widthPx: number;
  allowsNumberOnly: boolean;
}): string | null => {
  if (input.widthPx >= COUNT_LABEL_MIN_WIDTH_PX) return `${input.count}人`;
  if (input.allowsNumberOnly && input.widthPx >= COUNT_NUMBER_MIN_WIDTH_PX) return String(input.count);
  return null;
};

/**
 * 「できあがる必要人数」の帯の地色。人数が多い区間ほどポジションの色を濃くする。
 * 文字を濃い灰色で読めるよう、濃さは半分までにとどめる。
 */
export const getRequiredCountBackground = (color: string, count: number, maxCount: number): string => {
  const ratio = maxCount <= 1 ? 0 : (count - 1) / (maxCount - 1);
  const percent = Math.round(22 + ratio * 28);
  return `color-mix(in srgb, ${color} ${percent}%, white)`;
};

// なぞっている間の時刻の札の、幅の半分の見積もり。札を表の左右からはみ出させないために使う。
const DRAG_TIME_LABEL_HALF_WIDTH_PX = 52;

/** なぞっている間の時刻の札の、中心の横位置。プレビューの中心に置き、表の幅の内側で止める。 */
export const getDragTimeLabelCenter = (input: {
  previewLeft: number;
  previewWidth: number;
  trackWidth: number;
}): number => {
  const center = input.previewLeft + input.previewWidth / 2;
  const max = Math.max(DRAG_TIME_LABEL_HALF_WIDTH_PX, input.trackWidth - DRAG_TIME_LABEL_HALF_WIDTH_PX);
  return Math.min(max, Math.max(DRAG_TIME_LABEL_HALF_WIDTH_PX, center));
};
