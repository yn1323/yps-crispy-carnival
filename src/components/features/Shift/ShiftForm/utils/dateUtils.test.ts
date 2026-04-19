import { describe, expect, test } from "vitest";
import { buildWeeklyGrid, getWeekStartDate } from "./dateUtils";

describe("getWeekStartDate", () => {
  test("月曜起算（デフォルト）で水曜日の週開始日は直前の月曜日", () => {
    // 2026-01-21 は水曜
    expect(getWeekStartDate("2026-01-21")).toBe("2026-01-19");
  });

  test("月曜起算で月曜日の週開始日は当日", () => {
    expect(getWeekStartDate("2026-01-19", "mon")).toBe("2026-01-19");
  });

  test("月曜起算で日曜日の週開始日は直前の月曜日", () => {
    // 2026-01-25 は日曜
    expect(getWeekStartDate("2026-01-25", "mon")).toBe("2026-01-19");
  });

  test("日曜起算で水曜日の週開始日は直前の日曜日", () => {
    expect(getWeekStartDate("2026-01-21", "sun")).toBe("2026-01-18");
  });

  test("日曜起算で日曜日の週開始日は当日", () => {
    expect(getWeekStartDate("2026-01-25", "sun")).toBe("2026-01-25");
  });
});

describe("buildWeeklyGrid", () => {
  test("月曜開始 7 日は 1 週・全て期間内", () => {
    const dates = ["2026-01-19", "2026-01-20", "2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25"];
    const grid = buildWeeklyGrid(dates);
    expect(grid).toHaveLength(1);
    expect(grid[0]).toHaveLength(7);
    expect(grid[0].every((cell) => cell.inRange)).toBe(true);
    expect(grid[0][0].iso).toBe("2026-01-19");
    expect(grid[0][6].iso).toBe("2026-01-25");
  });

  test("水曜開始 14 日は 3 週・先頭月火と末尾火〜日が期間外（月曜起算）", () => {
    const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 0, 21 + i)).toISOString().slice(0, 10));
    const grid = buildWeeklyGrid(dates);
    expect(grid).toHaveLength(3);

    // 週1: 月火が期間外、水〜日が期間内
    expect(grid[0][0]).toEqual({ iso: "2026-01-19", inRange: false });
    expect(grid[0][1]).toEqual({ iso: "2026-01-20", inRange: false });
    expect(grid[0][2]).toEqual({ iso: "2026-01-21", inRange: true });
    expect(grid[0][6]).toEqual({ iso: "2026-01-25", inRange: true });

    // 週2: 全て期間内
    expect(grid[1].every((c) => c.inRange)).toBe(true);
    expect(grid[1][0].iso).toBe("2026-01-26");

    // 週3: 月火が期間内、水〜日が期間外
    expect(grid[2][0]).toEqual({ iso: "2026-02-02", inRange: true });
    expect(grid[2][1]).toEqual({ iso: "2026-02-03", inRange: true });
    expect(grid[2][2]).toEqual({ iso: "2026-02-04", inRange: false });
    expect(grid[2][6]).toEqual({ iso: "2026-02-08", inRange: false });
  });

  test("日曜開始 7 日は月曜起算で 2 週・先頭月〜土が期間外、末尾日のみ期間内", () => {
    // 2026-01-25 は日曜、2026-01-31 は土曜
    const dates = ["2026-01-25", "2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31"];
    const grid = buildWeeklyGrid(dates);
    expect(grid).toHaveLength(2);

    // 週1: 月〜土が期間外、日のみ期間内
    expect(grid[0].slice(0, 6).every((c) => !c.inRange)).toBe(true);
    expect(grid[0][6]).toEqual({ iso: "2026-01-25", inRange: true });

    // 週2: 月〜土が期間内、日が期間外
    expect(grid[1].slice(0, 6).every((c) => c.inRange)).toBe(true);
    expect(grid[1][6]).toEqual({ iso: "2026-02-01", inRange: false });
  });

  test("金曜開始 3 日は 1 週内・前後が期間外（月曜起算）", () => {
    // 2026-01-23 金、24 土、25 日
    const dates = ["2026-01-23", "2026-01-24", "2026-01-25"];
    const grid = buildWeeklyGrid(dates);
    expect(grid).toHaveLength(1);
    expect(grid[0].map((c) => c.inRange)).toEqual([false, false, false, false, true, true, true]);
    expect(grid[0][0].iso).toBe("2026-01-19");
    expect(grid[0][6].iso).toBe("2026-01-25");
  });

  test("日曜起算で日曜開始 7 日は 1 週・全て期間内", () => {
    const dates = ["2026-01-25", "2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31"];
    const grid = buildWeeklyGrid(dates, "sun");
    expect(grid).toHaveLength(1);
    expect(grid[0][0].iso).toBe("2026-01-25");
    expect(grid[0][6].iso).toBe("2026-01-31");
    expect(grid[0].every((c) => c.inRange)).toBe(true);
  });

  test("日曜起算で水曜開始 14 日は先頭日〜火が期間外", () => {
    const dates = Array.from({ length: 14 }, (_, i) => new Date(Date.UTC(2026, 0, 21 + i)).toISOString().slice(0, 10));
    const grid = buildWeeklyGrid(dates, "sun");
    expect(grid).toHaveLength(3);
    // 週1 は 2026-01-18 (日) 開始
    expect(grid[0][0]).toEqual({ iso: "2026-01-18", inRange: false });
    expect(grid[0][1]).toEqual({ iso: "2026-01-19", inRange: false });
    expect(grid[0][2]).toEqual({ iso: "2026-01-20", inRange: false });
    expect(grid[0][3]).toEqual({ iso: "2026-01-21", inRange: true });
  });

  test("空配列を渡すと空配列を返す", () => {
    expect(buildWeeklyGrid([])).toEqual([]);
  });
});
