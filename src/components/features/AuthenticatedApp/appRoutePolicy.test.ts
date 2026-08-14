import { describe, expect, it } from "vitest";
import {
  getCanonicalAppHref,
  isAppPath,
  normalizeAppRouteSearch,
  resolveAppShellRouteData,
  validateAppFilteredListRouteSearch,
  validateAppHomeRouteSearch,
  validateAppOrganizationRouteSearch,
} from "./appRoutePolicy";

describe("app route search policy", () => {
  it.each<[string, string]>([
    ["/app", "?org=org-a"],
    ["/app/home", "?org=org-a&shop=shop-a"],
    ["/app/shifts", "?org=org-a&shopFilter=shop-a"],
    ["/app/shifts/recruitment-a/board", "?org=org-a"],
    ["/app/staff", "?org=org-a&shopFilter=shop-a"],
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
    ["/app/account", "?flow=connect-google&oauth=google"],
  ])("%sでは許可されたsearchだけを維持する", (pathname, expectedSearch) => {
    const source =
      "?org=org-a&shop=shop-a&shopFilter=shop-a&flow=connect-google&oauth=google&token=secret&unknown=value";

    expect(getCanonicalAppHref(pathname, source)).toBe(`${pathname}${expectedSearch}`);
  });

  it("未知route、未知search、空値を除去する", () => {
    expect(getCanonicalAppHref("/app/unknown", "?org=org-a&unknown=value")).toBe("/app/unknown");
    expect(getCanonicalAppHref("/app/home", "?org=%20%20&shop=&unknown=value")).toBe("/app/home");
    expect(normalizeAppRouteSearch("/app/staff", { org: " org-a ", shopFilter: " ", shop: "shop-a" })).toEqual({
      org: "org-a",
    });
  });

  it("route file向けvalidatorも同じallowlistへ収束する", () => {
    const source = { org: " org-a ", shop: "shop-a", shopFilter: "shop-b", token: "secret" };

    expect(validateAppHomeRouteSearch(source)).toEqual({ org: "org-a", shop: "shop-a" });
    expect(validateAppFilteredListRouteSearch(source)).toEqual({ org: "org-a", shopFilter: "shop-b" });
    expect(validateAppOrganizationRouteSearch(source)).toEqual({ org: "org-a" });
  });

  it("すでにcanonicalなsearchとapp外routeは遷移させない", () => {
    expect(getCanonicalAppHref("/app/home", "?org=org-a&shop=shop-a")).toBeNull();
    expect(getCanonicalAppHref("/app/home", "")).toBeNull();
    expect(getCanonicalAppHref("/dashboard", "?org=org-a&unknown=value")).toBeNull();
  });

  it("app routeだけを識別する", () => {
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/staff")).toBe(true);
    expect(isAppPath("/application")).toBe(false);
  });
});

describe("app shell route policy", () => {
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
