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
    { endpoint: "notifications", from: "2026-09-01" },
    { endpoint: "notifications", from: "2026-09-10", to: "2026-09-09" },
    { endpoint: "notifications", from: "2026-06-01", to: "2026-09-09" },
    { endpoint: "notifications", status: "delivered" },
    { endpoint: "notifications", category: "billing" },
    { endpoint: "notifications", cursor: "next-page" },
    { endpoint: "notifications", limit: 51 },
    { endpoint: "notifications", email: "staff@example.com" },
    { endpoint: "notifications", lookup: "outbox", shopId: "shop" },
    { endpoint: "notifications", lookup: "outbox", cursor: "1" },
    { endpoint: "notifications", lookup: "staff@example.com" },
    { endpoint: "notificationSummary", rangeDays: 7 },
    { endpoint: "staffTimeline", shopId: "shop" },
    { endpoint: "organizationEvents", shopId: "shop", limit: 51 },
    { endpoint: "magicLinkLookup" },
    { endpoint: "magicLinkLookup", token: "short" },
    { endpoint: "magicLinkLookup", token: "https://example.com/s?token=abcdefgh" },
    { endpoint: "magicLinkLookup", token: "abcdefgh-1234", shopId: "shop" },
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
  it("通知検索は期間の両端、最大90日、固定の状態・種別と、IDだけの完全一致検索を受け付ける", () => {
    expect(
      normalizeBrowserRequestInput(
        "notifications",
        new URLSearchParams({
          from: "2026-06-12",
          to: "2026-09-09",
          shopId: "shop",
          status: "failed",
          channel: "line",
          category: "confirmation",
          cursor: "1788900000000.25",
          limit: "40",
        }),
      ),
    ).toEqual({
      ok: true,
      value: {
        endpoint: "notifications",
        cursor: "1788900000000.25",
        limit: 40,
        from: "2026-06-12",
        to: "2026-09-09",
        shopId: "shop",
        status: "failed",
        channel: "line",
        category: "confirmation",
        lookup: null,
      },
    });
    expect(parseAnalyticsDashboardRequest({ endpoint: "notifications", lookup: "re_123-abc" })).toMatchObject({
      ok: true,
      value: { lookup: "re_123-abc", from: null, to: null, shopId: null },
    });
    expect(
      normalizeBrowserRequestInput("staffTimeline", new URLSearchParams(), { shopId: "shop", staffId: "staff" }),
    ).toEqual({ ok: true, value: { endpoint: "staffTimeline", shopId: "shop", staffId: "staff" } });
  });
  it("マジックリンク検索はPOST bodyのtokenだけで受け付け、ブラウザのURL入力からは組み立てない", () => {
    expect(parseAnalyticsDashboardRequest({ endpoint: "magicLinkLookup", token: "abcdefgh-1234" })).toEqual({
      ok: true,
      value: { endpoint: "magicLinkLookup", token: "abcdefgh-1234" },
    });
    expect(normalizeBrowserRequestInput("magicLinkLookup", new URLSearchParams({ token: "abcdefgh-1234" }))).toEqual({
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
