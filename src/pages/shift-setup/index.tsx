import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { LuSlidersHorizontal } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftSetup, ShiftSetupSkeleton } from "@/src/components/features/ShiftSetup";
import {
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT,
  AuthenticatedPageContent,
} from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = { shopId: string; organizationId: Id<"organizations"> };

export function AppShiftSetupPage({ shopId, organizationId }: Props) {
  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${organizationId}:${shopId}`}
        fallback={(error) => <DefaultErrorFallback error={error} minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT} />}
      >
        <ConnectedAppShiftSetupPage shopId={shopId} organizationId={organizationId} />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedAppShiftSetupPage({ shopId, organizationId }: Props) {
  const typedShopId = shopId as Id<"shops">;
  const setup = useQuery(api.shiftSetup.queries.getShiftSetup, {
    shopId: typedShopId,
    expectedOrganizationId: organizationId,
  });

  if (setup === undefined) return <ShiftSetupSkeleton />;
  if (setup === null) {
    return (
      <Empty
        icon={LuSlidersHorizontal}
        title="設定を表示できません"
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

  return <ShiftSetup shopId={typedShopId} organizationId={organizationId} setup={setup} />;
}
