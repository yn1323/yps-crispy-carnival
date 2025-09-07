import { Box } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SideMenu } from "@/src/components/layout/SideMenu";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Box display="flex">
      <SideMenu />
      <Box ml="250px" mt={4} mr={4} flex={1}>
        <Outlet />
      </Box>
    </Box>
  );
}
