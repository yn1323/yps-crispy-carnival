import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useAtomValue } from "jotai";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopDetail, ShopDetailSkeleton } from "@/src/components/features/ShopDetail";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
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
  const deletionReturnShopId =
    settings?.shops.find((candidate) => candidate.id !== shopId && candidate.id === contextShopId)?.id ??
    settings?.shops.find((candidate) => candidate.id !== shopId)?.id ??
    null;

  return (
    <AuthenticatedPageContent>
      {contextShopId === null ? (
        <Empty
          icon={LuStore}
          title="利用できる店舗がありません"
          description="店舗を登録すると、店舗の詳細を確認できます。"
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
        <ShopDetail
          shop={shop}
          people={settings?.people ?? []}
          selectedShopId={contextShopId}
          deletionReturnShopId={deletionReturnShopId}
          returnTo={returnTo}
        />
      ) : (
        <Empty
          icon={LuStore}
          title="店舗を表示できません"
          description="店舗が削除されたか、表示する権限がありません。"
          tone="warning"
          minH={{
            base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
            md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
          }}
          action={
            <Button asChild colorPalette="teal">
              {returnTo === "settings" ? (
                <RouterLink to="/settings" search={{ shop: contextShopId ?? undefined, tab: "shops" }}>
                  組織設定へ戻る
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

export function AppShopDetailPage({ shopId, organizationId }: { shopId: string; organizationId: Id<"organizations"> }) {
  return (
    <AuthenticatedPageContent>
      <ErrorBoundary key={`${organizationId}:${shopId}`} fallback={(error) => <DefaultErrorFallback error={error} />}>
        <ConnectedAppShopDetailPage shopId={shopId} organizationId={organizationId} />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedAppShopDetailPage({
  shopId,
  organizationId,
}: {
  shopId: string;
  organizationId: Id<"organizations">;
}) {
  const typedShopId = shopId as Id<"shops">;
  const settings = useQuery(api.organization.queries.getSettings, {
    shopId: typedShopId,
    expectedOrganizationId: organizationId,
  });
  const shop = settings?.shops.find((candidate) => candidate.id === shopId) ?? null;

  if (settings === undefined) return <ShopDetailSkeleton />;
  if (!settings || !shop) {
    return (
      <Empty
        icon={LuStore}
        title="店舗を表示できません"
        description="店舗が削除されたか、表示する権限がありません。"
        tone="warning"
        minH={{
          base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
          md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
        }}
        action={
          <Button asChild colorPalette="teal">
            <RouterLink to="/app/manage" search={{ org: organizationId }}>
              管理へ戻る
            </RouterLink>
          </Button>
        }
      />
    );
  }

  return (
    <ShopDetail
      shop={shop}
      people={settings.people}
      selectedShopId={shopId}
      deletionReturnShopId={settings.shops.find((candidate) => candidate.id !== shopId)?.id ?? null}
      appOrganizationId={organizationId}
    />
  );
}
