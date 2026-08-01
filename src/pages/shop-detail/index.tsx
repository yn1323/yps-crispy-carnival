import { Link as RouterLink } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import { ShopDetail, ShopDetailSkeleton } from "@/src/components/features/ShopDetail";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { selectedShopAtom } from "@/src/stores/shop";

type Props = {
  shopId: string;
  selectedShopId?: string;
  returnTo?: "dashboard" | "settings";
};

export function ShopDetailPage({ shopId, selectedShopId, returnTo }: Props) {
  const settings = useShopQuery(api.organization.queries.getSettings, {});
  const selectedShop = useAtomValue(selectedShopAtom);
  const contextShopId = selectedShopId ?? selectedShop?.shopId ?? null;
  const shop = settings?.shops.find((candidate) => candidate.id === shopId) ?? null;

  return (
    <AuthenticatedPageContent>
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
        <ShopDetail shop={shop} people={settings?.people ?? []} selectedShopId={contextShopId} returnTo={returnTo} />
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
              {returnTo === "settings" ? (
                <RouterLink to="/settings" search={{ shop: contextShopId ?? undefined, tab: "shops" }}>
                  グループ設定へ戻る
                </RouterLink>
              ) : (
                <RouterLink to="/dashboard" search={{ shop: contextShopId ?? undefined }}>
                  ダッシュボードへ戻る
                </RouterLink>
              )}
            </Button>
          }
        />
      )}
    </AuthenticatedPageContent>
  );
}
