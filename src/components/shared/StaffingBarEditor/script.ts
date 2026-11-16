import { TIME_AXIS_PADDING_PX } from "@/src/components/shared/ShiftTimeline/constants";
import {
  alignStaffingBarRange,
  type StaffingBarRange,
  type StaffingBarRejection,
  type StaffingBarRules,
} from "@/src/domains/shift/staffingBars";
import { generateShiftTimeOptions, type ShiftTimeOption, timeToMinutes } from "@/src/domains/shift/time";
import type { StaffingBar, TimeRange } from "@/src/domains/shift/types";

// 必要人数のバーの編集部品に閉じる、表示用の純粋処理。

/** 編集部品が受け取るポジション。 */
export type StaffingBarEditorPosition = {
  id: string;
  name: string;
  color: string;
};

// 行の番号とポジション名を置く、左の列の幅。バーの表と「できあがる必要人数」で時間の軸をそろえるため、同じ値を使う。
export const LABEL_COLUMN_WIDTH_PX = 120;
// バーの表の行の高さ。シフト表（48px）より詰める。
export const BAR_ROW_HEIGHT_PX = 32;
export const BAR_HEIGHT_PX = 24;
// 1時間の幅の下限。これより狭くなる幅では、表を横にスクロールさせる。
export const MIN_HOUR_WIDTH_PX = 32;
// バーの中に時刻を出せる幅の下限。これより短いバーは、時刻を省く。
const BAR_LABEL_MIN_WIDTH_PX = 84;

/** 受付時間（分）から、時間の軸の表示範囲を作る。表示は1時間単位へ広げ、編集できる範囲は受付時間のままにする。 */
export const buildTimelineRange = (range: StaffingBarRange, unitMinutes: number): TimeRange => ({
  start: Math.floor(range.startMinutes / 60),
  end: Math.ceil(range.endMinutes / 60),
  unit: unitMinutes,
  editableStartMinutes: range.startMinutes,
  editableEndMinutes: range.endMinutes,
});

/** 時間の軸を置く列の、最小の幅。 */
export const getMinTrackWidth = (timeRange: TimeRange): number =>
  (timeRange.end - timeRange.start) * MIN_HOUR_WIDTH_PX + TIME_AXIS_PADDING_PX * 2;

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

/** 開始に選べる時刻。終了より前で、最小の長さが残る時刻だけにする。 */
export const getStartOptions = (options: readonly ShiftTimeOption[], end: string): ShiftTimeOption[] =>
  options.filter((option) => timeToMinutes(option.value) < timeToMinutes(end));

/** 終了に選べる時刻。開始より後の時刻だけにする。 */
export const getEndOptions = (options: readonly ShiftTimeOption[], start: string): ShiftTimeOption[] =>
  options.filter((option) => timeToMinutes(option.value) > timeToMinutes(start));

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

/**
 * 「できあがる必要人数」の帯の地色。人数が多い区間ほどポジションの色を濃くする。
 * 文字を濃い灰色で読めるよう、濃さは半分までにとどめる。
 */
export const getRequiredCountBackground = (color: string, count: number, maxCount: number): string => {
  const ratio = maxCount <= 1 ? 0 : (count - 1) / (maxCount - 1);
  const percent = Math.round(22 + ratio * 28);
  return `color-mix(in srgb, ${color} ${percent}%, white)`;
};
