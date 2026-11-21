import { describe, expect, it } from "vitest";
import { buildDateOnlyWeeks, getSortableDates } from "./script";

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

describe("getSortableDates", () => {
  const dates = [
    { iso: "2026-06-01", inRange: true },
    { iso: "2026-06-02", inRange: true },
    { iso: "2026-06-03", inRange: false },
  ];

  it("営業日を優先する", () => {
    expect(getSortableDates(dates, ["2026-06-01"])).toEqual([{ iso: "2026-06-02", inRange: true }]);
  });

  it("全日休業なら期間内の日付を返す", () => {
    expect(getSortableDates(dates, ["2026-06-01", "2026-06-02"])).toEqual(dates.slice(0, 2));
  });
});
