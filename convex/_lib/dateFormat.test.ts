import { describe, expect, it } from "vitest";
import {
  addDays,
  formatDateLabel,
  formatDateTimeLabel,
  formatPeriodLabel,
  generateDateRange,
  getDeadlineCutoff,
  getMondayWeekStart,
  getWeekday,
} from "./dateFormat";

describe("dateFormat", () => {
  it("日付と期間を曜日付きで表示できる", () => {
    expect(formatDateLabel("2026-06-01")).toBe("6/1(月)");
    expect(formatPeriodLabel("2026-06-01", "2026-06-03")).toBe("6/1(月)〜6/3(水)");
  });

  it("UTC基準で日付加算と曜日計算ができる", () => {
    expect(addDays("2026-06-01", 3)).toBe("2026-06-04");
    expect(getWeekday("2026-06-01")).toBe(1);
    expect(getMondayWeekStart("2026-06-07")).toBe("2026-06-01");
  });

  it("期間内の日付を生成できる", () => {
    expect(generateDateRange("2026-06-01", "2026-06-03")).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });

  it("Unix msをJSTの曜日付き日時に変換できる", () => {
    expect(formatDateTimeLabel(new Date("2026-06-01T15:30:00.000Z").getTime())).toBe("6/2(火) 00:30");
  });

  it("締切日は翌日0時UTCをcutoffにする", () => {
    expect(getDeadlineCutoff("2026-06-01")).toBe(Date.UTC(2026, 5, 2));
  });
});
