import { Box } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { ShopDetail, ShopDetailSkeleton, type ShopDetailTab } from "@/src/components/features/ShopDetail";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { selectedShopAtom } from "@/src/stores/shop";

type Props = {
  shopId: string;
  selectedShopId?: string;
  defaultTab?: ShopDetailTab;
};

export function ShopDetailPage({ shopId, selectedShopId, defaultTab = "information" }: Props) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});
  const selectedShop = useAtomValue(selectedShopAtom);
  const contextShopId = selectedShopId ?? selectedShop?.shopId ?? null;
  const shop = settings?.shops.find((candidate) => candidate.id === shopId) ?? null;

  return (
    <ShopDetailPageShell>
      {contextShopId === null ? (
        <Empty
          icon={LuStore}
          title="利用できる店舗がありません"
          description="店舗を登録すると、店舗詳細を確認できます。"
          minH={{
            base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
            md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
          }}
          action={
            <Button asChild colorPalette="teal">
              <RouterLink to="/dashboard" search={{}}>
                店舗登録へ
              </RouterLink>
            </Button>
          }
        />
      ) : settings === undefined ? (
        <ShopDetailSkeleton />
      ) : shop ? (
        <ShopDetail shop={shop} selectedShopId={contextShopId} activeTab={defaultTab} />
      ) : (
        <Empty
          icon={LuStore}
          title="店舗を表示できません"
          description="店舗が削除されたか、このグループで表示する権限がありません。"
          tone="warning"
          minH={{
            base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
            md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
          }}
          action={
            <Button asChild colorPalette="teal">
              <RouterLink to="/settings" search={{ shop: contextShopId ?? undefined, tab: "shops" }}>
                グループ設定へ戻る
              </RouterLink>
            </Button>
          }
        />
      )}
    </ShopDetailPageShell>
  );
}

function ShopDetailPageShell({ children }: { children: React.ReactNode }) {
  return (
    <Box
      minH={{
        base: `calc(100dvh - ${HEADER_HEIGHT.base})`,
        md: `calc(100dvh - ${HEADER_HEIGHT.md})`,
      }}
      bg="gray.50"
    >
      <RootContentWrapper>{children}</RootContentWrapper>
    </Box>
  );
}
