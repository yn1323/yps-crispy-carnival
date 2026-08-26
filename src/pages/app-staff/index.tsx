import { Box, Flex, Heading, HStack, Icon, Skeleton, Stack } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuRefreshCw, LuStore, LuUsers } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ORGANIZATION_PLAN_LIMITS } from "@/convex/organizationBilling/planLimits";
import { ShopFilterMenu } from "@/src/components/features/AuthenticatedApp/ShopFilterMenu";
import { StaffInvitationDialog } from "@/src/components/features/Dashboard/StaffManagement/StaffInvitationDialog";
import { useStaffInvitation } from "@/src/components/features/Dashboard/StaffManagement/useStaffInvitation";
import {
  PeopleSection,
  PeopleSectionSkeleton,
  type StaffOrderReorderSource,
  useStaffOrderReorder,
} from "@/src/components/features/OrganizationSettings";
import { Animation } from "@/src/components/templates/Animation";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { resolveShopFilter } from "@/src/domains/shop/filter";
import { ManagerShopScopeProvider } from "@/src/providers/ManagerShopScopeProvider";

const PEOPLE_PAGE_SIZE = 10;
const STAFF_ORDER_PEOPLE_LIMIT = ORGANIZATION_PLAN_LIMITS.pro.maxPeople;

export type ShopOption = {
  id: Id<"shops">;
  name: string;
};

type Props = {
  organizationId: Id<"organizations">;
  activeShops: ShopOption[] | null;
  requestedShopFilter?: string;
};

export function AppStaffRoutePage(props: Props) {
  const navigate = useNavigate();
  const [retryRevision, setRetryRevision] = useState(0);
  const resolvedFilter = useMemo(
    () => resolveShopFilter(props.activeShops, props.requestedShopFilter),
    [props.activeShops, props.requestedShopFilter],
  );
  const filterKind = resolvedFilter.kind;
  const shouldReplaceSearch = resolvedFilter.kind === "ready" && resolvedFilter.shouldReplaceSearch;
  const resolvedShopFilter = resolvedFilter.kind === "ready" ? resolvedFilter.shopFilter : "all";

  useEffect(() => {
    if (filterKind !== "ready" || !shouldReplaceSearch) return;
    void navigate({
      to: "/staff",
      search: { org: props.organizationId },
      replace: true,
    });
  }, [filterKind, navigate, props.organizationId, shouldReplaceSearch]);

  if (resolvedFilter.kind === "loading") {
    return (
      <AuthenticatedPageContent includeMobileNavigation>
        <AppStaffPageStateView
          state={{ kind: "loading" }}
          showStaffOrderHandle={props.requestedShopFilter === undefined}
        />
      </AuthenticatedPageContent>
    );
  }

  return (
    <AuthenticatedPageContent includeMobileNavigation>
      <ErrorBoundary
        key={`${props.organizationId}:${resolvedShopFilter}:${retryRevision}`}
        fallback={
          <AppStaffPageStateView
            state={{ kind: "error" }}
            onRetry={() => setRetryRevision((revision) => revision + 1)}
          />
        }
      >
        <ConnectedAppStaff
          organizationId={props.organizationId}
          activeShops={props.activeShops ?? []}
          shopFilter={resolvedShopFilter}
        />
      </ErrorBoundary>
    </AuthenticatedPageContent>
  );
}

