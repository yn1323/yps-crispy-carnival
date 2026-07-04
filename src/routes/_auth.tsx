import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthenticatedHeader } from "@/src/components/features/auths/AuthenticatedHeader";
import { AuthGuard } from "@/src/components/features/auths/AuthGuard";
import { UnauthenticatedBoundary } from "@/src/components/features/auths/UnauthenticatedBoundary";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthGuard>
      <UnauthenticatedBoundary>
        <AuthenticatedLayout />
      </UnauthenticatedBoundary>
    </AuthGuard>
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
