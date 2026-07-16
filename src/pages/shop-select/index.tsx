import { Box, Skeleton, Stack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtom } from "jotai";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { ShopSelectionView } from "@/src/components/features/ShopSelection";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { isSelectableShop, normalizeShopContextOptions, selectedShopAtom, toSelectedShop } from "@/src/stores/shop";

export function ShopSelectPage() {
  const navigate = useNavigate();
  const rawShops = useQuery(api.dashboard.queries.getMyShops, {});
  const [selectedShop, setSelectedShop] = useAtom(selectedShopAtom);

  const handleSelect = (shop: Parameters<typeof toSelectedShop>[0]) => {
    setSelectedShop(toSelectedShop(shop));
    void navigate({ to: "/dashboard", replace: true });
  };

  return (
    <Box minH="calc(100dvh - 68px)" bg="gray.50">
      <RootContentWrapper>
        {rawShops === undefined ? (
          <ShopSelectionSkeleton />
        ) : (
          (() => {
            const shops = normalizeShopContextOptions(rawShops).filter(isSelectableShop);
            if (shops.length === 0) {
              return (
                <Empty
                  icon={LuStore}
                  title="選べる店舗がありません"
                  description="店舗の登録状況を確認するため、ダッシュボードへ戻ってください。"
                  tone="warning"
                  action={<Button onClick={() => void navigate({ to: "/dashboard" })}>ダッシュボードへ戻る</Button>}
                />
              );
            }

            return <ShopSelectionView shops={shops} selectedShopId={selectedShop?.shopId} onSelect={handleSelect} />;
          })()
        )}
      </RootContentWrapper>
    </Box>
  );
}

const ShopSelectionSkeleton = () => (
  <Stack gap={6}>
    <Stack gap={2}>
      <Skeleton h="20px" w="140px" />
      <Skeleton h="40px" w={{ base: "90%", md: "440px" }} />
      <Skeleton h="22px" w={{ base: "100%", md: "620px" }} />
    </Stack>
    <Skeleton h="150px" borderRadius="xl" />
    <Skeleton h="150px" borderRadius="xl" />
  </Stack>
);
