import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthenticatedHeader, AuthGuard, UnauthenticatedBoundary } from "@/src/components/features/AuthenticatedApp";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { AuthProviders } from "@/src/providers/AuthProviders";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

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
  return (
    <Box w="100%">
      <AuthenticatedHeader />
      <Box pt={HEADER_HEIGHT} minH="100dvh">
        <Outlet />
      </Box>
    </Box>
  );
}