function ConnectedAppStaff({
  organizationId,
  activeShops,
  shopFilter,
}: {
  organizationId: Id<"organizations">;
  activeShops: ShopOption[];
  shopFilter: "all" | Id<"shops">;
}) {
  const navigate = useNavigate();
  const orderScope = useQuery(api.appOrganization.staffOrderQueries.getOrganizationStaffOrderScope, {
    organizationId,
    shopFilter,
  });
  const orderRevision = shopFilter !== "all" && orderScope?.mode === "ordered" ? orderScope.revision : null;
  const staffOrderEditor = useQuery(
    api.appOrganization.staffOrderQueries.getOrganizationStaffOrderEditor,
    shopFilter === "all" ? { organizationId } : "skip",
  );
  const people = usePaginatedQuery(
    api.appOrganization.queries.listOrganizationPeople,
    orderScope === undefined ? "skip" : { organizationId, shopFilter, orderRevision },
    { initialNumItems: shopFilter === "all" ? STAFF_ORDER_PEOPLE_LIMIT : PEOPLE_PAGE_SIZE },
  );
  const summary = useQuery(api.appOrganization.queries.getOrganizationPeopleSummary, {
    organizationId,
    shopFilter,
  });
  const [invitationShopId, setInvitationShopId] = useState<Id<"shops"> | null>(null);
  const shopSelectionDialog = useDialog();
  const shops = activeShops;
  const filterOptions = shops.map((shop) => ({ value: shop.id, label: shop.name }));
  const selectedFilterShop = shopFilter === "all" ? null : (shops.find((shop) => shop.id === shopFilter) ?? null);
  const canAddStaff = summary?.canAddStaff === true && shops.length > 0;
  const hasEnoughPeopleToReorder = (summary?.totalCount ?? 0) >= 2;
  const hasTooManyPeopleToReorder =
    summary?.totalCountHasOverflow === true || (summary?.totalCount ?? 0) > STAFF_ORDER_PEOPLE_LIMIT;
  const hasTooManyActiveShopsToReorder = activeShops.length > 5;
  const orderedEditorPersonIds =
    staffOrderEditor?.availability === "ready"
      ? staffOrderEditor.people.map((person) => person.personId)
      : people.results.map((person) => person.id);
  const visiblePersonIds = new Set(people.results.map((person) => person.id));
  const hasCompleteStaffOrder =
    staffOrderEditor?.availability === "ready" &&
    summary !== undefined &&
    !summary.totalCountHasOverflow &&
    people.results.length === summary.totalCount &&
    orderedEditorPersonIds.length === people.results.length &&
    orderedEditorPersonIds.every((personId) => visiblePersonIds.has(personId));
  const canChangeStaffOrder =
    summary?.canChangeStaffOrder === true &&
    staffOrderEditor?.availability === "ready" &&
    staffOrderEditor.canWrite &&
    hasEnoughPeopleToReorder &&
    !hasTooManyPeopleToReorder &&
    !hasTooManyActiveShopsToReorder &&
    hasCompleteStaffOrder;
  const changeStaffOrderDisabledReason =
    summary?.canChangeStaffOrder !== true
      ? (summary?.changeStaffOrderDisabledReason ?? "現在、スタッフの並び順を変更できません。")
      : staffOrderEditor?.availability !== "ready" || !staffOrderEditor.canWrite
        ? (staffOrderEditor?.writeDisabledReason ?? "現在、スタッフの並び順を変更できません。")
        : !hasEnoughPeopleToReorder
          ? "2名以上のスタッフがいると並び替えできます。"
          : hasTooManyPeopleToReorder
            ? `利用人数が${STAFF_ORDER_PEOPLE_LIMIT}名を超えているため、並び順を変更できません。`
            : hasTooManyActiveShopsToReorder
              ? "稼働中の店舗が5店舗を超えているため、並び順を変更できません。"
              : !hasCompleteStaffOrder
                ? "スタッフ一覧の読み込み完了後に並び替えできます。"
                : undefined;
  const staffOrderSource: StaffOrderReorderSource | undefined =
    shopFilter === "all" && staffOrderEditor
      ? {
          organizationId,
          orderedPersonIds: orderedEditorPersonIds,
          orderFingerprint: staffOrderEditor.orderFingerprint,
          canReorder: canChangeStaffOrder,
          disabledReason: changeStaffOrderDisabledReason,
        }
      : undefined;
  const staffOrder = useStaffOrderReorder(people.results, staffOrderSource);
  const closeInvitation = useCallback(() => setInvitationShopId(null), []);

  const handleAddStaff = () => {
    if (!canAddStaff) return;
    if (selectedFilterShop) {
      setInvitationShopId(selectedFilterShop.id);
      return;
    }
    shopSelectionDialog.open();
  };

  if (
    orderScope === undefined ||
    people.status === "LoadingFirstPage" ||
    summary === undefined ||
    (shopFilter === "all" && staffOrderEditor === undefined)
  ) {
    return <AppStaffPageStateView state={{ kind: "loading" }} showStaffOrderHandle={shopFilter === "all"} />;
  }

  return (
    <Animation>
      <Stack as="main" gap={{ base: 6, lg: 8 }}>
        <AppStaffHeader
          value={selectedFilterShop?.id ?? null}
          options={filterOptions}
          onChange={(nextFilter) =>
            void navigate({
              to: "/staff",
              search: { org: organizationId, ...(nextFilter ? { shopFilter: nextFilter } : {}) },
            })
          }
        />

        <PeopleSection
          key={shopFilter}
          people={staffOrder.people}
          peopleUsage={{ current: summary.totalCount, max: summary.maxPeople }}
          peopleUsageHasOverflow={summary.totalCountHasOverflow}
          filterResultCount={shopFilter === "all" ? undefined : summary.visibleCount}
          filterResultCountHasOverflow={shopFilter === "all" ? false : summary.visibleCountHasOverflow}
          onManageManagers={() => void navigate({ to: "/manage/managers", search: { org: organizationId } })}
          onOpenUser={(personId) =>
            void navigate({
              to: "/staff/$personId",
              params: { personId },
              search: { org: organizationId },
            })
          }
          initialVisibleUserCount={staffOrderSource ? STAFF_ORDER_PEOPLE_LIMIT : PEOPLE_PAGE_SIZE}
          canLoadMorePeople={people.status === "CanLoadMore" || people.status === "LoadingMore"}
          isLoadingMorePeople={people.status === "LoadingMore"}
          onLoadMorePeople={() => people.loadMore(PEOPLE_PAGE_SIZE)}
          staffOrder={staffOrder.staffOrder}
          onAddStaff={handleAddStaff}
          canAddStaff={canAddStaff}
          addStaffDisabledReason={
            shops.length === 0 ? "スタッフを追加するには、利用中の店舗が必要です。" : summary.addStaffDisabledReason
          }
        />

        <StaffInvitationShopSelectionDialog
          shops={shops}
          isOpen={shopSelectionDialog.isOpen}
          onOpenChange={shopSelectionDialog.onOpenChange}
          onClose={shopSelectionDialog.close}
          onSelect={setInvitationShopId}
        />

        {invitationShopId && (
          <ManagerShopScopeProvider shopId={invitationShopId} expectedOrganizationId={organizationId}>
            <OrganizationStaffInvitationDialog onDismiss={closeInvitation} />
          </ManagerShopScopeProvider>
        )}
      </Stack>
    </Animation>
  );
}

