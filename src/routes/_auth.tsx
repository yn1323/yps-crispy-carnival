import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "@/src/components/features/auths/AuthGuard";
import { Header } from "@/src/components/templates/Header";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthGuard>
      <AuthenticatedLayout />
    </AuthGuard>
  );
}

function AuthenticatedLayout() {
  return (
    <Box w="100%">
      <Header />
      <Box pt="56px" minH="100dvh">
        <Outlet />
      </Box>
    </Box>
  );
}
