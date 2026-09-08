// @vitest-environment jsdom

import { createMemoryHistory, createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateAppBillingRouteSearch,
  validateAppFilteredListRouteSearch,
  validateDashboardRouteSearch,
} from "@/src/components/features/AuthenticatedApp/appRoutePolicy";
import { validateAccountSecuritySearch } from "@/src/pages/account-security/search";
import { Route as AuthRoute } from "./_auth";

const previousRouter = window.__TSR_ROUTER__;

afterEach(() => {
  window.__TSR_ROUTER__ = previousRouter;
});

function createSearchRouter(pathname: string, searchStr: string) {
  const root = createRootRoute();
  const auth = createRoute({
    getParentRoute: () => root,
    id: "_auth",
    beforeLoad: AuthRoute.options.beforeLoad,
    validateSearch: AuthRoute.options.validateSearch,
  });
  const page = createRoute({
    getParentRoute: () => auth,
    path: pathname,
    validateSearch: (search: Record<string, unknown>): Record<string, unknown> => {
      if (pathname === "/dashboard") return validateDashboardRouteSearch(search);
      if (pathname === "/account") return validateAccountSecuritySearch(search);
      if (pathname === "/manage/billing") return validateAppBillingRouteSearch(search);
      return validateAppFilteredListRouteSearch(search);
    },
  });
  return createRouter({
    routeTree: root.addChildren([auth.addChildren([page])]),
    history: createMemoryHistory({ initialEntries: [`${pathname}${searchStr}`] }),
    defaultStructuralSharing: true,
  });
}

function permutations(entries: string[]): string[][] {
  if (entries.length === 0) return [[]];
  return entries.flatMap((entry, index) =>
    permutations(entries.filter((_, otherIndex) => index !== otherIndex)).map((rest) => [entry, ...rest]),
  );
}

const validSearches = [
  { pathname: "/dashboard", search: "org=org-a&shop=shop-a" },
  { pathname: "/shifts", search: "org=org-a&shopFilter=shop-a" },
  { pathname: "/staff", search: "org=org-a&shopFilter=shop-a" },
  { pathname: "/actions", search: "org=org-a&shopFilter=shop-a" },
  { pathname: "/manage/billing", search: "org=org-a&stripe=returned" },
  { pathname: "/manage/billing", search: "org=org-a&stripe=cancelled" },
  { pathname: "/account", search: "org=org-a&flow=connect-google&oauth=google" },
  { pathname: "/account", search: "flow=connect-google&oauth=google" },
  { pathname: "/account", search: "org=org-a&flow=add-email-password" },
];

describe("認証画面のクエリ正規化とRouter遷移", () => {
  it.each(
    validSearches.flatMap(({ pathname, search }) =>
      permutations(search.split("&")).map((entries) => ({ pathname, searchStr: `?${entries.join("&")}` })),
    ),
  )("$pathname$searchStr はキー順に関係なく値とURLを維持して遷移を完了する", async ({ pathname, searchStr }) => {
    const router = createSearchRouter(pathname, searchStr);

    await router.load();

    expect(router.state.matches.map((match) => match.status)).toEqual(["success", "success", "success"]);
    expect(router.state.location.href).toBe(`${pathname}${searchStr}`);
    expect(router.state.matches.at(-1)?.search).toEqual(Object.fromEntries(new URLSearchParams(searchStr)));
  });

  it.each([
    { pathname: "/dashboard", searchStr: "", canonical: "" },
    { pathname: "/dashboard", searchStr: "?shop=shop-a", canonical: "?shop=shop-a" },
    { pathname: "/account", searchStr: "?org=org-a", canonical: "?org=org-a" },
    { pathname: "/account", searchStr: "", canonical: "" },
    {
      pathname: "/dashboard",
      searchStr: "?shop=shop-a&unknown=value&org=org-a",
      canonical: "?org=org-a&shop=shop-a",
    },
    { pathname: "/staff", searchStr: "?shopFilter=&org=org-a", canonical: "?org=org-a" },
    { pathname: "/manage/billing", searchStr: "?stripe=success&org=org-a", canonical: "?org=org-a" },
    { pathname: "/account", searchStr: "?oauth=google&flow=unknown&org=org-a", canonical: "?org=org-a" },
  ])("$pathname$searchStr の必要な正規化は収束する", async ({ pathname, searchStr, canonical }) => {
    const router = createSearchRouter(pathname, searchStr);

    await router.load();

    expect(router.state.matches.map((match) => match.status)).toEqual(["success", "success", "success"]);
    expect(router.state.location.href).toBe(`${pathname}${canonical}`);
    expect(router.state.matches.at(-1)?.search).toEqual(Object.fromEntries(new URLSearchParams(canonical)));
  });
});
