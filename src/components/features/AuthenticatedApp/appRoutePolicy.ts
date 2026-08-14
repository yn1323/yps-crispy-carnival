import type { AppNavigationKey } from "./AppPrimaryNavigation";

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

/** 固定画面は実scopeを受け取らないため、認証復帰先を作る前にsearchを除去する。 */
export function getCanonicalAppHref(pathname: string, searchStr: string): string | null {
  return isAppPath(pathname) && searchStr !== "" ? pathname : null;
}
