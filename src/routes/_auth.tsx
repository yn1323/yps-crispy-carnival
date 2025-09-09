import { Box, Spinner } from "@chakra-ui/react";
import { useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { SideMenu } from "@/src/components/layout/SideMenu";

export const Route = createFileRoute("/_auth")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isLoaded, isSignedIn } = useAuth();

  // ローディング中
  if (!isLoaded) {
    // TODO: いい感じにしたい
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <Spinner />
      </Box>
    );
  }

  // 未認証の場合、TOPにリダイレクト
  if (!isSignedIn) {
    return <Navigate to="/" />;
  }

  return (
    <Box display="flex">
      <SideMenu />
      <Box ml="250px" mt={4} mr={4} flex={1}>
        <Outlet />
      </Box>
    </Box>
  );
}
