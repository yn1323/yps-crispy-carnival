import { Box, Container } from "@chakra-ui/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { api } from "@/convex/_generated/api";
import { AuthGuard } from "@/src/components/features/auths/AuthGuard";
import { BottomMenu } from "@/src/components/templates/BottomMenu";
import { SideMenu } from "@/src/components/templates/SideMenu";
import { useInitializeShop } from "@/src/hooks/useInitializeShop";
import { userAtom } from "@/src/stores/user";

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

// 認証済みレイアウト: AuthGuard通過後にuserAtomが利用可能
const AuthenticatedLayout = () => {
  const user = useAtomValue(userAtom);

  // 店舗一覧取得
  const shops = useQuery(api.shop.queries.listByAuthId, user.authId ? { authId: user.authId } : "skip");

  // 初期店舗選択ロジック呼び出し
  const { selectedShop, setSelectedShop } = useInitializeShop(shops);

  const handleShopChange = (shop: { shopId: string; shopName: string }) => {
    setSelectedShop(shop);
  };

  return (
    <>
      <Box display="flex" w="100vw" overflow="hidden">
        {/* PC: SideMenu */}
        <Box hideBelow="lg">
          <SideMenu shops={shops} selectedShopId={selectedShop?.shopId ?? null} onShopChange={handleShopChange} />
        </Box>

        {/* Content Area */}
        <Box ml={{ base: 0, lg: "64" }} flex={1} display="flex" justifyContent="center" bg="gray.50" minH="100vh">
          <Container maxW="container.xl" py={{ base: 2, lg: 8 }} px={4} mb={{ base: "80px", lg: 0 }} w="100%">
            <Outlet />
          </Container>
        </Box>
      </Box>

      {/* SP: BottomMenu - flex containerの外に配置 */}
      <Box hideFrom="lg">
        <BottomMenu shops={shops ?? []} selectedShopId={selectedShop?.shopId ?? null} onShopChange={handleShopChange} />
      </Box>
    </>
  );
};
