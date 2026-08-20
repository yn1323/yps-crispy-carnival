import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { LuStore } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { UserShopDetail, UserShopDetailSkeleton } from "@/src/components/features/UserShopDetail";
import {
  AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT,
  AuthenticatedPageContent,
} from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { DefaultErrorFallback, ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

type Props = {
  personId: string;
  targetShopId: string;
  appOrganizationId: Id<"organizations">;
};

export function UserShopDetailPage(props: Props) {
  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${props.appOrganizationId}:${props.personId}:${props.targetShopId}`}
        fallback={(error) => <DefaultErrorFallback error={error} minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT} />}
      >
        <ConnectedUserShopDetailPage {...props} />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedUserShopDetailPage({ personId, targetShopId, appOrganizationId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  // 同じ画面を開いている間はcapability判定時刻を固定する。
  const [queryNow] = useState(() => Date.now());
  const typedTargetShopId = targetShopId as Id<"shops">;
  const data = useQuery(api.organization.userDetailQueries.getUserDetail, {
    shopId: typedTargetShopId,
    personId,
    now: queryNow,
    requireTargetShopMembership: true,
    expectedOrganizationId: appOrganizationId,
  });
  const membership = data?.memberships.find((candidate) => candidate.shopId === targetShopId);
  const navigateToUserDetail = () => {
    void navigate({
      to: "/staff/$personId",
      params: { personId },
      search: { org: appOrganizationId },
      replace: true,
    });
  };
  const handleBack = () => router.history.back();

  if (data === undefined) return <UserShopDetailSkeleton />;

  if (data === null || !membership) {
    return (
      <Empty
        icon={LuStore}
        title="店舗別設定を表示できません"
        description="ユーザーまたは店舗への所属が削除されたか、この店舗を表示する権限がありません。"
        tone="warning"
        minH={AUTHENTICATED_APP_PAGE_CONTENT_HEIGHT}
        action={
          <Button colorPalette="teal" onClick={navigateToUserDetail}>
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