export function StaffInvitationShopSelectionDialog({
  shops,
  isOpen,
  onOpenChange,
  onClose,
  onSelect,
}: {
  shops: ShopOption[];
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onSelect: (shopId: Id<"shops">) => void;
}) {
  return (
    <Dialog
      title="スタッフを追加する店舗を選択"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      mobileFullScreen
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
    >
      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {shops.map((shop) => (
            <DrilldownRow
              key={shop.id}
              ariaLabel={`${shop.name}をスタッフ追加の対象店舗として選択`}
              title={shop.name}
              onClick={() => {
                onClose();
                onSelect(shop.id);
              }}
              leading={
                <Flex
                  boxSize="40px"
                  borderRadius="lg"
                  bg="teal.50"
                  color="teal.700"
                  align="center"
                  justify="center"
                  flexShrink={0}
                >
                  <LuStore aria-hidden />
                </Flex>
              }
            />
          ))}
        </Stack>
      </Box>
    </Dialog>
  );
}

export function AppStaffHeader({
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
        <Icon as={LuUsers} boxSize={{ base: 5, lg: 6 }} flexShrink={0} aria-hidden />
        <Heading as="h1" textStyle="sectionTitle" color="gray.900">
          スタッフ
        </Heading>
      </HStack>
      <Box minW={0} maxW={{ base: "190px", sm: "240px" }}>
        <ShopFilterMenu value={value} options={options} onChange={onChange} />
      </Box>
    </Flex>
  );
}

function OrganizationStaffInvitationDialog({ onDismiss }: { onDismiss: () => void }) {
  const invitation = useStaffInvitation(false, true);
  const openInvitationRef = useRef(invitation.onOpen);
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    openInvitationRef.current();
  }, []);

  useEffect(() => {
    if (invitation.dialog.isOpen) {
      hasOpenedRef.current = true;
      return;
    }
    if (hasOpenedRef.current) onDismiss();
  }, [invitation.dialog.isOpen, onDismiss]);

  return <StaffInvitationDialog invitation={invitation} />;
}

export type AppStaffPageState = { kind: "loading" } | { kind: "error" };

export function AppStaffPageStateView({
  state,
  onRetry,
  showStaffOrderHandle = true,
}: {
  state: AppStaffPageState;
  onRetry?: () => void;
  showStaffOrderHandle?: boolean;
}) {
  if (state.kind === "loading") {
    return (
      <Stack as="main" aria-label="スタッフ一覧を読み込み中" aria-busy="true" gap={{ base: 6, lg: 8 }}>
        <Flex justify="space-between" align="center">
          <HStack gap={2.5}>
            <Skeleton boxSize="24px" borderRadius="full" />
            <Skeleton h="28px" w="100px" />
          </HStack>
          <Skeleton h="44px" w={{ base: "150px", sm: "180px" }} maxW="52vw" />
        </Flex>
        <PeopleSectionSkeleton showAddStaff showStaffOrderHandle={showStaffOrderHandle} />
      </Stack>
    );
  }

  return (
    <Empty
      icon={LuRefreshCw}
      title="スタッフ一覧を読み込めませんでした"
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
