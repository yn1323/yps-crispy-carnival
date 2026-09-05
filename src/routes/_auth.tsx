import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet, redirect, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AppOrganizationScopeProvider,
  type AppOrganizationState,
  AppOrganizationStateView,
  AppOrganizationSwitcher,
  type AppRouteSearch,
  AuthGuard,
  getCanonicalAppHref,
  isAppOrganizationScopedPath,
  resolveAppFeatureRequestScope,
  resolveAppOrganizationSwitchTarget,
  resolveAppShellRouteData,
  UnauthenticatedBoundary,
  useAppOrganizationScope,
} from "@/src/components/features/AuthenticatedApp";
import { MOBILE_APP_NAVIGATION_HEIGHT } from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { AppFeatureRequestAction, type AppFeatureRequestScope } from "@/src/components/features/FeatureRequestDialog";
import { AuthenticatedAppShell } from "@/src/components/templates/AuthenticatedAppShell";
import { FocusedFlowHeader } from "@/src/components/templates/FocusedFlowHeader";
import { FullPageSpinner } from "@/src/components/templates/FullPageSpinner";
import { AUTHENTICATED_APP_HEADER_HEIGHT } from "@/src/components/templates/Header";
import {
  buildCanonicalAccountSecuritySearchString,
  needsAccountSecuritySearchCanonicalization,
  validateAccountSecuritySearch,
} from "@/src/pages/account-security/search";
import { DashboardSetupPage } from "@/src/pages/dashboard";
import { AuthProviders } from "@/src/providers/AuthProviders";

type AuthSearch = AppRouteSearch;

export const Route = createFileRoute("/_auth")({
  ssr: false,
  pendingComponent: AuthenticatedRoutePending,
  beforeLoad: ({ location }) => {
    const canonicalHref =
      getCanonicalAppHref(location.pathname, location.searchStr) ??
      getCanonicalAccountHref(location.pathname, location.searchStr);
    if (canonicalHref) {
      throw redirect({ href: canonicalHref, replace: true });
    }
  },
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const normalized: AuthSearch = {};
    for (const key of ["shop", "org", "shopFilter", "flow", "oauth"] as const) {
      const value = search[key];
      if (typeof value === "string" && value.trim() !== "") normalized[key] = value.trim();
    }
    return normalized;
  },
  component: RouteComponent,
});

function getCanonicalAccountHref(pathname: string, searchStr: string): string | null {
  if (normalizeAuthenticatedPathname(pathname) !== "/account") return null;

  const normalizedSearch = searchStr === "" || searchStr.startsWith("?") ? searchStr : `?${searchStr}`;
  const validatedSearch = validateAccountSecuritySearch(Object.fromEntries(new URLSearchParams(normalizedSearch)));
  if (pathname === "/account" && !needsAccountSecuritySearchCanonicalization(normalizedSearch, validatedSearch)) {
    return null;
  }

  return `/account${buildCanonicalAccountSecuritySearchString(validatedSearch)}`;
}

function normalizeAuthenticatedPathname(pathname: string): string {
  return (pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname).toLowerCase();
}

function AuthenticatedRoutePending() {
  const appShell = resolveAppShellRouteData(useMatches());

  return (
    <FullPageSpinner
      reserveHeaderSpace={appShell?.mode !== "bare"}
      mobileNavigationHeight={appShell?.mode === "navigation" ? MOBILE_APP_NAVIGATION_HEIGHT : undefined}
    />
  );
}

function RouteComponent() {
  return (
    <AuthProviders>
      <AuthGuard>
        <UnauthenticatedBoundary>
          <AuthenticatedLayout />
        </UnauthenticatedBoundary>
      </AuthGuard>
    </AuthProviders>
  );
}

function AuthenticatedLayout() {
  const matches = useMatches();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const normalizedPathname = normalizeAuthenticatedPathname(pathname);
  const { org, shop } = Route.useSearch();
  const appShell = resolveAppShellRouteData(matches);

  const normalizeOrganizationUrl = useCallback(
    (organizationId: Id<"organizations">) => {
      void navigate({
        to: ".",
        search: (previous) => ({ ...previous, org: organizationId }),
        replace: true,
      });
    },
    [navigate],
  );
  const openAvailableOrganization = useCallback(() => {
    void navigate({ to: "/dashboard", search: {}, replace: true });
  }, [navigate]);

  if (normalizedPathname === "/account" && appShell) {
    return (
      <AppOrganizationScopeProvider
        requestedOrganizationId={org}
        onCanonicalOrganizationResolved={normalizeOrganizationUrl}
        renderState={() => (
          <AppLayoutFrame appShell={appShell}>
            <Outlet />
          </AppLayoutFrame>
        )}
      >
        <OrganizationScopedAppLayout appShell={appShell} pathname={pathname} showOrganizationSwitcher={false} />
      </AppOrganizationScopeProvider>
    );
  }

  if (isAppOrganizationScopedPath(pathname) && appShell) {
    return (
      <AppOrganizationScopeProvider
        requestedOrganizationId={org}
        onCanonicalOrganizationResolved={normalizeOrganizationUrl}
        renderState={(state) => (
          <AppOrganizationRouteState
            appShell={appShell}
            state={state}
            onChooseAvailableOrganization={openAvailableOrganization}
            emptyContent={normalizedPathname === "/dashboard" ? <DashboardSetupPage /> : undefined}
          />
        )}
      >
        <OrganizationScopedAppLayout appShell={appShell} pathname={pathname} homeShopId={shop} />
      </AppOrganizationScopeProvider>
    );
  }

  return <Outlet />;
}

