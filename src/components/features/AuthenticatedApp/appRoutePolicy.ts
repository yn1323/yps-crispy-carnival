import type { AppNavigationKey } from "./AppPrimaryNavigation";

export type AppOrganizationScopedNavigationPath =
  | "/dashboard"
  | "/shifts"
  | `/shifts/${string}/board`
  | `/shifts/${string}/export`
  | "/staff"
  | "/staff/order"
  | `/staff/${string}`
  | "/actions"
  | "/manage"
  | "/manage/organization"
  | "/manage/managers"
  | "/manage/managers/invite-staff"
  | "/manage/managers/invite-new"
  | "/manage/billing"
  | `/manage/shops/${string}`;

export type AppNavigationPath = AppOrganizationScopedNavigationPath | "/account";

export type AppRouteSearch = {
  org?: string;
  shop?: string;
  shopFilter?: string;
  flow?: string;
  oauth?: string;
  stripe?: string;
};

export type AppOrganizationRouteSearch = Pick<AppRouteSearch, "org">;
export type StripeCheckoutReturn = "returned" | "cancelled";
export type AppBillingRouteSearch = {
  org?: string;
  stripe?: StripeCheckoutReturn;
};
export type DashboardRouteSearch = Pick<AppRouteSearch, "org" | "shop">;
export type AppFilteredListRouteSearch = Pick<AppRouteSearch, "org" | "shopFilter">;

type AppRouteSearchKey = keyof AppRouteSearch;

const NO_APP_SEARCH_KEYS: readonly AppRouteSearchKey[] = [];
const ORGANIZATION_SEARCH_KEYS = ["org"] as const satisfies readonly AppRouteSearchKey[];
const BILLING_SEARCH_KEYS = ["org", "stripe"] as const satisfies readonly AppRouteSearchKey[];
const DASHBOARD_SEARCH_KEYS = ["org", "shop"] as const satisfies readonly AppRouteSearchKey[];
const FILTERED_LIST_SEARCH_KEYS = ["org", "shopFilter"] as const satisfies readonly AppRouteSearchKey[];

type AppRouteSearchPolicy = "organization" | "billing" | "dashboard" | "filteredList";

const CANONICAL_FILTERED_LIST_PATHS = new Set(["/actions", "/shifts", "/staff"]);
const LEGACY_FILTERED_LIST_PATHS = new Set(["/app/actions", "/app/shifts", "/app/staff"]);
const CANONICAL_ORGANIZATION_PATHS = new Set([
  "/staff/order",
  "/manage",
  "/manage/organization",
  "/manage/managers",
  "/manage/managers/invite-staff",
  "/manage/managers/invite-new",
]);
const LEGACY_ORGANIZATION_PATHS = new Set([
  "/app",
  "/app/staff/order",
  "/app/manage",
  "/app/manage/organization",
  "/app/manage/managers",
  "/app/manage/managers/invite-staff",
  "/app/manage/managers/invite-new",
]);
const PUBLIC_CANONICAL_PATHS = new Set([
  "/staff/register",
  "/shifts/submit",
  "/shifts/submit/completed",
  "/shifts/view",
  "/shifts/reissue",
]);

export type AppShellRouteData =
  | {
      mode: "bare";
    }
  | {
      mode: "navigation";
      activeKey: AppNavigationKey | null;
    }
  | {
      mode: "focused";
      title: string;
      backLabel: string;
    };

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    appShell?: AppShellRouteData;
  }
}

type MatchWithStaticData = {
  staticData: {
    appShell?: AppShellRouteData;
  };
};

export function resolveAppShellRouteData(matches: ReadonlyArray<MatchWithStaticData>): AppShellRouteData | null {
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const appShell = matches[index]?.staticData.appShell;
    if (appShell) return appShell;
  }

  return null;
}

/** organization scopeを必要とする既知のcanonical/legacy routeだけを識別する。 */
export function isAppOrganizationScopedPath(pathname: string): boolean {
  return resolveAppRouteSearchPolicy(pathname) !== null;
}

export function normalizeAppRouteSearch(pathname: string, search: Readonly<Record<string, unknown>>): AppRouteSearch {
  const normalized: AppRouteSearch = {};

  for (const key of getAllowedAppRouteSearchKeys(pathname)) {
    const value = search[key];
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed !== "") normalized[key] = trimmed;
  }

  if (resolveAppRouteSearchPolicy(pathname) === "billing" && !isStripeCheckoutReturn(normalized.stripe)) {
    delete normalized.stripe;
  }

  return normalized;
}

