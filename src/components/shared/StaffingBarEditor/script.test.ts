import { describe, expect, it } from "vitest";
import { DEFAULT_STAFFING_BAR_LIMITS } from "@/src/domains/shift/staffingBars";
import {
  buildTimelineRange,
  buildTimeOptions,
  getEndOptions,
  getRejectionMessage,
  getRequiredCountBackground,
  getStartOptions,
  isBarOnTimeline,
} from "./script";

const values = (options: Array<{ value: string }>) => options.map((option) => option.value);

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

  it("開始には、終了より前の時刻だけを出す", () => {
    expect(values(getStartOptions(options, "10:00"))).toEqual(["09:00", "09:30"]);
  });

  it("終了には、開始より後の時刻だけを出す", () => {
    expect(values(getEndOptions(options, "10:00"))).toEqual(["10:30", "11:00"]);
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
