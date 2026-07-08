import { describe, expect, it } from "vitest";
import { compareSortValues, type SortState, sortRowsBy } from "./tableSort";

describe("compareSortValues", () => {
  it("数値と文字列を昇順/降順で比較する", () => {
    expect(compareSortValues(1, 2, "asc")).toBeLessThan(0);
    expect(compareSortValues(1, 2, "desc")).toBeGreaterThan(0);
    expect(compareSortValues("あおぞら", "ベーカリー", "asc")).toBeLessThan(0);
    expect(compareSortValues("あおぞら", "ベーカリー", "desc")).toBeGreaterThan(0);
  });

  it("欠損値は昇順/降順に関わらず下へ寄せる", () => {
    expect(compareSortValues(null, 1, "asc")).toBeGreaterThan(0);
    expect(compareSortValues(undefined, 1, "desc")).toBeGreaterThan(0);
    expect(compareSortValues(1, null, "asc")).toBeLessThan(0);
  });
});

describe("sortRowsBy", () => {
  it("同値のときはfallbackで並びを安定させる", () => {
    const sort: SortState<"score"> = { key: "score", direction: "desc" };
    const rows = [
      { id: "old", createdAt: 1, score: 10 },
      { id: "new", createdAt: 2, score: 10 },
    ];

    expect(
      sortRowsBy(
        rows,
        sort,
        (row) => row.score,
        (a, b) => b.createdAt - a.createdAt,
      ).map((row) => row.id),
    ).toEqual(["new", "old"]);
  });
});
