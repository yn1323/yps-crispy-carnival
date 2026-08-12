import { describe, expect, it } from "vitest";
import { parseAnalyticsDashboardRequest } from "./schemas";

function shopsRequest(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: "shops",
    from: "2026-08-01",
    to: "2026-08-12",
    cursor: null,
    limit: 50,
    sort: "latestActivityAt",
    direction: "desc",
    organizationId: null,
    plan: null,
    shopSize: null,
    cohort: null,
    cadence: null,
    lineUsage: null,
    health: null,
    completeness: null,
    ...overrides,
  };
}

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

  it.each(["candidate", "high", "possible", "unknown"] as const)("shopsのusage=%sを許可する", (usage) => {
    const result = parseAnalyticsDashboardRequest(shopsRequest({ usage }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ endpoint: "shops", usage });
  });

  it("shopsのusage未指定とnullを全件として受け付ける", () => {
    const missing = parseAnalyticsDashboardRequest(shopsRequest());
    const explicitNull = parseAnalyticsDashboardRequest(shopsRequest({ usage: null }));

    expect(missing.ok).toBe(true);
    if (missing.ok) expect(missing.value).toMatchObject({ endpoint: "shops", usage: null });
    expect(explicitNull.ok).toBe(true);
    if (explicitNull.ok) expect(explicitNull.value).toMatchObject({ endpoint: "shops", usage: null });
  });

  it("shopsの不正なusageを拒否する", () => {
    expect(parseAnalyticsDashboardRequest(shopsRequest({ usage: "active" }))).toEqual({
      ok: false,
      message: "usageが正しくありません",
    });
  });

  it("shopsの未知keyを拒否する", () => {
    expect(parseAnalyticsDashboardRequest(shopsRequest({ usage: null, includeDeleted: true }))).toEqual({
      ok: false,
      message: "対応していないquery parameterが含まれています",
    });
  });
});
