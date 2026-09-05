import { describe, expect, it } from "vitest";
import { normalizeBrowserRequestInput, parseAnalyticsDashboardRequest, parseFeatureRequestUpdate } from "./schemas";

describe("Analytics BFFの入力契約", () => {
  it.each([7, 30, 90])("相対%d日だけで日次分析を指定する", (rangeDays) => {
    expect(normalizeBrowserRequestInput("overview", new URLSearchParams({ rangeDays: String(rangeDays) }))).toEqual({
      ok: true,
      value: { endpoint: "overview", rangeDays },
    });
  });
  it.each([
    { endpoint: "overview", rangeDays: 365 },
    { endpoint: "overview", asOf: 1 },
    { endpoint: "shops", date: "2026-02-30", metric: "submitted" },
    { endpoint: "shops", date: "2026-09-05" },
    { endpoint: "shops", metric: "submitted" },
    { endpoint: "shops", limit: 101 },
    { endpoint: "requests", limit: 51 },
    { endpoint: "staff", shopId: "shop", staffId: "staff", limit: 51 },
    { endpoint: "requests", cursor: "x".repeat(4097) },
    { endpoint: "setFeatureRequestDeleted", id: "request", isDeleted: true },
  ])("集計queryの不正・更新入力を拒否する", (request) => {
    expect(parseAnalyticsDashboardRequest(request)).toEqual({ ok: false });
  });
  it("path IDや期間の重複query parameterを拒否する", () => {
    expect(
      normalizeBrowserRequestInput("staff", new URLSearchParams("shopId=other"), { shopId: "shop", staffId: "staff" }),
    ).toEqual({ ok: false });
    expect(normalizeBrowserRequestInput("overview", new URLSearchParams("rangeDays=7&rangeDays=90"))).toEqual({
      ok: false,
    });
  });
  it("専用要望更新はIDとboolean以外を受け付けない", () => {
    expect(parseFeatureRequestUpdate({ endpoint: "setFeatureRequestDeleted", id: "request", isDeleted: true })).toEqual(
      { ok: true, value: { endpoint: "setFeatureRequestDeleted", id: "request", isDeleted: true } },
    );
    for (const isDeleted of ["true", 1, null])
      expect(parseFeatureRequestUpdate({ endpoint: "setFeatureRequestDeleted", id: "request", isDeleted })).toEqual({
        ok: false,
      });
    expect(
      parseFeatureRequestUpdate({
        endpoint: "setFeatureRequestDeleted",
        id: "request",
        isDeleted: true,
        comment: "改変",
      }),
    ).toEqual({ ok: false });
  });
});
