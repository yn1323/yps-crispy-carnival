import { Link as RouterLink } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuUserRoundX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  getUserDetailBackDestination,
  UserDetail,
  type UserDetailPanel,
  type UserDetailReturnTo,
  UserDetailSkeleton,
} from "@/src/components/features/UserDetail";
import {
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT,
  AuthenticatedPageContent,
} from "@/src/components/templates/AuthenticatedPageContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { DEFAULT_USER_LIST_COUNT } from "@/src/lib/userListSearch";

type Props = {
  personId: string;
  selectedShopId?: string;
  activePanel?: UserDetailPanel;
  returnTo?: UserDetailReturnTo;
  returnShopId?: string;
  returnShopTo?: "dashboard";
  visibleUserCount?: number;
};

export function UserDetailPage({
  personId,
  selectedShopId,
  activePanel,
  returnTo = "dashboard",
  returnShopId,
  returnShopTo,
  visibleUserCount = DEFAULT_USER_LIST_COUNT,
}: Props) {
  // query内の判定時刻を購読中に動かさず、同じ画面表示では同じcapability結果を使う。
  const [queryNow] = useState(() => Date.now());
  const data = useShopQuery(api.organization.userDetailQueries.getUserDetail, { personId, now: queryNow });
  const backDestination = getUserDetailBackDestination(
    returnTo,
    selectedShopId ?? null,
    visibleUserCount,
    personId,
    returnShopId,
    returnShopTo,
  );

  return (
    <AuthenticatedPageContent>
      {data === undefined ? (
        <UserDetailSkeleton />
      ) : data === null ? (
        <Empty
          icon={LuUserRoundX}
          title="ユーザーを表示できません"
          description="ユーザーが削除されたか、表示する権限がありません。"
          tone="warning"
          minH={{
            base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
            md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
          }}
          action={
            backDestination.to === "/shops/$shopId" ? (
              <Button asChild colorPalette="teal">
                <RouterLink to="/shops/$shopId" params={backDestination.params} search={backDestination.search}>
                  店舗詳細へ戻る
                </RouterLink>
              </Button>
            ) : (
              <Button asChild colorPalette="teal">
                <RouterLink to={backDestination.to} search={backDestination.search}>
                  {returnTo === "settings" ? "組織設定へ戻る" : "ダッシュボードへ戻る"}
                </RouterLink>
              </Button>
            )
          }
        />
      ) : (
        <UserDetail
          data={data}
          selectedShopId={selectedShopId ?? null}
          activePanel={activePanel}
          returnTo={returnTo}
          returnShopId={returnShopId}
          returnShopTo={returnShopTo}
          visibleUserCount={visibleUserCount}
        />
      )}
    </AuthenticatedPageContent>
  );
}

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

  return (
    <UserDetail
      data={data}
      selectedShopId={null}
      returnTo="dashboard"
      visibleUserCount={DEFAULT_USER_LIST_COUNT}
      appOrganizationId={organizationId}
    />
  );
}

export type { UserDetailReturnTo };
