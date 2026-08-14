import type { AppNavigationKey } from "./AppPrimaryNavigation";

export type AppOrganizationScopedNavigationPath =
  | "/app/home"
  | "/app/shifts"
  | `/app/shifts/${string}/board`
  | "/app/staff"
  | `/app/staff/${string}`
  | "/app/actions"
  | "/app/manage"
  | "/app/manage/organization"
  | "/app/manage/managers"
  | "/app/manage/managers/invite-staff"
  | "/app/manage/managers/invite-new"
  | "/app/manage/billing"
  | `/app/manage/shops/${string}`;

export type AppNavigationPath = AppOrganizationScopedNavigationPath | "/app/account";

export type AppRouteSearch = {
  org?: string;
  shop?: string;
  shopFilter?: string;
  flow?: string;
  oauth?: string;
};

export type AppOrganizationRouteSearch = Pick<AppRouteSearch, "org">;
export type AppHomeRouteSearch = Pick<AppRouteSearch, "org" | "shop">;
export type AppFilteredListRouteSearch = Pick<AppRouteSearch, "org" | "shopFilter">;

type AppRouteSearchKey = keyof AppRouteSearch;

const NO_APP_SEARCH_KEYS: readonly AppRouteSearchKey[] = [];
const ORGANIZATION_SEARCH_KEYS = ["org"] as const satisfies readonly AppRouteSearchKey[];
const HOME_SEARCH_KEYS = ["org", "shop"] as const satisfies readonly AppRouteSearchKey[];
const FILTERED_LIST_SEARCH_KEYS = ["org", "shopFilter"] as const satisfies readonly AppRouteSearchKey[];
const ACCOUNT_SEARCH_KEYS = ["flow", "oauth"] as const satisfies readonly AppRouteSearchKey[];

export type AppShellRouteData =
  | {
      mode: "navigation";
      activeKey: AppNavigationKey | null;
    }
  | {
      mode: "focused";
      title: string;
      backTo: "/app/shifts" | "/app/manage/managers";
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

export function isAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

export function normalizeAppRouteSearch(pathname: string, search: Readonly<Record<string, unknown>>): AppRouteSearch {
  const normalized: AppRouteSearch = {};

  for (const key of getAllowedAppRouteSearchKeys(pathname)) {
    const value = search[key];
    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (trimmed !== "") normalized[key] = trimmed;
  }

  return normalized;
}

export function validateAppOrganizationRouteSearch(search: Record<string, unknown>): AppOrganizationRouteSearch {
  const { org } = normalizeAppRouteSearch("/app/manage", search);
  return org ? { org } : {};
}

export function validateAppHomeRouteSearch(search: Record<string, unknown>): AppHomeRouteSearch {
  const { org, shop } = normalizeAppRouteSearch("/app/home", search);
  return { ...(org ? { org } : {}), ...(shop ? { shop } : {}) };
}

export function validateAppFilteredListRouteSearch(search: Record<string, unknown>): AppFilteredListRouteSearch {
  const { org, shopFilter } = normalizeAppRouteSearch("/app/staff", search);
  return { ...(org ? { org } : {}), ...(shopFilter ? { shopFilter } : {}) };
}

/** 認証復帰前にroute別allowlist外と空値を除去し、一意なsearchへ収束させる。 */
export function getCanonicalAppHref(pathname: string, searchStr: string): string | null {
  if (!isAppPath(pathname)) return null;

  const currentSearch = normalizeSearchString(searchStr);
  const rawSearch = Object.fromEntries(new URLSearchParams(currentSearch));
  const canonicalSearch = buildAppRouteSearchString(pathname, rawSearch);

  return currentSearch === canonicalSearch ? null : `${pathname}${canonicalSearch}`;
}

function getAllowedAppRouteSearchKeys(pathname: string): readonly AppRouteSearchKey[] {
  if (pathname === "/app") return ORGANIZATION_SEARCH_KEYS;
  if (pathname === "/app/home") return HOME_SEARCH_KEYS;
  if (pathname === "/app/shifts" || pathname === "/app/staff" || pathname === "/app/actions") {
    return FILTERED_LIST_SEARCH_KEYS;
  }
  if (pathname === "/app/account") return ACCOUNT_SEARCH_KEYS;

  if (
    pathname.startsWith("/app/shifts/") ||
    pathname.startsWith("/app/staff/") ||
    pathname === "/app/manage" ||
    pathname.startsWith("/app/manage/")
  ) {
    return ORGANIZATION_SEARCH_KEYS;
  }

  return NO_APP_SEARCH_KEYS;
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