export function validateAppOrganizationRouteSearch(search: Record<string, unknown>): AppOrganizationRouteSearch {
  const { org } = normalizeAppRouteSearch("/manage", search);
  return org ? { org } : {};
}

export function validateAppBillingRouteSearch(search: Record<string, unknown>): AppBillingRouteSearch {
  const { org, stripe } = normalizeAppRouteSearch("/manage/billing", search);
  const stripeResult: StripeCheckoutReturn | undefined =
    stripe === "returned" || stripe === "cancelled" ? stripe : undefined;
  return {
    ...(org ? { org } : {}),
    ...(stripeResult ? { stripe: stripeResult } : {}),
  };
}

export function validateDashboardRouteSearch(search: Record<string, unknown>): DashboardRouteSearch {
  const { org, shop } = normalizeAppRouteSearch("/dashboard", search);
  return { ...(org ? { org } : {}), ...(shop ? { shop } : {}) };
}

export function validateAppFilteredListRouteSearch(search: Record<string, unknown>): AppFilteredListRouteSearch {
  const { org, shopFilter } = normalizeAppRouteSearch("/staff", search);
  return { ...(org ? { org } : {}), ...(shopFilter ? { shopFilter } : {}) };
}

/** 認証復帰前にroute別allowlist外と空値を除去し、一意なsearchへ収束させる。 */
export function getCanonicalAppHref(pathname: string, searchStr: string): string | null {
  if (!isAppOrganizationScopedPath(pathname)) return null;

  const currentSearch = normalizeSearchString(searchStr);
  const rawSearch = Object.fromEntries(new URLSearchParams(currentSearch));
  const canonicalSearch = buildAppRouteSearchString(pathname, rawSearch);

  return currentSearch === canonicalSearch ? null : `${pathname}${canonicalSearch}`;
}

function getAllowedAppRouteSearchKeys(pathname: string): readonly AppRouteSearchKey[] {
  switch (resolveAppRouteSearchPolicy(pathname)) {
    case "organization":
      return ORGANIZATION_SEARCH_KEYS;
    case "billing":
      return BILLING_SEARCH_KEYS;
    case "dashboard":
      return DASHBOARD_SEARCH_KEYS;
    case "filteredList":
      return FILTERED_LIST_SEARCH_KEYS;
    default:
      return NO_APP_SEARCH_KEYS;
  }
}

function resolveAppRouteSearchPolicy(pathname: string): AppRouteSearchPolicy | null {
  const routePathname = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const staticPathname = routePathname.toLowerCase();

  if (PUBLIC_CANONICAL_PATHS.has(staticPathname)) return null;
  if (staticPathname === "/dashboard") return "dashboard";
  if (staticPathname === "/manage/billing" || staticPathname === "/app/manage/billing") return "billing";
  if (CANONICAL_FILTERED_LIST_PATHS.has(staticPathname) || LEGACY_FILTERED_LIST_PATHS.has(staticPathname)) {
    return "filteredList";
  }
  if (CANONICAL_ORGANIZATION_PATHS.has(staticPathname) || LEGACY_ORGANIZATION_PATHS.has(staticPathname)) {
    return "organization";
  }
  if (
    /^\/shifts\/[^/]+\/(?:board|export)$/i.test(routePathname) ||
    /^\/staff\/[^/]+$/i.test(routePathname) ||
    /^\/staff\/[^/]+\/shops\/[^/]+$/i.test(routePathname) ||
    /^\/manage\/shops\/[^/]+$/i.test(routePathname) ||
    /^\/app\/shifts\/[^/]+\/board$/i.test(routePathname) ||
    /^\/app\/staff\/[^/]+$/i.test(routePathname) ||
    /^\/app\/staff\/[^/]+\/shops\/[^/]+$/i.test(routePathname) ||
    /^\/app\/manage\/shops\/[^/]+$/i.test(routePathname)
  ) {
    return "organization";
  }

  return null;
}

function buildAppRouteSearchString(pathname: string, search: Readonly<Record<string, unknown>>): string {
  const normalized = normalizeAppRouteSearch(pathname, search);
  const params = new URLSearchParams();

  for (const key of getAllowedAppRouteSearchKeys(pathname)) {
    const value = normalized[key];
    if (value) params.set(key, value);
  }

  const serialized = params.toString();
  return serialized === "" ? "" : `?${serialized}`;
}

function normalizeSearchString(searchStr: string): string {
  if (searchStr === "") return "";
  return searchStr.startsWith("?") ? searchStr : `?${searchStr}`;
}

function isStripeCheckoutReturn(value: string | undefined): value is StripeCheckoutReturn {
  return value === "returned" || value === "cancelled";
}
