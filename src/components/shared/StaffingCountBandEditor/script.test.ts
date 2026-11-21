import { describe, expect, it } from "vitest";
import {
  buildBandTimeOptions,
  buildBandTimeRange,
  getBandMetrics,
  getCountLabel,
  getSegmentBackground,
  getSpanLabel,
  getSwipedRange,
  getSwipeTimeLabelCenter,
  keepRangeOrder,
  parseCountInput,
  resolveBandHourWidth,
  toCellStartMinutes,
} from "./script";

const RANGE = { startMinutes: 9 * 60, endMinutes: 22 * 60 };

describe("resolveBandHourWidth", () => {
  const wide = getBandMetrics("wide");
  const narrow = getBandMetrics("narrow");

  it("広い画面では、名前の列とボタンの列を除いた幅に1日を収める", () => {
    // 730 - 120 - 44 = 566。左右のパディング16pxずつを除いた534pxを13時間で分ける。
    expect(resolveBandHourWidth({ containerWidth: 730, totalHours: 13, metrics: wide })).toBeCloseTo(534 / 13);
  });

  it("狭い画面では、幅いっぱいに1日を収める", () => {
    // 343pxから左右のパディング14pxずつを除いた315pxを13時間で分ける。
    expect(resolveBandHourWidth({ containerWidth: 343, totalHours: 13, metrics: narrow })).toBeCloseTo(315 / 13);
  });

  it("1時間が下限より狭くなる幅では、下限で止める", () => {
    expect(resolveBandHourWidth({ containerWidth: 730, totalHours: 24, metrics: wide })).toBe(32);
    expect(resolveBandHourWidth({ containerWidth: 288, totalHours: 24, metrics: narrow })).toBe(16);
  });

  it("幅を測る前と、時間の長さがない場合は、下限を返す", () => {
    expect(resolveBandHourWidth({ containerWidth: 0, totalHours: 13, metrics: wide })).toBe(32);
    expect(resolveBandHourWidth({ containerWidth: 730, totalHours: 0, metrics: wide })).toBe(32);
  });
});

describe("buildBandTimeRange", () => {
  it("表示は1時間単位へ広げ、編集できる範囲は受付時間のままにする", () => {
    expect(buildBandTimeRange({ startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 }, 30)).toEqual({
      start: 9,
      end: 22,
      unit: 30,
      editableStartMinutes: 570,
      editableEndMinutes: 1290,
    });
  });
});

describe("toCellStartMinutes", () => {
  const toCell = (rawMinutes: number) => toCellStartMinutes({ rawMinutes, range: RANGE, unitMinutes: 30 });

  it("時刻が入るマスの開始を返す", () => {
    expect(toCell(11 * 60)).toBe(11 * 60);
    expect(toCell(11 * 60 + 29.9)).toBe(11 * 60);
    expect(toCell(11 * 60 + 30)).toBe(11 * 60 + 30);
  });

  it("範囲の外の時刻は、端のマスへ寄せる", () => {
    expect(toCell(8 * 60)).toBe(9 * 60);
    expect(toCell(22 * 60)).toBe(21 * 60 + 30);
    expect(toCell(23 * 60)).toBe(21 * 60 + 30);
  });

  it("30分から始まる範囲では、範囲の開始からマスを数える", () => {
    expect(
      toCellStartMinutes({
        rawMinutes: 9 * 60 + 45,
        range: { startMinutes: 9 * 60 + 30, endMinutes: 21 * 60 + 30 },
        unitMinutes: 30,
      }),
    ).toBe(9 * 60 + 30);
  });
});

describe("getSwipedRange", () => {
  it("なぞり始めたマスから、いまのマスの終わりまでを範囲にする", () => {
    expect(getSwipedRange({ anchorMinutes: 840, currentMinutes: 990, unitMinutes: 30 })).toEqual({
      startMinutes: 840,
      endMinutes: 1020,
    });
  });

  it("右から左へなぞっても、同じ範囲になる", () => {
    expect(getSwipedRange({ anchorMinutes: 990, currentMinutes: 840, unitMinutes: 30 })).toEqual({
      startMinutes: 840,
      endMinutes: 1020,
    });
  });

  it("1つのマスの中だけをなぞると、そのマスだけを範囲にする", () => {
    expect(getSwipedRange({ anchorMinutes: 840, currentMinutes: 840, unitMinutes: 30 })).toEqual({
      startMinutes: 840,
      endMinutes: 870,
    });
  });
});

