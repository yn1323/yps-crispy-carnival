import { describe, expect, it } from "vitest";
import { DEFAULT_STAFFING_BAR_LIMITS } from "@/src/domains/shift/staffingBars";
import {
  buildTimelineRange,
  buildTimeOptions,
  formatRequiredCountChange,
  getDragTimeLabelCenter,
  getEndOptions,
  getMinTrackWidth,
  getRejectionMessage,
  getRequiredCountBackground,
  getRequiredCountLabel,
  getStartOptions,
  getTimelineMetrics,
  isBarOnTimeline,
  keepBarTimeOrder,
  resolveHourWidth,
} from "./script";

const values = (options: Array<{ value: string }>) => options.map((option) => option.value);

describe("getTimelineMetrics", () => {
  it("広い画面は、左の列を広く取る", () => {
    expect(getTimelineMetrics("wide")).toEqual({
      labelColumnWidth: 120,
      axisPadding: 30,
      minHourWidth: 32,
      rowHeight: 44,
      barHeight: 32,
    });
  });

  it("狭い画面は、左の列を行の番号だけの幅にし、1時間の幅の下限を下げる。行の高さは広い画面と同じ44pxにする", () => {
    expect(getTimelineMetrics("narrow")).toEqual({
      labelColumnWidth: 20,
      axisPadding: 14,
      minHourWidth: 16,
      rowHeight: 44,
      barHeight: 32,
    });
  });
});

describe("resolveHourWidth", () => {
  const narrow = getTimelineMetrics("narrow");
  const wide = getTimelineMetrics("wide");

  it("列の幅から左右のパディングを除き、1日の時間で割る", () => {
    // 幅375pxの画面で、左右16pxの余白と20pxの左の列を除いた列（323px）に、13時間を収める。
    expect(resolveHourWidth({ trackWidth: 323, totalHours: 13, metrics: narrow })).toBeCloseTo(22.69, 2);
    expect(resolveHourWidth({ trackWidth: 904, totalHours: 13, metrics: wide })).toBeCloseTo(64.92, 2);
  });

  it("1時間がちょうど下限の幅なら、そのまま収める", () => {
    expect(resolveHourWidth({ trackWidth: 16 * 18 + 28, totalHours: 18, metrics: narrow })).toBe(16);
  });

  it("1時間が下限より狭くなる長い受付時間では、下限で止める", () => {
    expect(resolveHourWidth({ trackWidth: 323, totalHours: 24, metrics: narrow })).toBe(16);
    expect(resolveHourWidth({ trackWidth: 323, totalHours: 13, metrics: wide })).toBe(32);
  });

  it("幅をまだ測れていないときと、時間が0のときは、下限を返す", () => {
    expect(resolveHourWidth({ trackWidth: 0, totalHours: 13, metrics: narrow })).toBe(16);
    expect(resolveHourWidth({ trackWidth: 323, totalHours: 0, metrics: narrow })).toBe(16);
  });
});

describe("getMinTrackWidth", () => {
  it("1時間の下限の幅で1日を並べ、左右のパディングを足す", () => {
    const timeRange = buildTimelineRange({ startMinutes: 540, endMinutes: 1320 }, 30);

    expect(getMinTrackWidth(timeRange, getTimelineMetrics("narrow"))).toBe(236);
    expect(getMinTrackWidth(timeRange, getTimelineMetrics("wide"))).toBe(476);
  });
});

describe("buildTimelineRange", () => {
  it("受付時間が1時間単位なら、表示と編集の範囲が一致する", () => {
    expect(buildTimelineRange({ startMinutes: 540, endMinutes: 1320 }, 30)).toEqual({
      start: 9,
      end: 22,
      unit: 30,
      editableStartMinutes: 540,
      editableEndMinutes: 1320,
    });
  });

  it("受付時間が30分で始まり30分で終わるなら、表示だけを1時間単位へ広げる", () => {
    expect(buildTimelineRange({ startMinutes: 570, endMinutes: 1350 }, 30)).toEqual({
      start: 9,
      end: 23,
      unit: 30,
      editableStartMinutes: 570,
      editableEndMinutes: 1350,
    });
  });
});

