import { Alert, Box, Flex, Heading, HStack, Icon, Skeleton, Stack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { LuCalendarDays, LuRefreshCw } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE } from "@/convex/constants";
import { ShopFilterMenu } from "@/src/components/features/AuthenticatedApp/ShopFilterMenu";
import { RecruitmentBoardSkeleton } from "@/src/components/features/Dashboard/RecruitmentBoard";
import { mergeDashboardRecruitmentGroups } from "@/src/components/features/Dashboard/script";
import type { DashboardRecruitmentGroup, Recruitment } from "@/src/components/features/Dashboard/types";
import { OrganizationRecruitmentManagement } from "@/src/components/features/OrganizationRecruitmentManagement";
import { Animation } from "@/src/components/templates/Animation";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { resolveShopFilter } from "@/src/domains/shop/filter";

export type RecruitmentSection = FunctionReturnType<
  typeof api.appOrganization.queries.listOrganizationRecruitments
>["page"][number];

export type ShopOption = {
  id: Id<"shops">;
  name: string;
};

type Props = {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
  activeShops: ShopOption[] | null;
  requestedShopFilter?: string;
};

export function AppShiftsRoutePage(props: Props) {
  const navigate = useNavigate();
  const [retryRevision, setRetryRevision] = useState(0);
  const resolvedFilter = useMemo(
    () => resolveShopFilter(props.activeShops, props.requestedShopFilter),
    [props.activeShops, props.requestedShopFilter],
  );
  const shouldReplaceSearch = resolvedFilter.kind === "ready" && resolvedFilter.shouldReplaceSearch;

  useEffect(() => {
    if (!shouldReplaceSearch) return;
    void navigate({
      to: "/shifts",
      search: { org: props.organizationId },
      replace: true,
    });
  }, [navigate, props.organizationId, shouldReplaceSearch]);

  if (resolvedFilter.kind === "loading") {
    return (
      <AuthenticatedPageContent includeMobileNavigation>
        <AppShiftsPageStateView state={{ kind: "loading" }} />
      </AuthenticatedPageContent>
    );
  }

  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${props.organizationId}:${retryRevision}`}
        fallback={
          <AppShiftsPageStateView
            state={{ kind: "error" }}
            onRetry={() => setRetryRevision((revision) => revision + 1)}
          />
        }
      >
        <ConnectedAppShifts
          organizationId={props.organizationId}
          memberStatus={props.memberStatus}
          activeShops={props.activeShops ?? []}
          shopFilter={resolvedFilter.shopFilter}
        />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedAppShifts({
  organizationId,
  memberStatus,
  activeShops,
  shopFilter,
}: {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
  activeShops: ShopOption[];
  shopFilter: "all" | Id<"shops">;
}) {
  const navigate = useNavigate();
  const sections = usePaginatedQuery(
    api.appOrganization.queries.listOrganizationRecruitments,
    { organizationId },
    { initialNumItems: APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE },
  );

  useEffect(() => {
    if (sections.status === "CanLoadMore") sections.loadMore(APP_ORGANIZATION_RECRUITMENT_SHOP_PAGE_SIZE);
  }, [sections.loadMore, sections.status]);

  // 店舗ごとの追加取得が遅れても、取得済みのシフトまで隠して画面全体をローディングにしない。
  if (sections.results.length === 0 && sections.status !== "Exhausted") {
    return <AppShiftsPageStateView state={{ kind: "loading" }} />;
  }
  if (sections.results.length === 0) return <AppShiftsPageStateView state={{ kind: "empty" }} />;

  const overview = buildAppShiftsOverview(sections.results, shopFilter);
  const filterOptions = activeShops.map((shop) => ({ value: shop.id, label: shop.name }));
  const isReadOnly = memberStatus === "readOnly";

  return (
    <Animation>
      <AppShiftsOverviewView
        filterValue={shopFilter === "all" ? null : shopFilter}
        filterOptions={filterOptions}
        isReadOnly={isReadOnly}
        onFilterChange={(nextFilter) =>
          void navigate({
            to: "/shifts",
            search: { org: organizationId, ...(nextFilter ? { shopFilter: nextFilter } : {}) },
          })
        }
      >
        <OrganizationRecruitmentManagement
          organizationId={organizationId}
          memberStatus={memberStatus}
          shopFilter={shopFilter}
          shops={overview.shops}
          groups={overview.groups}
          getRecruitmentShop={(recruitment) => overview.recruitmentShops.get(recruitment._id)}
          onOpenShiftBoard={(recruitmentId) =>
            void navigate({
              to: "/shifts/$recruitmentId/board",
              params: { recruitmentId },
              search: { org: organizationId },
            })
          }
        />
      </AppShiftsOverviewView>
    </Animation>
  );
}

export function AppShiftsOverviewView({
  filterValue,
  filterOptions,
  isReadOnly = false,
  onFilterChange,
  children,
}: {
  filterValue: string | null;
  filterOptions: Array<{ value: string; label: string }>;
  isReadOnly?: boolean;
  onFilterChange: (value: string | null) => void;
  children: ReactNode;
}) {
  return (
    <Stack as="main" gap={{ base: 6, lg: 8 }}>
      <AppShiftsHeader value={filterValue} options={filterOptions} onChange={onFilterChange} />
      {isReadOnly && <AppShiftsReadOnlyNotice />}
      {children}
    </Stack>
  );
}

export type AppShiftsOverview = {
  groups: DashboardRecruitmentGroup[];
  shops: Array<{
    shopId: Id<"shops">;
    shopName: string;
    regularClosedDays: RecruitmentSection["shop"]["regularClosedDays"];
    hasPastRecruitments: boolean;
    canCreate: boolean;
    createDisabledReason?: string;
  }>;
  recruitmentShops: Map<Recruitment["_id"], { shopId: Id<"shops">; shopName: string }>;
};

export function buildAppShiftsOverview(
  sections: readonly RecruitmentSection[],
  shopFilter: "all" | Id<"shops">,
): AppShiftsOverview {
  const visibleSections =
    shopFilter === "all" ? sections : sections.filter((section) => section.shop.shopId === shopFilter);
  const recruitmentShops = new Map<Recruitment["_id"], { shopId: Id<"shops">; shopName: string }>();

  for (const section of visibleSections) {
    for (const group of section.currentGroups) {
      for (const recruitment of group.recruitments) {
        recruitmentShops.set(recruitment._id, {
          shopId: section.shop.shopId,
          shopName: section.shop.shopName,
        });
      }
    }
  }

  return {
    groups: mergeDashboardRecruitmentGroups(visibleSections.flatMap((section) => section.currentGroups)).groups,
    shops: sections.map((section) => ({
      shopId: section.shop.shopId,
      shopName: section.shop.shopName,
      regularClosedDays: section.shop.regularClosedDays,
      hasPastRecruitments: section.hasPastRecruitments,
      canCreate: section.actions.canCreate,
      ...(section.actions.createDisabledReason ? { createDisabledReason: section.actions.createDisabledReason } : {}),
    })),
    recruitmentShops,
  };
}

export function AppShiftsHeader({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
}) {
  return (
    <Flex align="center" justify="space-between" gap={3} minH="44px">
      <HStack gap={2.5} minW={0} flexShrink={0}>
        <Icon as={LuCalendarDays} boxSize={{ base: 5, lg: 6 }} flexShrink={0} aria-hidden />
        <Heading as="h1" textStyle="sectionTitle" color="gray.900">
          シフト
        </Heading>
      </HStack>
      <Box minW={0} maxW={{ base: "190px", sm: "240px" }}>
        <ShopFilterMenu value={value} options={options} onChange={onChange} />
      </Box>
    </Flex>
  );
}

export function AppShiftsReadOnlyNotice() {
  return (
    <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>現在、このアカウントでは操作できません</Alert.Title>
        <Alert.Description>シフトは確認できますが、募集の作成や削除はできません。</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export type AppShiftsPageState = { kind: "loading" } | { kind: "empty" } | { kind: "error" };

export function AppShiftsPageStateView({ state, onRetry }: { state: AppShiftsPageState; onRetry?: () => void }) {
  if (state.kind === "loading") {
    return (
      <Stack as="main" aria-label="シフト一覧を読み込み中" aria-busy="true" gap={{ base: 6, lg: 8 }}>
        <Flex justify="space-between" align="center">
          <HStack gap={2.5}>
            <Skeleton boxSize="24px" borderRadius="full" />
            <Skeleton h="28px" w="88px" />
          </HStack>
          <Skeleton h="44px" w={{ base: "150px", sm: "180px" }} maxW="52vw" />
        </Flex>
        <RecruitmentBoardSkeleton />
      </Stack>
    );
  }

  if (state.kind === "empty") {
    return (
      <Stack as="main" gap={{ base: 6, lg: 8 }}>
        <AppShiftsHeader value={null} options={[]} onChange={() => undefined} />
        <Empty
          icon={LuCalendarDays}
          title="利用中の店舗がありません"
          description="店舗を追加または再開すると、全店舗のシフトをまとめて確認できます。"
          tone="neutral"
          minH="420px"
        />
      </Stack>
    );
  }

  return (
    <Empty
      icon={LuRefreshCw}
      title="シフト一覧を読み込めませんでした"
      description="通信状況をご確認のうえ、もう一度お試しください。"
      tone="danger"
      minH="420px"
      action={
        onRetry ? (
          <Button colorPalette="teal" onClick={onRetry}>
            再試行する
          </Button>
        ) : undefined
      }
    />
  );
}
