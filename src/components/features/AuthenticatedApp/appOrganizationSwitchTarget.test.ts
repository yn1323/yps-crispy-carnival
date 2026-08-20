import { describe, expect, it } from "vitest";
import { resolveAppOrganizationSwitchTarget } from "./appOrganizationSwitchTarget";

describe("resolveAppOrganizationSwitchTarget", () => {
  it.each([
    ["/dashboard", "/dashboard"],
    ["/shifts", "/shifts"],
    ["/staff", "/staff"],
    ["/actions", "/actions"],
    ["/manage", "/manage"],
    ["/manage/organization", "/manage/organization"],
    ["/manage/managers", "/manage/managers"],
    ["/manage/billing", "/manage/billing"],
    ["/staff/", "/staff"],
    ["/Staff/", "/staff"],
  ] as const)("%sでは同じ組織単位の画面を維持する", (pathname, to) => {
    expect(resolveAppOrganizationSwitchTarget(pathname, "organization-b")).toEqual({
      to,
      search: { org: "organization-b" },
    });
  });

  it.each([
    ["/shifts/recruitment-a/board", "/shifts"],
    ["/staff/person-a", "/staff"],
    ["/staff/person-a/shops/shop-a", "/staff"],
    ["/manage/shops/shop-a", "/manage"],
    ["/manage/managers/invite-staff", "/manage/managers"],
    ["/manage/managers/invite-new", "/manage/managers"],
    ["/shifts/recruitment-a/board/", "/shifts"],
    ["/staff/person-a/shops/shop-a/", "/staff"],
    ["/manage/shops/shop-a/", "/manage"],
    ["/Staff/person-a/", "/staff"],
    ["/Manage/Shops/shop-a/", "/manage"],
  ] as const)("%sでは旧組織のentityや入力フローを親画面へ退避する", (pathname, to) => {
    expect(resolveAppOrganizationSwitchTarget(pathname, "organization-b")).toEqual({
      to,
      search: { org: "organization-b" },
    });
  });

  it("account・公開route・未定義route・空の組織IDには遷移先を作らない", () => {
    expect(resolveAppOrganizationSwitchTarget("/account", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/staff/register", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/staff/register/", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/Staff/Register/", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/shifts/submit", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/shifts/submit/", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/Shifts/Submit/", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/unknown", "organization-b")).toBeNull();
    expect(resolveAppOrganizationSwitchTarget("/dashboard", "  ")).toBeNull();
  });
});
