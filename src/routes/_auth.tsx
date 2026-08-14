import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet, redirect, useMatches, useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AppOrganizationScopeProvider,
  type AppOrganizationState,
  AppOrganizationStateView,
  AppOrganizationSwitcher,
  type AppRouteSearch,
  AuthenticatedHeader,
  AuthGuard,
  getCanonicalAppHref,
  isAppPath,
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
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { clearRequestedShopSearch, normalizeShopSearch } from "@/src/lib/authenticatedSearch";
import { AuthProviders } from "@/src/providers/AuthProviders";

type AuthSearch = AppRouteSearch;

export const Route = createFileRoute("/_auth")({
  ssr: false,
  beforeLoad: ({ location }) => {
    const canonicalHref = getCanonicalAppHref(location.pathname, location.searchStr);
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

function RouteComponent() {
  // pathless親routeのRoute.useNavigate()は"/"基準になるため、searchだけの更新でもLPへ遷移してしまう。
  const navigate = useNavigate();
  const { shop } = Route.useSearch();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const requiresShopContext = pathname !== "/account" && !isAppPath(pathname);

  useEffect(() => {
    if (pathname !== "/account" || !shop) return;

    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, shop: undefined }),
      replace: true,
    });
  }, [navigate, pathname, shop]);

  const normalizeShopUrl = useCallback(
    (shopId: string) => {
      void navigate({
        to: ".",
        search: (previous) => normalizeShopSearch(previous, shopId),
        replace: true,
      });
    },
    [navigate],
  );
  const returnToDashboard = useCallback(() => {
    void navigate({ to: "/dashboard", search: clearRequestedShopSearch(), replace: true });
  }, [navigate]);

  return (
    <AuthProviders>
      <AuthGuard
        requiresShopContext={requiresShopContext}
        requestedShopId={requiresShopContext ? shop : undefined}
        onNormalizeShopUrl={normalizeShopUrl}
        onReturnToDashboard={returnToDashboard}
      >
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
    void navigate({ to: "/app/home", search: {}, replace: true });
  }, [navigate]);

  if (pathname === "/app/account" && appShell) {
    return (
      <AppLayoutFrame appShell={appShell}>
        <Outlet />
      </AppLayoutFrame>
    );
  }

  if (isAppPath(pathname) && appShell) {
    return (
      <AppOrganizationScopeProvider
        requestedOrganizationId={org}
        onCanonicalOrganizationResolved={normalizeOrganizationUrl}
        renderState={(state) => (
          <AppOrganizationRouteState
            appShell={appShell}
            state={state}
            onChooseAvailableOrganization={openAvailableOrganization}
          />
        )}
      >
        <OrganizationScopedAppLayout appShell={appShell} pathname={pathname} homeShopId={shop} />
      </AppOrganizationScopeProvider>
    );
  }

  return (
    <Box w="100%">
      <AuthenticatedHeader />
      <Box pt={HEADER_HEIGHT} minH="100dvh">
        <Outlet />
      </Box>
    </Box>
  );
}

type AppShellData = NonNullable<ReturnType<typeof resolveAppShellRouteData>>;

function OrganizationScopedAppLayout({
  appShell,
  pathname,
  homeShopId,
}: {
  appShell: AppShellData;
  pathname: string;
  homeShopId?: string;
}) {
  const organization = useAppOrganizationScope();
  const navigate = useNavigate();
  const featureRequest = organization.activeShops
    ? {
        expectedOrganizationId: organization.organizationId,
        scope: resolveAppFeatureRequestScope({
          pathname,
          homeShopId,
          activeShops: organization.activeShops,
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
    appShell.mode === "navigation" ? (
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
}: {
  appShell: AppShellData;
  state: AppOrganizationState;
  onChooseAvailableOrganization: () => void;
}) {
  const content = (
    <AppOrganizationStateView state={state} onChooseAvailableOrganization={onChooseAvailableOrganization} />
  );

  return (
    <AppLayoutFrame
      appShell={appShell}
      organizationSwitcher={
        state.kind === "loading" && appShell.mode === "navigation" ? <OrganizationSwitcherPlaceholder /> : undefined
      }
    >
      {state.kind === "loading" ? (
        <Box
          minH={{
            base: `calc(100dvh - ${HEADER_HEIGHT.base} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
            md: `calc(100dvh - ${HEADER_HEIGHT.md} - ${MOBILE_APP_NAVIGATION_HEIGHT} - env(safe-area-inset-bottom))`,
            lg: `calc(100dvh - ${HEADER_HEIGHT.md})`,
          }}
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
  activeOrganizationId,
  organizationSwitcher,
  featureRequest,
  children,
}: {
  appShell: AppShellData;
  activeOrganizationId?: string;
  organizationSwitcher?: ReactNode;
  featureRequest?: FeatureRequestTarget;
  children: ReactNode;
}) {
  if (appShell.mode === "navigation") {
    return (
      <AuthenticatedAppShell
        activeKey={appShell.activeKey}
        activeOrganizationId={activeOrganizationId}
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
        backTo={appShell.backTo}
        backLabel={appShell.backLabel}
        backAriaLabel={appShell.backLabel}
        activeOrganizationId={activeOrganizationId}
        action={featureRequest ? <AppFeatureRequestAction {...featureRequest} /> : undefined}
      />
      {children}
    </Box>
  );
}