describe("buildBandTimeOptions", () => {
  it("受付時間の端から端までを、刻みごとに並べる", () => {
    const options = buildBandTimeOptions({ startMinutes: 9 * 60, endMinutes: 10 * 60 + 30 }, 30);
    expect(options.map((option) => option.value)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("刻みに乗らない受付時間では、刻みに乗る内側の時刻だけを並べる", () => {
    const options = buildBandTimeOptions({ startMinutes: 9 * 60 + 15, endMinutes: 10 * 60 + 45 }, 30);
    expect(options.map((option) => option.value)).toEqual(["09:30", "10:00", "10:30"]);
  });
});

describe("keepRangeOrder", () => {
  it("最小の長さが残る範囲は、そのまま返す", () => {
    expect(keepRangeOrder({ startMinutes: 600, endMinutes: 630, changed: "start", unitMinutes: 30 })).toEqual({
      startMinutes: 600,
      endMinutes: 630,
    });
  });

  it("開始を終了以降にすると、終了を開始の刻み1つ分あとへずらす", () => {
    expect(keepRangeOrder({ startMinutes: 900, endMinutes: 840, changed: "start", unitMinutes: 30 })).toEqual({
      startMinutes: 900,
      endMinutes: 930,
    });
    expect(keepRangeOrder({ startMinutes: 840, endMinutes: 840, changed: "start", unitMinutes: 30 })).toEqual({
      startMinutes: 840,
      endMinutes: 870,
    });
  });

  it("終了を開始以前にすると、開始を終了の刻み1つ分前へずらす", () => {
    expect(keepRangeOrder({ startMinutes: 900, endMinutes: 840, changed: "end", unitMinutes: 30 })).toEqual({
      startMinutes: 810,
      endMinutes: 840,
    });
  });
});

describe("区間の名前と人数の表記", () => {
  it("区間の名前を「ポジション 時間 人数」の形にする", () => {
    expect(getSpanLabel("ホール", { startMinutes: 660, endMinutes: 840, count: 3 })).toBe("ホール 11:00〜14:00 3人");
  });

  it("24時以降は「翌」を付けて出す", () => {
    expect(getSpanLabel("ホール", { startMinutes: 22 * 60, endMinutes: 25 * 60, count: 1 })).toBe(
      "ホール 22:00〜翌1:00 1人",
    );
  });
});

describe("getCountLabel", () => {
  it("幅が足りる区間は「人」を付ける", () => {
    expect(getCountLabel(3, 34)).toEqual({ text: "3人", isCompact: false });
  });

  it("幅が足りない区間は「人」を省くが、数字は必ず出す", () => {
    expect(getCountLabel(3, 33.9)).toEqual({ text: "3", isCompact: true });
    expect(getCountLabel(10, 0)).toEqual({ text: "10", isCompact: true });
  });
});

describe("getSegmentBackground", () => {
  it("人数が多い区間ほど、ポジションの色を濃くする", () => {
    expect(getSegmentBackground("#60a5fa", 1, 3)).toBe("color-mix(in srgb, #60a5fa 30%, white)");
    expect(getSegmentBackground("#60a5fa", 2, 3)).toBe("color-mix(in srgb, #60a5fa 50%, white)");
    expect(getSegmentBackground("#60a5fa", 3, 3)).toBe("color-mix(in srgb, #60a5fa 70%, white)");
  });

  it("いちばん多い人数が1人なら、いちばん薄い色にする", () => {
    expect(getSegmentBackground("#60a5fa", 1, 1)).toBe("color-mix(in srgb, #60a5fa 30%, white)");
  });

  it("基準より多い人数でも、濃さはいちばん多い区間の濃さで止める", () => {
    expect(getSegmentBackground("#60a5fa", 5, 3)).toBe("color-mix(in srgb, #60a5fa 70%, white)");
  });
});

describe("getSwipeTimeLabelCenter", () => {
  it("選んだ範囲の中心に置く", () => {
    expect(getSwipeTimeLabelCenter({ left: 200, width: 100, trackWidth: 600 })).toBe(250);
  });

  it("帯の左右からはみ出さない位置で止める", () => {
    expect(getSwipeTimeLabelCenter({ left: 0, width: 20, trackWidth: 600 })).toBe(52);
    expect(getSwipeTimeLabelCenter({ left: 580, width: 20, trackWidth: 600 })).toBe(548);
  });
});

describe("parseCountInput", () => {
  it("1から上限までの整数を人数にする。全角の数字と前後の空白も受け付ける", () => {
    expect(parseCountInput("1", 50)).toBe(1);
    expect(parseCountInput(" ５０ ", 50)).toBe(50);
  });

  it("範囲の外、整数でない文字、空の入力はnullにする", () => {
    for (const text of ["0", "51", "", "2.5", "-3", "abc"]) {
      expect(parseCountInput(text, 50)).toBeNull();
    }
  });
});
