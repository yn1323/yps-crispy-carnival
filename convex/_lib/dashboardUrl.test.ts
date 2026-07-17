import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { buildShopDashboardUrl } from "./dashboardUrl";

describe("buildShopDashboardUrl", () => {
  it("対象店舗をshopクエリに設定したDashboard URLを返す", () => {
    const shopId = "shop_target" as Id<"shops">;

    const url = new URL(buildShopDashboardUrl(shopId));

    expect(url.pathname).toBe("/dashboard");
    expect([...url.searchParams.entries()]).toEqual([["shop", shopId]]);
  });
});
