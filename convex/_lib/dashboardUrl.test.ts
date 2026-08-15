import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { buildShopDashboardUrl } from "./dashboardUrl";

describe("buildShopDashboardUrl", () => {
  it("検証済み組織と対象店舗をDashboard URLへ設定する", () => {
    const organizationId = "organization_target" as Id<"organizations">;
    const shopId = "shop_target" as Id<"shops">;

    const url = new URL(buildShopDashboardUrl({ organizationId, shopId }));

    expect(url.pathname).toBe("/dashboard");
    expect([...url.searchParams.entries()]).toEqual([
      ["org", organizationId],
      ["shop", shopId],
    ]);
  });
});
