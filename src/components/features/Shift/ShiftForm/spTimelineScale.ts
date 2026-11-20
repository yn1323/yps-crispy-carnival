import { getDisplayEndMinutes, getDisplayStartMinutes } from "@/src/components/shared/ShiftTimeline/timelineGeometry";
import type { MinuteRange } from "@/src/domains/shift/breaks";
import type { TimeRange } from "@/src/domains/shift/types";

// 時間指定のスマートフォンの日別表示で、時刻を横の位置へ直す物差し。
// スタッフのカードのバー、充足の帯、時刻の軸は、すべてこの物差しと余白で描き、上下で同じ時刻を同じ位置にそろえる。

/** 一覧の入れ物の左右の余白（px）。 */
export const SP_LIST_PADDING_X_PX = 12;
/** スタッフのカードの枠線の太さ（px）。 */
export const SP_CARD_BORDER_PX = 1;
/** スタッフのカードの左右の内側の余白（px）。 */
export const SP_CARD_PADDING_X_PX = 12;
/** 画面の端から、カードのバーの両端までの距離（px）。充足の帯と時刻の軸も、この内側に描く。 */
export const SP_TIMELINE_INSET_X_PX = SP_LIST_PADDING_X_PX + SP_CARD_BORDER_PX + SP_CARD_PADDING_X_PX;

/**
 * 枠線の太さに合わせた、カードの左右の内側の余白（px）。
 * 枠線が太くなっても、バーの両端の位置を変えない。
 */
export const getSPCardPaddingXPx = (borderPx: number): number => SP_CARD_PADDING_X_PX + SP_CARD_BORDER_PX - borderPx;

/** 物差しの左端から右端までの時間。店舗の表示する時間（受付時間を含む）にする。 */
export const toSPTimelineRange = (timeRange: TimeRange): MinuteRange => ({
  start: getDisplayStartMinutes(timeRange),
  end: getDisplayEndMinutes(timeRange),
});

/** 時刻（分）を、物差しの左端からの位置（%）へ直す。 */
export const minutesToTimelinePercent = (minutes: number, range: MinuteRange): number =>
  ((minutes - range.start) / (range.end - range.start)) * 100;
