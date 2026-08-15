import { describe, expect, it } from "vitest";
import { resolveAppOrganizationSwitchTarget } from "./appOrganizationSwitchTarget";

describe("resolveAppOrganizationSwitchTarget", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/app/shifts", "/app/shifts"],
    ["/app/staff", "/app/staff"],
    ["/app/actions", "/app/actions"],
    ["/app/manage", "/app/manage"],
    ["/app/manage/organization", "/app/manage/organization"],
    ["/app/manage/managers", "/app/manage/managers"],
    ["/app/manage/billing", "/app/manage/billing"],
  ] as const)("%sでは同じ組織単位の画面を維持する", (pathname, to) => {
    expect(resolveAppOrganizationSwitchTarget(pathname, "organization-b")).toEqual({
      to,
      search: { org: "organization-b" },
    });
  });

  it.each([
    ["/app/shifts/recruitment-a/board", "/app/shifts"],
    ["/app/staff/person-a", "/app/staff"],
    ["/app/staff/person-a/shops/shop-a", "/app/staff"],
    ["/app/manage/shops/shop-a", "/app/manage"],
    ["/app/manage/managers/invite-staff", "/app/manage/managers"],
    ["/app/manage/managers/invite-new", "/app/manage/managers"],
  ] as const)("%sでは旧組織のentityや入力フローを親画面へ退避する", (pathname, to) => {
    expect(resolveAppOrganizationSwitchTarget(pathname, "organization-b")).toEqual({
      to,
      search: { org: "organization-b" },
    });
  });

  it("account・未定義route・空の組織IDには遷移先を作らない", () => {
    expect(resolveAppOrganizationSwitchTarget("/account", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/app/unknown", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/dashboard", "  ")).toBeNull();
  });
});
