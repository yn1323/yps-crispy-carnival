import { describe, expect, test } from "vitest";
import { calculateWeeklySummary } from "./summaryCalculations";

const positions = [{ name: "ホール" }, { name: "キッチン" }];
const hours = [9, 10, 11, 12, 13];

describe("calculateWeeklySummary", () => {
  test("空のマップでは全て0・nullを返す", () => {
    const result = calculateWeeklySummary({ staffingMap: {}, hours, positions });

    expect(result.weeklyTotalPersonHours).toBe(0);
    expect(result.peakInfo).toBeNull();
    expect(result.configuredDaysCount).toBe(0);
  });

  test("1曜日のデータのみで正しく集計する", () => {
    const staffingMap: Record<string, number> = {
      "1-11-ホール": 3,
      "1-11-キッチン": 2,
      "1-12-ホール": 3,
      "1-12-キッチン": 2,
    };

    const result = calculateWeeklySummary({ staffingMap, hours, positions });

    expect(result.weeklyTotalPersonHours).toBe(10);
    expect(result.peakInfo).toEqual({ day: "月", hour: "11:00", count: 5 });
    expect(result.configuredDaysCount).toBe(1);
  });

  test("複数曜日のデータで設定済み日数を正しくカウントする", () => {
    const staffingMap: Record<string, number> = {
      "1-9-ホール": 1,
      "3-9-ホール": 1,
      "5-9-ホール": 1,
    };

    const result = calculateWeeklySummary({ staffingMap, hours, positions });

    expect(result.weeklyTotalPersonHours).toBe(3);
    expect(result.configuredDaysCount).toBe(3);
  });

  test("ピークが複数同値の場合、最初に見つかった方を返す", () => {
    const staffingMap: Record<string, number> = {
      "0-9-ホール": 5,
      "1-9-ホール": 5,
    };

    const result = calculateWeeklySummary({ staffingMap, hours, positions });

    // 日曜(0)が先に走査されるため、日曜が返る
    expect(result.peakInfo).toEqual({ day: "日", hour: "9:00", count: 5 });
  });
});
