import { describe, expect, it } from "vitest";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { parseAnalyticsSourceCaptureStartAt } from "./config";

describe("Analytics source capture境界", () => {
  it("YYYYMMDDHHmmssのJST 00:00をUnix millisecondsへ変換する", () => {
    expect(parseAnalyticsSourceCaptureStartAt("20260815000000")).toBe(jstDayRangeMs("2026-08-15").startMs);
    expect(parseAnalyticsSourceCaptureStartAt(" 20240229000000 ")).toBe(jstDayRangeMs("2024-02-29").startMs);
  });

  it.each([
    undefined,
    "",
    "1786719600000",
    "2026-08-15T00:00:00+09:00",
    "20260229000000",
    "20261301000000",
    "20260815000001",
    "20260815240000",
  ])("不正またはJST 00:00以外の値を拒否する: %s", (value) => {
    expect(parseAnalyticsSourceCaptureStartAt(value)).toBeUndefined();
  });
});
