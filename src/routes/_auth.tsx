import { Box, Container } from "@chakra-ui/react";
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
    <Box w="100%" minH="100vh">
      <Header />
      <Container maxW="1024px" pt="72px" pb={8} px={4} w="100%">
        <Outlet />
      </Container>
    </Box>
  );
}
