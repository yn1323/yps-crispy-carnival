import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuUserRoundX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserDetail, UserDetailSkeleton } from "@/src/components/features/UserDetail";
import {
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT,
  AuthenticatedPageContent,
} from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

export function AppUserDetailPage({
  personId,
  organizationId,
}: {
  personId: string;
  organizationId: Id<"organizations">;
}) {
  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${organizationId}:${personId}`}
        fallback={(error) => <DefaultErrorFallback error={error} minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT} />}
      >
        <ConnectedAppUserDetailPage personId={personId} organizationId={organizationId} />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedAppUserDetailPage({
  personId,
  organizationId,
}: {
  personId: string;
  organizationId: Id<"organizations">;
}) {
  const [queryNow] = useState(() => Date.now());
  const data = useQuery(api.appOrganization.detailQueries.getUserDetail, {
    organizationId,
    personId,
    now: queryNow,
  });

  if (data === undefined) return <UserDetailSkeleton />;
  if (data === null) {
    return (
      <Empty
        icon={LuUserRoundX}
        title="ユーザーを表示できません"
        description="ユーザーが削除されたか、表示する権限がありません。"
        tone="warning"
        minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT}
        action={
          <Button asChild colorPalette="teal">
            <RouterLink to="/app/staff" search={{ org: organizationId }}>
              スタッフへ戻る
            </RouterLink>
          </Button>
        }
      />
    );
  }

  return <UserDetail data={data} organizationId={organizationId} />;
}
