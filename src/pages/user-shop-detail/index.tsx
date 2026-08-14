import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserShopDetailBackDestination, type UserDetailReturnTo } from "@/src/components/features/UserDetail";
import { UserShopDetail, UserShopDetailSkeleton } from "@/src/components/features/UserShopDetail";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { DEFAULT_USER_LIST_COUNT } from "@/src/lib/userListSearch";

type Props = {
  personId: string;
  targetShopId: string;
  selectedShopId?: string;
  returnTo?: UserDetailReturnTo;
  returnShopId?: string;
  returnShopTo?: "dashboard";
  visibleUserCount?: number;
  appOrganizationId?: Id<"organizations">;
};

export function UserShopDetailPage(props: Props) {
  return (
    <AuthenticatedPageContent>
      <ErrorBoundary
        key={`${props.appOrganizationId ?? "legacy"}:${props.personId}:${props.targetShopId}`}
        fallback={(error) => <DefaultErrorFallback error={error} minH={pageMinimumHeight} />}
      >
        <ConnectedUserShopDetailPage {...props} />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedUserShopDetailPage({
  personId,
  targetShopId,
  selectedShopId,
  returnTo = "dashboard",
  returnShopId,
  returnShopTo,
  visibleUserCount = DEFAULT_USER_LIST_COUNT,
  appOrganizationId,
}: Props) {
  const navigate = useNavigate();
  // 同じ画面を開いている間はcapability判定時刻を固定する。
  const [queryNow] = useState(() => Date.now());
  const typedTargetShopId = targetShopId as Id<"shops">;
  const data = useQuery(api.organization.userDetailQueries.getUserDetail, {
    shopId: typedTargetShopId,
    personId,
    now: queryNow,
    requireTargetShopMembership: true,
    ...(appOrganizationId ? { expectedOrganizationId: appOrganizationId } : {}),
  });
  const membership = data?.memberships.find((candidate) => candidate.shopId === targetShopId);
  const backDestination = getUserShopDetailBackDestination(
    personId,
    selectedShopId ?? null,
    returnTo,
    visibleUserCount,
    returnShopId,
    returnShopTo,
  );
  const handleBack = () => {
    if (appOrganizationId) {
      void navigate({
        to: "/app/staff/$personId",
        params: { personId },
        search: { org: appOrganizationId },
        replace: true,
      });
      return;
    }
    void navigate({ ...backDestination, replace: true });
  };

  if (data === undefined) return <UserShopDetailSkeleton />;

  if (data === null || !membership) {
    return (
      <Empty
        icon={LuStore}
        title="店舗別設定を表示できません"
        description="ユーザーまたは店舗への所属が削除されたか、この店舗を表示する権限がありません。"
        tone="warning"
        minH={pageMinimumHeight}
        action={
          <Button colorPalette="teal" onClick={handleBack}>
            スタッフ詳細へ戻る
          </Button>
        }
      />
    );
  }

  return (
    <UserShopDetail
      data={data}
      membership={membership}
      targetShopId={typedTargetShopId}
      expectedOrganizationId={appOrganizationId}
      onBack={handleBack}
    />
  );
}

const pageMinimumHeight = {
  base: `calc(100dvh - ${HEADER_HEIGHT.base} - 32px)`,
  md: `calc(100dvh - ${HEADER_HEIGHT.md} - 64px)`,
};
