import { describe, expect, test } from "vitest";
import { calculateHeatmapData, getColorToken } from "./heatmapCalculations";

const positions = [{ name: "ホール" }, { name: "キッチン" }];
const hours = [9, 10, 11];

describe("getColorToken", () => {
  test("count=0はgray.50を返す", () => {
    expect(getColorToken(0, 10)).toBe("gray.50");
  });

  test("maxCount=0はgray.50を返す", () => {
    expect(getColorToken(5, 0)).toBe("gray.50");
  });

  test("25%以下はblue.100を返す", () => {
    expect(getColorToken(2, 10)).toBe("blue.100");
  });

  test("50%以下はblue.300を返す", () => {
    expect(getColorToken(5, 10)).toBe("blue.300");
  });

  test("75%以下はblue.500を返す", () => {
    expect(getColorToken(7, 10)).toBe("blue.500");
  });

  test("75%超はblue.700を返す", () => {
    expect(getColorToken(9, 10)).toBe("blue.700");
  });
});

describe("calculateHeatmapData", () => {
  test("空のマップでは全セルがgray.50になる", () => {
    const result = calculateHeatmapData({ staffingMap: {}, hours, positions });

    expect(result.rows).toHaveLength(3);
    expect(result.maxCount).toBe(0);
    expect(result.dailyTotals).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);

    for (const row of result.rows) {
      for (const cell of row.cells) {
        expect(cell.totalCount).toBe(0);
        expect(cell.colorToken).toBe("gray.50");
      }
    }
  });

  test("データがあるセルの合計値と色が正しい", () => {
    const staffingMap: Record<string, number> = {
      "1-9-ホール": 3,
      "1-9-キッチン": 2,
      "1-10-ホール": 1,
    };

    const result = calculateHeatmapData({ staffingMap, hours, positions });

    // 月曜 9:00 → 3+2=5（最大）→ blue.700
    const mondayNine = result.rows[0].cells[1];
    expect(mondayNine.totalCount).toBe(5);
    expect(mondayNine.colorToken).toBe("blue.700");

    // 月曜 10:00 → 1 → blue.100 (1/5=0.2 ≤ 0.25)
    const mondayTen = result.rows[1].cells[1];
    expect(mondayTen.totalCount).toBe(1);
    expect(mondayTen.colorToken).toBe("blue.100");

    expect(result.maxCount).toBe(5);
    expect(result.dailyTotals[1]).toBe(6); // 月曜合計: 5+1+0=6
  });

  test("dailyTotalsが8要素で曜日順になっている", () => {
    const staffingMap: Record<string, number> = {
      "0-9-ホール": 1, // 日曜
      "6-9-ホール": 2, // 土曜
    };

    const result = calculateHeatmapData({ staffingMap, hours, positions });

    expect(result.dailyTotals[0]).toBe(1); // 日曜
    expect(result.dailyTotals[6]).toBe(2); // 土曜
    expect(result.dailyTotals[1]).toBe(0); // 月曜
  });
});
