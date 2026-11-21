import { describe, expect, it } from "vitest";
import { parseStaffingCount } from "./script";

describe("入力欄の文字を人数へ直す", () => {
  it.each([
    ["0", 0],
    ["1", 1],
    ["98", 98],
    ["99", 99],
  ])("上限までの整数「%s」は、そのまま%i人になる", (value, expected) => {
    expect(parseStaffingCount(value, 99)).toBe(expected);
  });

  it.each([
    ["100", 99],
    ["1000", 99],
  ])("上限を超える「%s」は、上限の%i人に収める", (value, expected) => {
    expect(parseStaffingCount(value, 99)).toBe(expected);
  });

  it.each([[""], ["-"], ["-1"], ["abc"]])("空欄、負の数、数字でない「%s」は0人として扱う", (value) => {
    expect(parseStaffingCount(value, 99)).toBe(0);
  });

  it("小数は切り捨てる", () => {
    expect(parseStaffingCount("2.9", 99)).toBe(2);
  });
});
