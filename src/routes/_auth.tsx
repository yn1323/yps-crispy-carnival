import { Box, Container } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthGuard } from "@/src/components/features/auths/AuthGuard";
import { BottomMenu } from "@/src/components/templates/BottomMenu";
import { SideMenu } from "@/src/components/templates/SideMenu";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <AuthGuard>
      <Box display="flex" w="100vw" overflow="hidden">
        {/* PC: SideMenu */}
        <Box hideBelow="lg">
          <SideMenu />
        </Box>

        {/* Content Area */}
        <Box ml={{ base: 0, lg: "64" }} flex={1} display="flex" justifyContent="center">
          <Container maxW="container.xl" py={{ base: 2, lg: 8 }} px={4} mb={{ base: "80px", lg: 0 }} w="100%">
            <Outlet />
          </Container>
        </Box>
      </Box>

      {/* SP: BottomMenu - flex containerの外に配置 */}
      <Box hideFrom="lg">
        <BottomMenu />
      </Box>
    </AuthGuard>
  );
}