type AppShellData = NonNullable<ReturnType<typeof resolveAppShellRouteData>>;

function OrganizationScopedAppLayout({
  appShell,
  pathname,
  homeShopId,
  showOrganizationSwitcher = true,
}: {
  appShell: AppShellData;
  pathname: string;
  homeShopId?: string;
  showOrganizationSwitcher?: boolean;
}) {
  const organization = useAppOrganizationScope();
  const navigate = useNavigate();
  const featureRequest =
    pathname === "/account"
      ? {
          expectedOrganizationId: organization.organizationId,
          scope: { kind: "organization" as const },
        }
      : organization.shops
        ? {
            expectedOrganizationId: organization.organizationId,
            scope: resolveAppFeatureRequestScope({
              pathname,
              homeShopId,
              shops: organization.shops,
            }),
          }
        : undefined;
  const handleOrganizationSelect = useCallback(
    (nextOrganizationId: Id<"organizations">) => {
      if (nextOrganizationId === organization.organizationId) return;

      const target = resolveAppOrganizationSwitchTarget(pathname, nextOrganizationId);
      if (target) void navigate({ to: target.to, search: target.search });
    },
    [navigate, organization.organizationId, pathname],
  );
  const organizationSwitcher =
    showOrganizationSwitcher && appShell.mode === "navigation" ? (
      <AppOrganizationSwitcher
        activeOrganizationId={organization.organizationId}
        activeOrganizationName={organization.organizationName}
        options={organization.organizations}
        onSelect={handleOrganizationSelect}
      />
    ) : undefined;

  return (
    <AppLayoutFrame
      appShell={appShell}
      activeOrganizationId={organization.organizationId}
      organizationSwitcher={organizationSwitcher}
      featureRequest={featureRequest}
    >
      <Outlet />
    </AppLayoutFrame>
  );
}

function AppOrganizationRouteState({
  appShell,
  state,
  onChooseAvailableOrganization,
  emptyContent,
}: {
  appShell: AppShellData;
  state: AppOrganizationState;
  onChooseAvailableOrganization: () => void;
  emptyContent?: ReactNode;
}) {
  const isDashboardSetup = state.kind === "empty" && emptyContent !== undefined;
  const content =
    state.kind === "empty" && emptyContent ? (
      emptyContent
    ) : (
      <AppOrganizationStateView state={state} onChooseAvailableOrganization={onChooseAvailableOrganization} />
    );

  return (
    <AppLayoutFrame
      appShell={appShell}
      showPrimaryNavigation={!isDashboardSetup}
      organizationSwitcher={
        state.kind === "loading" && appShell.mode === "navigation" ? <OrganizationSwitcherPlaceholder /> : undefined
      }
    >
      {state.kind === "loading" ? (
        <Box
          minH={
            appShell.mode === "bare"
              ? "100dvh"
              : appShell.mode === "navigation"
                ? {
                    base: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.base} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
                    md: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.md} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
                    lg: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.md})`,
                  }
                : {
                    base: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.base})`,
                    md: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.md})`,
                    lg: `calc(100dvh - ${AUTHENTICATED_APP_HEADER_HEIGHT.md})`,
                  }
          }
          display="flex"
          alignItems="center"
          w="full"
        >
          <Box w="full">{content}</Box>
        </Box>
      ) : (
        content
      )}
    </AppLayoutFrame>
  );
}

function OrganizationSwitcherPlaceholder() {
  return <Box aria-hidden="true" w={{ base: "44px", lg: "200px" }} h="44px" flexShrink={0} />;
}

type FeatureRequestTarget = {
  expectedOrganizationId: Id<"organizations">;
  scope: AppFeatureRequestScope;
};

function AppLayoutFrame({
  appShell,
  showPrimaryNavigation = true,
  activeOrganizationId,
  organizationSwitcher,
  featureRequest,
  children,
}: {
  appShell: AppShellData;
  showPrimaryNavigation?: boolean;
  activeOrganizationId?: string;
  organizationSwitcher?: ReactNode;
  featureRequest?: FeatureRequestTarget;
  children: ReactNode;
}) {
  if (appShell.mode === "bare") {
    return (
      <Box w="full" minH="100dvh" bg="white">
        {children}
      </Box>
    );
  }

  if (appShell.mode === "navigation") {
    return (
      <AuthenticatedAppShell
        activeKey={appShell.activeKey}
        activeOrganizationId={activeOrganizationId}
        {...(showPrimaryNavigation ? {} : { showPrimaryNavigation: false })}
        organizationSwitcher={organizationSwitcher}
        featureRequest={featureRequest}
      >
        {children}
      </AuthenticatedAppShell>
    );
  }

  return (
    <Box w="full" minH="100dvh" bg="gray.50">
      <FocusedFlowHeader
        title={appShell.title}
        backLabel={appShell.backLabel}
        backAriaLabel={appShell.backLabel}
        action={featureRequest ? <AppFeatureRequestAction {...featureRequest} /> : undefined}
      />
      {children}
    </Box>
  );
}
