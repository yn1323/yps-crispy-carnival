import { describe, expect, it } from "vitest";
import { parseAnalyticsDashboardRequest } from "./schemas";

describe("Analytics Dashboard request schema", () => {
  it("overviewの表示期間と比較期間を合計5年以内へ制限する", () => {
    const result = parseAnalyticsDashboardRequest({
      endpoint: "overview",
      from: "2020-01-01",
      to: "2024-12-30",
      compareFrom: "2015-01-01",
      compareTo: "2019-12-30",
      organizationId: null,
      shopId: null,
    });

    expect(result).toEqual({ ok: false, message: "表示期間と比較期間の合計は5年以内にしてください" });
  });

  it("比較期間がなければ5年以内の表示期間を許可する", () => {
    const result = parseAnalyticsDashboardRequest({
      endpoint: "overview",
      from: "2020-01-01",
      to: "2024-12-30",
      compareFrom: null,
      compareTo: null,
      organizationId: null,
      shopId: null,
    });

    expect(result.ok).toBe(true);
  });
});
