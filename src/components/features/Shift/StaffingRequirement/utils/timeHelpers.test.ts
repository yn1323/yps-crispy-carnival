import { describe, expect, test } from "vitest";
import { generateHourRange, parseHour } from "./timeHelpers";

describe("parseHour", () => {
  test("HH:MM形式から時を取得する", () => {
    expect(parseHour("09:00")).toBe(9);
    expect(parseHour("22:30")).toBe(22);
    expect(parseHour("00:00")).toBe(0);
  });
});

describe("generateHourRange", () => {
  test("営業時間から時間帯配列を生成する", () => {
    expect(generateHourRange("09:00", "22:00")).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
  });

  test("短い営業時間でも正しく生成する", () => {
    expect(generateHourRange("11:00", "14:00")).toEqual([11, 12, 13]);
  });

  test("同じ時間の場合は空配列を返す", () => {
    expect(generateHourRange("09:00", "09:00")).toEqual([]);
  });
});
