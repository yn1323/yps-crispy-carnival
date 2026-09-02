import { Box, Flex } from "@chakra-ui/react";
import { useQuery } from "convex/react";
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftBoardPage } from "@/src/components/features/ShiftBoard";
import { Animation } from "@/src/components/templates/Animation";
import { AUTHENTICATED_APP_CONTENT_HEIGHT } from "@/src/components/templates/AuthenticatedAppShell";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { ShiftoriLoading } from "@/src/components/ui/ShiftoriLoading";
import { formatDateShort } from "@/src/domains/shift/date";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";
import { useRetainedShiftBoardData } from "./useRetainedShiftBoardData";
import { useShiftBoardDayKey } from "./useShiftBoardDayKey";

type Props = {
  organizationId: string;
  recruitmentId: string;
};

export function AppShiftBoardRoutePage({ organizationId, recruitmentId }: Props) {
  return (
    <Flex direction="column" h={AUTHENTICATED_APP_CONTENT_HEIGHT} minH={0}>
      <Box flex={1} minH={0}>
        <ErrorBoundary
          fallback={
            <ShiftBoardUnavailable
              title="シフト表を読み込めませんでした"
              description="通信状態を確認して、もう一度お試しください。"
              retry
            />
          }
        >
          <AppShiftBoardQuery organizationId={organizationId} recruitmentId={recruitmentId} />
        </ErrorBoundary>
      </Box>
    </Flex>
  );
}

function AppShiftBoardQuery({ organizationId, recruitmentId }: Required<Props>) {
  const organizationDocumentId = organizationId as Id<"organizations">;
  const recruitmentDocumentId = recruitmentId as Id<"recruitments">;
  const refreshDayKey = useShiftBoardDayKey();
  const shopScope = useQuery(api.shiftBoard.queries.getShiftBoardShopScopeForOrganization, {
    organizationId: organizationDocumentId,
    recruitmentId: recruitmentDocumentId,
  });
  const queriedData = useQuery(
    api.shiftBoard.queries.getShiftBoardData,
    shopScope
      ? {
          shopId: shopScope.shopId,
          expectedOrganizationId: organizationDocumentId,
          recruitmentId: recruitmentDocumentId,
          refreshDayKey,
        }
      : "skip",
  );
  const data = useRetainedShiftBoardData(
    `${organizationId}:${shopScope?.shopId ?? "none"}:${recruitmentId}`,
    queriedData,
  );
  if (shopScope === undefined) {
    return <ShiftoriLoading variant="section" message="シフト表を読み込んでいます" minH="full" />;
  }
  if (shopScope === null) {
    return (
      <ShiftBoardUnavailable
        title="シフト表が見つかりません"
        description="募集が削除されたか、この組織から閲覧できない可能性があります。"
      />
    );
  }
  if (data === undefined) {
    return <ShiftoriLoading variant="section" message="シフト表を読み込んでいます" minH="full" />;
  }
  if (data === null) {
    return (
      <ShiftBoardUnavailable
        title="シフト表が見つかりません"
        description="募集が削除されたか、この組織から閲覧できない可能性があります。"
      />
    );
  }

  const periodTitle = `${formatDateShort(data.recruitment.periodStart)} 〜 ${formatDateShort(data.recruitment.periodEnd)}`;

  return (
    <Animation>
      <ManagerShopScopeProvider shopId={shopScope.shopId} expectedOrganizationId={organizationDocumentId}>
        <ShiftBoardPage
          data={data}
          recruitmentId={recruitmentDocumentId}
          layout="app"
          header={{
            desktopTitle: `${shopScope.shopName}：${periodTitle}`,
            mobileTitle: periodTitle,
            backLabel: "前の画面へ戻る",
            backAriaLabel: "前の画面へ戻る",
          }}
        />
      </ManagerShopScopeProvider>
    </Animation>
  );
}

function ShiftBoardUnavailable({
  title,
  description,
  retry = false,
}: {
  title: string;
  description: string;
  retry?: boolean;
}) {
  return (
    <Empty
      icon={retry ? LuRefreshCw : LuTriangleAlert}
      title={title}
      description={description}
      tone="warning"
      minH="full"
      action={
        retry ? (
          <Button colorPalette="teal" size="md" borderRadius="lg" px={6} onClick={() => window.location.reload()}>
            再読み込みする
          </Button>
        ) : undefined
      }
    />
  );
}
