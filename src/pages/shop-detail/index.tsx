import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShopDetail, ShopDetailSkeleton } from "@/src/components/features/ShopDetail";
import {
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT,
  AuthenticatedPageContent,
} from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

export function AppShopDetailPage({ shopId, organizationId }: { shopId: string; organizationId: Id<"organizations"> }) {
  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${organizationId}:${shopId}`}
        fallback={(error) => <DefaultErrorFallback error={error} minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT} />}
      >
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
        minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT}
        action={
          <Button asChild colorPalette="teal">
            <RouterLink to="/manage" search={{ org: organizationId }}>
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
      organizationId={organizationId}
      isShopAdditionEnabled={settings.features?.shopAddition === true}
    />
  );
}
