import { describe, expect, it } from "vitest";
import { buildDateOnlyWeeks } from "./script";

describe("buildDateOnlyWeeks", () => {
  it("期間を月曜始まりの週へまとめる", () => {
    const weeks = buildDateOnlyWeeks(["2026-06-03", "2026-06-04", "2026-06-05"]);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].subLabel).toBe("1週目");
    expect(weeks[0].dates.filter((date) => date.inRange).map((date) => date.iso)).toEqual([
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);
  });
});
