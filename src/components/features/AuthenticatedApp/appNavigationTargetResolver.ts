import {
  type AppNavigationPath,
  type AppOrganizationScopedNavigationPath,
  normalizeAppRouteSearch,
} from "./appRoutePolicy";

type AppNavigationScopeSearch<Path extends AppNavigationPath> = Path extends "/account"
  ? Readonly<{ org?: never }>
  : Readonly<{ org?: string }>;

export type AppNavigationTarget<Path extends AppNavigationPath = AppNavigationPath> = {
  to: Path;
  search: AppNavigationScopeSearch<Path>;
};

export function resolveAppNavigationTarget<Path extends AppNavigationPath>(
  to: Path,
  activeOrganizationId: string | null | undefined,
): AppNavigationTarget<Path> {
  const search = normalizeAppRouteSearch(to, { org: activeOrganizationId });

  return {
    to,
    search: search as AppNavigationScopeSearch<Path>,
  };
}

export type { AppNavigationPath, AppOrganizationScopedNavigationPath };
