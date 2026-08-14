import { describe, expect, it } from "vitest";
import { validateDashboardRouteSearch } from "@/src/components/features/AuthenticatedApp";

describe("Dashboard URL", () => {
  it("組織と店舗だけを受け付ける", () => {
    expect(validateDashboardRouteSearch({ org: " organization-a ", shop: " shop-a ", ignored: "value" })).toEqual({
      org: "organization-a",
      shop: "shop-a",
    });
  });

  it("空値と旧DashboardのsearchはURL状態から除く", () => {
    expect(validateDashboardRouteSearch({ org: " ", shop: "", users: "20", focus: "person-a" })).toEqual({});
  });
});
