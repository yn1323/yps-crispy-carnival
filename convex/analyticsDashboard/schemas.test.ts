import { describe, expect, it } from "vitest";
import { parseAnalyticsDashboardRequest } from "./schemas";

describe("analyticsDashboard/schemas", () => {
  it("overview requestを受け付ける", () => {
    expect(parseAnalyticsDashboardRequest({ kind: "overview", from: "2026-07-01", to: "2026-07-31" })).toEqual({
      ok: true,
      value: { kind: "overview", from: "2026-07-01", to: "2026-07-31" },
    });
  });

  it("対応していないmetricを拒否する", () => {
    expect(
      parseAnalyticsDashboardRequest({
        kind: "eventTrends",
        from: "2026-07-01",
        metrics: ["staff.email"],
        to: "2026-07-31",
      }),
    ).toMatchObject({ ok: false });
  });

  it("取得期間の上限を超えるrequestを拒否する", () => {
    expect(parseAnalyticsDashboardRequest({ kind: "overview", from: "2024-01-01", to: "2026-07-31" })).toMatchObject({
      ok: false,
    });
  });

  it("店舗ランキングのlimit上限を超えるrequestを拒否する", () => {
    expect(
      parseAnalyticsDashboardRequest({
        date: "2026-07-01",
        kind: "shopRanking",
        limit: 101,
        sort: "lineLinkedRate",
      }),
    ).toMatchObject({ ok: false });
  });
});