describe("isBarOnTimeline", () => {
  const timeRange = buildTimelineRange({ startMinutes: 570, endMinutes: 1320 }, 30);

  it.each([
    ["表示範囲の内側", "10:00", "12:00", true],
    ["表示範囲の開始をまたぐ", "08:00", "09:30", true],
    ["表示範囲の終了をまたぐ", "21:30", "23:00", true],
    ["表示範囲の開始で終わる", "07:00", "09:00", false],
    ["表示範囲の終了から始まる", "22:00", "23:00", false],
  ])("%sバーは %s〜%s", (_label, start, end, expected) => {
    expect(isBarOnTimeline({ start, end }, timeRange)).toBe(expected);
  });
});

describe("時刻の選択肢", () => {
  const options = buildTimeOptions({ range: { startMinutes: 540, endMinutes: 660 }, unitMinutes: 30 });

  it("受付時間の端から端までを、刻みごとに出す", () => {
    expect(values(options)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });

  it("受付時間が刻みにそろっていない場合は、刻みに乗る内側の時刻だけを出す", () => {
    const unaligned = buildTimeOptions({ range: { startMinutes: 555, endMinutes: 645 }, unitMinutes: 30 });

    expect(values(unaligned)).toEqual(["09:30", "10:00", "10:30"]);
  });

  it("開始には、受付時間の終わりを除くすべての時刻を出す", () => {
    expect(values(getStartOptions(options))).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("終了には、受付時間の始まりを除くすべての時刻を出す", () => {
    expect(values(getEndOptions(options))).toEqual(["09:30", "10:00", "10:30", "11:00"]);
  });

  it("24時を越える受付時間は、翌日の時刻として出す", () => {
    const overnight = buildTimeOptions({ range: { startMinutes: 1410, endMinutes: 1470 }, unitMinutes: 30 });

    expect(overnight).toEqual([
      { value: "23:30", label: "23:30" },
      { value: "24:00", label: "翌 00:00" },
      { value: "24:30", label: "翌 00:30" },
    ]);
  });
});

describe("keepBarTimeOrder", () => {
  const keep = (start: string, end: string, changed: "start" | "end") =>
    keepBarTimeOrder({ time: { start, end }, changed, unitMinutes: 30 });

  it("最小の長さが残っていれば、選んだ時刻のままにする", () => {
    expect(keep("11:00", "14:00", "start")).toEqual({ start: "11:00", end: "14:00" });
    expect(keep("13:30", "14:00", "start")).toEqual({ start: "13:30", end: "14:00" });
    expect(keep("11:00", "11:30", "end")).toEqual({ start: "11:00", end: "11:30" });
  });

  it("開始を終了と同じ時刻にしたら、終了を30分あとへずらす", () => {
    expect(keep("14:00", "14:00", "start")).toEqual({ start: "14:00", end: "14:30" });
  });

  it("開始を終了よりあとにしたら、終了を開始の30分あとへずらす", () => {
    expect(keep("17:00", "14:00", "start")).toEqual({ start: "17:00", end: "17:30" });
  });

  it("終了を開始以前にしたら、開始を終了の30分前へずらす", () => {
    expect(keep("11:00", "11:00", "end")).toEqual({ start: "10:30", end: "11:00" });
    expect(keep("11:00", "09:30", "end")).toEqual({ start: "09:00", end: "09:30" });
  });

  it("24時を越える時刻も、翌日の時刻としてずらす", () => {
    expect(keep("24:00", "23:00", "start")).toEqual({ start: "24:00", end: "24:30" });
  });
});

describe("formatRequiredCountChange", () => {
  it("時間の中で人数が同じなら、足す前と足したあとを1つずつ出す", () => {
    expect(formatRequiredCountChange({ min: 1, max: 1 }, 2)).toBe("1人 → 3人");
  });

  it("時間の中で人数が違うなら、足す前と足したあとを範囲で出す", () => {
    expect(formatRequiredCountChange({ min: 1, max: 2 }, 2)).toBe("1〜2人 → 3〜4人");
  });

  it("バーのない時間は、0人から足す", () => {
    expect(formatRequiredCountChange({ min: 0, max: 0 }, 1)).toBe("0人 → 1人");
    expect(formatRequiredCountChange({ min: 0, max: 3 }, 1)).toBe("0〜3人 → 1〜4人");
  });
});

describe("getRequiredCountLabel", () => {
  const label = (widthPx: number, allowsNumberOnly: boolean) =>
    getRequiredCountLabel({ count: 3, widthPx, allowsNumberOnly });

  it("28px以上の区間には「3人」を出す", () => {
    expect(label(28, false)).toBe("3人");
    expect(label(28, true)).toBe("3人");
  });

  it("28pxに届かない区間は、広い画面では何も出さない", () => {
    expect(label(27.9, false)).toBeNull();
  });

  it("狭い画面では、12px以上の区間に数字だけを出し、それより狭い区間には出さない", () => {
    expect(label(27.9, true)).toBe("3");
    expect(label(12, true)).toBe("3");
    expect(label(11.9, true)).toBeNull();
  });
});

describe("getDragTimeLabelCenter", () => {
  const center = (previewLeft: number, previewWidth: number) =>
    getDragTimeLabelCenter({ previewLeft, previewWidth, trackWidth: 320 });

  it("プレビューの中心に置く", () => {
    expect(center(100, 60)).toBe(130);
  });

  it("表の左右からはみ出す位置では、内側で止める", () => {
    expect(center(14, 20)).toBe(52);
    expect(center(280, 26)).toBe(268);
  });

  it("札より狭い表では、左端に寄せる", () => {
    expect(getDragTimeLabelCenter({ previewLeft: 30, previewWidth: 20, trackWidth: 80 })).toBe(52);
  });
});

describe("getRejectionMessage", () => {
  const rules = { unitMinutes: 30, limits: DEFAULT_STAFFING_BAR_LIMITS };

  it("上限の理由には、上限の本数を入れる", () => {
    expect(getRejectionMessage("TOO_MANY_CONCURRENT", rules)).toBe("同じ時間に重ねられるバーは10本までです");
    expect(getRejectionMessage("TOO_MANY_BARS", rules)).toBe("バーは全部で200本までです");
  });

  it("渡した上限が違えば、その本数を入れる", () => {
    const custom = { unitMinutes: 30, limits: { maxConcurrentPerPosition: 3, maxBars: 20 } };

    expect(getRejectionMessage("TOO_MANY_CONCURRENT", custom)).toBe("同じ時間に重ねられるバーは3本までです");
    expect(getRejectionMessage("TOO_MANY_BARS", custom)).toBe("バーは全部で20本までです");
  });

  it("長さの理由には、刻みを入れる", () => {
    expect(getRejectionMessage("TOO_SHORT", rules)).toBe("終了は開始より30分以上あとにしてください");
  });
});

describe("getRequiredCountBackground", () => {
  it("人数が多い区間ほど、ポジションの色を濃くする", () => {
    expect(getRequiredCountBackground("#3b82f6", 1, 5)).toBe("color-mix(in srgb, #3b82f6 22%, white)");
    expect(getRequiredCountBackground("#3b82f6", 3, 5)).toBe("color-mix(in srgb, #3b82f6 36%, white)");
    expect(getRequiredCountBackground("#3b82f6", 5, 5)).toBe("color-mix(in srgb, #3b82f6 50%, white)");
  });

  it("最大が1人のときも、1人の区間はいちばん薄い色にする", () => {
    expect(getRequiredCountBackground("#3b82f6", 1, 1)).toBe("color-mix(in srgb, #3b82f6 22%, white)");
  });
});
