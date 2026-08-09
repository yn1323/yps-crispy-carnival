import { describe, expect, it } from "vitest";
import { formatDateWithWeekday, getNextWeekDates } from "../e2e/helpers/date";

function jstInstant(value: string) {
  return new Date(`${value}+09:00`);
}

describe("E2E業務日付", () => {
  it.each([
    ["月曜", "2026-08-03T00:00:00", "2026-08-10"],
    ["日曜", "2026-08-02T12:00:00", "2026-08-10"],
    ["土曜17時前", "2026-08-01T16:59:59", "2026-08-03"],
    ["土曜17時ちょうど", "2026-08-01T17:00:00", "2026-08-10"],
    ["JST深夜", "2026-08-04T00:01:00", "2026-08-10"],
  ])("%sでも催促時刻が未来になる週をJSTで選ぶ", (_label, now, expectedStart) => {
    const result = getNextWeekDates(jstInstant(now));

    expect(result.periodStart).toBe(expectedStart);
    expect(result.dates).toHaveLength(7);
    expect(result.periodEnd).toBe(result.dates[6]);
  });

  it("host timezoneに依存せず曜日を付ける", () => {
    expect(formatDateWithWeekday("2026-08-03")).toBe("8/3(月)");
    expect(() => formatDateWithWeekday("2026-02-30")).toThrow("Invalid calendar date");
  });
});
