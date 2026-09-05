import { describe, expect, it } from "vitest";
import {
  getCanonicalAppHref,
  isAppOrganizationScopedPath,
  normalizeAppRouteSearch,
  resolveAppShellRouteData,
  validateAppBillingRouteSearch,
  validateAppFilteredListRouteSearch,
  validateAppOrganizationRouteSearch,
  validateDashboardRouteSearch,
} from "./appRoutePolicy";

describe("app route search policy", () => {
  it.each<[string, string]>([
    ["/app", "?org=org-a"],
    ["/dashboard", "?org=org-a&shop=shop-a"],
    ["/shifts", "?org=org-a&shopFilter=shop-a"],
    ["/shifts/recruitment-a/board", "?org=org-a"],
    ["/shifts/recruitment-a/export", "?org=org-a"],
    ["/staff", "?org=org-a&shopFilter=shop-a"],
    ["/staff/order", "?org=org-a"],
    ["/staff/person-a", "?org=org-a"],
    ["/staff/person-a/shops/shop-a", "?org=org-a"],
    ["/actions", "?org=org-a&shopFilter=shop-a"],
    ["/manage", "?org=org-a"],
    ["/manage/organization", "?org=org-a"],
    ["/manage/managers", "?org=org-a"],
    ["/manage/managers/invite-staff", "?org=org-a"],
    ["/manage/managers/invite-new", "?org=org-a"],
    ["/manage/billing", "?org=org-a"],
    ["/manage/shops/shop-a", "?org=org-a"],
    ["/app/shifts", "?org=org-a&shopFilter=shop-a"],
    ["/app/shifts/recruitment-a/board", "?org=org-a"],
    ["/app/staff", "?org=org-a&shopFilter=shop-a"],
    ["/app/staff/order", "?org=org-a"],
    ["/app/staff/person-a", "?org=org-a"],
    ["/app/staff/person-a/shops/shop-a", "?org=org-a"],
    ["/app/actions", "?org=org-a&shopFilter=shop-a"],
    ["/app/manage", "?org=org-a"],
    ["/app/manage/organization", "?org=org-a"],
    ["/app/manage/managers", "?org=org-a"],
    ["/app/manage/managers/invite-staff", "?org=org-a"],
    ["/app/manage/managers/invite-new", "?org=org-a"],
    ["/app/manage/billing", "?org=org-a"],
    ["/app/manage/shops/shop-a", "?org=org-a"],
  ])("canonical/legacyの%sでは許可されたsearchだけを維持する", (pathname, expectedSearch) => {
    const source =
      "?org=org-a&shop=shop-a&shopFilter=shop-a&flow=connect-google&oauth=google&token=secret&unknown=value";

    expect(getCanonicalAppHref(pathname, source)).toBe(`${pathname}${expectedSearch}`);
  });

  it("既知のrouteでは未知searchと空値を除去し、未知routeは対象にしない", () => {
    expect(getCanonicalAppHref("/app/unknown", "?org=org-a&unknown=value")).toBeNull();
    expect(getCanonicalAppHref("/staff/person-a", "?org=%20%20&token=secret&email=user%40example.com")).toBe(
      "/staff/person-a",
    );
    expect(getCanonicalAppHref("/dashboard", "?org=%20%20&shop=&unknown=value")).toBe("/dashboard");
    expect(getCanonicalAppHref("/staff/person-a/", "?org=org-a&token=secret")).toBe("/staff/person-a/?org=org-a");
    expect(getCanonicalAppHref("/Staff/person-a", "?org=org-a&token=secret")).toBe("/Staff/person-a?org=org-a");
    expect(normalizeAppRouteSearch("/staff", { org: " org-a ", shopFilter: " ", shop: "shop-a" })).toEqual({
      org: "org-a",
    });
  });

  it("課金画面だけStripeの戻り結果を許可し、未知の値は除去する", () => {
    expect(getCanonicalAppHref("/manage/billing", "?org=org-a&stripe=cancelled")).toBeNull();
    expect(getCanonicalAppHref("/manage/billing", "?org=org-a&stripe=success")).toBe("/manage/billing?org=org-a");
    expect(getCanonicalAppHref("/app/manage/billing", "?org=org-a&stripe=cancelled")).toBeNull();
    expect(getCanonicalAppHref("/app/manage/billing", "?org=org-a&stripe=success")).toBe(
      "/app/manage/billing?org=org-a",
    );
  });

  it("route file向けvalidatorも同じallowlistへ収束する", () => {
    const source = { org: " org-a ", shop: "shop-a", shopFilter: "shop-b", stripe: "cancelled", token: "secret" };

    expect(validateDashboardRouteSearch(source)).toEqual({ org: "org-a", shop: "shop-a" });
    expect(validateAppFilteredListRouteSearch(source)).toEqual({ org: "org-a", shopFilter: "shop-b" });
    expect(validateAppOrganizationRouteSearch(source)).toEqual({ org: "org-a" });
    expect(validateAppBillingRouteSearch(source)).toEqual({ org: "org-a", stripe: "cancelled" });
    expect(validateAppBillingRouteSearch({ ...source, stripe: "success" })).toEqual({ org: "org-a" });
  });

  it("すでにcanonicalなsearchとapp外routeは遷移させない", () => {
    expect(getCanonicalAppHref("/dashboard", "?org=org-a&shop=shop-a")).toBeNull();
    expect(getCanonicalAppHref("/dashboard", "")).toBeNull();
    expect(getCanonicalAppHref("/account", "?flow=connect-google&unknown=value")).toBeNull();
  });

  it.each([
    "/staff/register",
    "/Staff/Register",
    "/shifts/submit",
    "/Shifts/Submit",
    "/shifts/submit/completed",
    "/shifts/view",
    "/shifts/reissue",
  ])("公開route %s のcapability searchは認証route policyで変更しない", (pathname) => {
    expect(isAppOrganizationScopedPath(pathname)).toBe(false);
    expect(getCanonicalAppHref(pathname, "?token=public-capability&email=user%40example.com")).toBeNull();
  });

  it.each([
    "/dashboard",
    "/staff/person-a",
    "/staff/order",
    "/staff/person-a/shops/shop-a",
    "/shifts/recruitment-a/board",
    "/shifts/recruitment-a/export",
    "/manage/shops/shop-a",
    "/app/staff/person-a",
    "/app/staff/order",
    "/Staff/person-a",
    "/Manage/Billing",
  ])("organization scoped route %s をstrictに識別する", (pathname) => {
    expect(isAppOrganizationScopedPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/account",
    "/application",
    "/app/unknown",
    "/staff/register",
    "/Staff/Register",
    "/shifts/submit",
    "/Shifts/Submit",
  ])("organization scope外route %s を対象にしない", (pathname) => {
    expect(isAppOrganizationScopedPath(pathname)).toBe(false);
  });
});

describe("app shell route policy", () => {
  it("出力専用routeのbare宣言を親のnavigationより優先する", () => {
    expect(
      resolveAppShellRouteData([
        { staticData: { appShell: { mode: "navigation", activeKey: "shifts" } } },
        { staticData: { appShell: { mode: "bare" } } },
      ]),
    ).toEqual({ mode: "bare" });
  });

  it("最も深いmatchのshell宣言を採用する", () => {
    expect(
      resolveAppShellRouteData([
        { staticData: {} },
        { staticData: { appShell: { mode: "navigation", activeKey: "manage" } } },
        {
          staticData: {
            appShell: {
              mode: "focused",
              title: "管理者を招待",
              backLabel: "前の画面へ戻る",
            },
          },
        },
      ]),
    ).toEqual({
      mode: "focused",
      title: "管理者を招待",
      backLabel: "前の画面へ戻る",
    });
  });

  it("shell宣言がない場合はnullを返す", () => {
    expect(resolveAppShellRouteData([{ staticData: {} }, { staticData: {} }])).toBeNull();
  });
});
