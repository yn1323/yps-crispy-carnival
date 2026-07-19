import { Box } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import { LuUserRoundX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import {
  getUserDetailBackDestination,
  UserDetail,
  type UserDetailReturnTo,
  UserDetailSkeleton,
  type UserDetailTab,
} from "@/src/components/features/UserDetail";
import { HEADER_HEIGHT } from "@/src/components/templates/Header";
import { RootContentWrapper } from "@/src/components/templates/RootContentWrapper";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { DEFAULT_USER_LIST_COUNT } from "@/src/lib/userListSearch";

type Props = {
  personId: string;
  selectedShopId?: string;
  defaultTab?: UserDetailTab;
  returnTo?: UserDetailReturnTo;
  returnShopId?: string;
  visibleUserCount?: number;
};

export function UserDetailPage({
  personId,
  selectedShopId,
  defaultTab = "notification",
  returnTo = "dashboard",
  returnShopId,
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
  );

  return (
    <UserDetailPageShell>
      {data === undefined ? (
        <UserDetailSkeleton />
      ) : data === null ? (
        <Empty
          icon={LuUserRoundX}
          title="ユーザーを表示できません"
          description="ユーザーが削除されたか、このグループで表示する権限がありません。"
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
                  {returnTo === "settings" ? "グループ設定へ戻る" : "ダッシュボードへ戻る"}
                </RouterLink>
              </Button>
            )
          }
        />
      ) : (
        <UserDetail
          data={data}
          selectedShopId={selectedShopId ?? null}
          activeTab={defaultTab}
          returnTo={returnTo}
          returnShopId={returnShopId}
          visibleUserCount={visibleUserCount}
        />
      )}
    </UserDetailPageShell>
  );
}

export type { UserDetailReturnTo };

function UserDetailPageShell({ children }: { children: React.ReactNode }) {
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
