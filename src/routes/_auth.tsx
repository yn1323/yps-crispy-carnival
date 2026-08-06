import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { AuthenticatedHeader, AuthGuard, UnauthenticatedBoundary } from "@/src/components/features/AuthenticatedApp";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { clearRequestedShopSearch, normalizeShopSearch } from "@/src/lib/authenticatedSearch";
import { AuthProviders } from "@/src/providers/AuthProviders";

type AuthSearch = { shop?: string };

export const Route = createFileRoute("/_auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const shop = typeof search.shop === "string" && search.shop.trim() !== "" ? search.shop : undefined;
    return shop ? { shop } : {};
  },
  component: RouteComponent,
});

function RouteComponent() {
  // pathless親routeのRoute.useNavigate()は"/"基準になるため、searchだけの更新でもLPへ遷移してしまう。
  const navigate = useNavigate();
  const { shop } = Route.useSearch();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const requiresShopContext = pathname !== "/account";

  useEffect(() => {
    if (requiresShopContext || !shop) return;

    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, shop: undefined }),
      replace: true,
    });
  }, [navigate, requiresShopContext, shop]);

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
  return (
    <Box w="100%">
      <AuthenticatedHeader />
      <Box pt={HEADER_HEIGHT} minH="100dvh">
        <Outlet />
      </Box>
    </Box>
  );
}
