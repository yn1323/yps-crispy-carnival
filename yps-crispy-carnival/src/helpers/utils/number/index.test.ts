import { getRandomBetween } from "./index";

describe("getRandomBetween", () => {
  it("指定した範囲内の整数を返すこと", () => {
    const min = 1;
    const max = 10;

    // 十分な回数テストを実行して範囲内に収まることを確認
    for (let i = 0; i < 100; i++) {
      const result = getRandomBetween(min, max);
      expect(result).toBeGreaterThanOrEqual(min);
      expect(result).toBeLessThanOrEqual(max);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it("最小値と最大値が同じ場合、その値を返すこと", () => {
    const value = 5;
    const result = getRandomBetween(value, value);
    expect(result).toBe(value);
  });
});
