import { describe, expect, it } from "vitest";
import {
  getSPCardPaddingXPx,
  minutesToTimelinePercent,
  SP_CARD_BORDER_PX,
  SP_CARD_PADDING_X_PX,
  toSPTimelineRange,
} from "./spTimelineScale";

describe("spTimelineScale", () => {
  it("物差しは、店舗の表示する時間の始まりから終わりまでを分で持つ", () => {
    expect(toSPTimelineRange({ start: 9, end: 22, unit: 30 })).toEqual({ start: 540, end: 1320 });
    // 受付時間が表示の時間より狭くても、物差しは表示の時間に合わせる。
    expect(
      toSPTimelineRange({ start: 6, end: 24, unit: 30, editableStartMinutes: 600, editableEndMinutes: 1200 }),
    ).toEqual({ start: 360, end: 1440 });
  });

  it("時刻を物差しの左端からの位置（%）へ直す。両端は0%と100%になる", () => {
    const range = { start: 540, end: 1320 };
    expect(minutesToTimelinePercent(540, range)).toBe(0);
    expect(minutesToTimelinePercent(1320, range)).toBe(100);
    expect(minutesToTimelinePercent(930, range)).toBe(50);
  });

  it("物差しの外の時刻は、0%未満と100%超えのまま返す", () => {
    const range = { start: 540, end: 1320 };
    expect(minutesToTimelinePercent(462, range)).toBeCloseTo(-10);
    expect(minutesToTimelinePercent(1398, range)).toBeCloseTo(110);
  });

  it("枠線を太くしても、カードのバーの両端は画面の端から同じ距離に置く", () => {
    for (const borderPx of [SP_CARD_BORDER_PX, 2, 3]) {
      expect(borderPx + getSPCardPaddingXPx(borderPx)).toBe(SP_CARD_BORDER_PX + SP_CARD_PADDING_X_PX);
    }
  });
});
