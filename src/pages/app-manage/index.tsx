import { Alert, Box, Flex, Grid, Heading, HStack, Icon, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useState } from "react";
import { LuBuilding2, LuCreditCard, LuPencil, LuPlus, LuRefreshCw, LuSettings, LuShieldCheck } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ManagerCandidatePageContent,
  ManagerCandidatePageSkeleton,
  ManagerExternalInviteForm,
  ManagerExternalInvitePageSkeleton,
  ManagerSettings,
  ManagerSettingsSkeleton,
} from "@/src/components/features/ManagerSettings";
import {
  OrganizationDeletionSection,
  type OrganizationShopView,
  OrganizationUsageSection,
  PlanAndPaymentSection,
  ShopsSection,
} from "@/src/components/features/OrganizationSettings";
import { BillingActionDialog } from "@/src/components/features/OrganizationSettings/BillingSettings/BillingActionDialog";
import { BillingEmailDialog } from "@/src/components/features/OrganizationSettings/BillingSettings/BillingEmailDialog";
import { useBillingSettingsController } from "@/src/components/features/OrganizationSettings/BillingSettings/useBillingSettingsController";
import { useStripeBillingController } from "@/src/components/features/OrganizationSettings/BillingSettings/useStripeBillingController";
import { OrganizationCreationDialog } from "@/src/components/features/OrganizationSettings/OrganizationCreation/OrganizationCreationDialog";
import { useOrganizationCreationController } from "@/src/components/features/OrganizationSettings/OrganizationCreation/useOrganizationCreationController";
import { OrganizationDeletionDialog } from "@/src/components/features/OrganizationSettings/OrganizationDeletion/OrganizationDeletionDialog";
import { useOrganizationDeletionController } from "@/src/components/features/OrganizationSettings/OrganizationDeletion/useOrganizationDeletionController";
import { OrganizationNameDialog } from "@/src/components/features/OrganizationSettings/OrganizationName/OrganizationNameDialog";
import { useOrganizationNameController } from "@/src/components/features/OrganizationSettings/OrganizationName/useOrganizationNameController";
import { OrganizationUsageSectionSkeleton } from "@/src/components/features/OrganizationSettings/OrganizationUsageSection";
import { ShopManagementDialog } from "@/src/components/features/OrganizationSettings/ShopManagement/ShopManagementDialog";
import { useShopManagementController } from "@/src/components/features/OrganizationSettings/ShopManagement/useShopManagementController";
import { DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { Animation } from "@/src/components/templates/Animation";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader, DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";

const SHOP_PAGE_SIZE = 20;

type OrganizationScopeProps = {
  organizationId: Id<"organizations">;
  memberStatus: "active" | "readOnly";
};

export function AppManageRoutePage(props: OrganizationScopeProps) {
  return <ManageErrorBoundary>{() => <ConnectedManagePage {...props} />}</ManageErrorBoundary>;
}

function ConnectedManagePage({ organizationId, memberStatus }: OrganizationScopeProps) {
  const navigate = useNavigate();
  const overview = useQuery(api.appOrganization.manageQueries.getManageOverview, { organizationId });
  const shops = usePaginatedQuery(
    api.appOrganization.manageQueries.listOrganizationShops,
    { organizationId, status: "all" },
    { initialNumItems: SHOP_PAGE_SIZE },
  );

  if (overview === undefined || shops.status === "LoadingFirstPage") return <ManagePageSkeleton />;

  const shopRows = toOrganizationShopViews(shops.results);
  return (
    <Animation>
      <Stack as="main" gap={{ base: 6, lg: 8 }}>
        <AppManageHeader />
        <AppManageReadOnlyNotice memberStatus={memberStatus} />
        <OrganizationUsageSection billing={overview.usage} />
        <OrganizationManagementSection
          organizationId={organizationId}
          organizationName={overview.organizationName}
          managerCount={overview.usage.managerUsage.current}
          pendingManagerCount={overview.usage.managerUsage.pendingInvitations}
          billingState={overview.usage.state}
          canCreateOrganization={overview.capabilities.canCreateOrganization}
          createOrganizationDisabledReason={overview.capabilities.createOrganizationDisabledReason}
        />
        <ManageShopsSection
          organizationId={organizationId}
          shops={shopRows}
          shopUsage={overview.usage.shopUsage}
          canAddShop={overview.capabilities.canAddShop}
          addShopDisabledReason={overview.capabilities.addShopDisabledReason}
          canLoadMore={shops.status === "CanLoadMore" || shops.status === "LoadingMore"}
          isLoadingMore={shops.status === "LoadingMore"}
          onLoadMore={() => shops.loadMore(SHOP_PAGE_SIZE)}
          onOpenShop={(shopId) =>
            void navigate({
              to: "/app/manage/shops/$shopId",
              params: { shopId },
              search: { org: organizationId },
            })
          }
        />
      </Stack>
    </Animation>
  );
}

export function AppManageHeader() {
  return (
    <Flex align="center" justify="space-between" gap={3} minH="44px">
      <HStack gap={2.5} minW={0} flexShrink={0}>
        <Icon as={LuSettings} boxSize={{ base: 5, lg: 6 }} flexShrink={0} aria-hidden />
        <Heading as="h1" textStyle="sectionTitle" color="gray.900">
          管理
        </Heading>
      </HStack>
    </Flex>
  );
}

function OrganizationManagementSection({
  organizationId,
  organizationName,
  managerCount,
  pendingManagerCount,
  billingState,
  canCreateOrganization,
  createOrganizationDisabledReason,
}: {
  organizationId: Id<"organizations">;
  organizationName: string;
  managerCount: number;
  pendingManagerCount: number;
  billingState: string;
  canCreateOrganization: boolean;
  createOrganizationDisabledReason?: string;
}) {
  const navigate = useNavigate();
  const creation = useOrganizationCreationController({
    canCreateOrganization,
    sourceShopId: null,
    appMode: true,
    organizationId,
    onCreated: (shopId, createdOrganizationId) =>
      void navigate({
        to: "/app/home",
        search: createdOrganizationId ? { org: createdOrganizationId, shop: shopId } : {},
        replace: true,
      }),
  });

  return (
    <>
      <Stack as="section" gap={4} aria-labelledby="app-organization-management-heading">
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <HStack gap={2}>
            <LuBuilding2 aria-hidden />
            <Heading id="app-organization-management-heading" as="h2" fontSize="lg">
              組織全体
            </Heading>
          </HStack>
          <Button
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1.5}
            fontWeight="semibold"
            onClick={creation.createOrganization}
            disabled={!canCreateOrganization}
            title={!canCreateOrganization ? createOrganizationDisabledReason : undefined}
          >
            <LuPlus aria-hidden />
            新しい組織を作る
          </Button>
        </Flex>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <ManagementRouteRow
              icon={LuBuilding2}
              title="組織情報"
              description={organizationName}
              onClick={() => void navigate({ to: "/app/manage/organization", search: { org: organizationId } })}
            />
            <ManagementRouteRow
              icon={LuShieldCheck}
              title="管理者と権限"
              description={`管理者 ${managerCount}人 ・ 招待中 ${pendingManagerCount}件`}
              onClick={() => void navigate({ to: "/app/manage/managers", search: { org: organizationId } })}
            />
            <ManagementRouteRow
              icon={LuCreditCard}
              title="プランと支払い"
              description={billingStateLabel(billingState)}
              onClick={() => void navigate({ to: "/app/manage/billing", search: { org: organizationId } })}
            />
          </Stack>
        </Box>
      </Stack>
      <OrganizationCreationDialog {...creation.dialog} />
    </>
  );
}

function ManagementRouteRow({
  icon: RowIcon,
  title,
  description,
  onClick,
}: {
  icon: typeof LuBuilding2;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <DrilldownRow
      ariaLabel={`${title}を開く`}
      title={title}
      secondary={
        <Text fontSize="sm" color="fg.muted" truncate>
          {description}
        </Text>
      }
      onClick={onClick}
      leading={
        <Flex boxSize="40px" borderRadius="lg" bg="teal.100" color="teal.700" align="center" justify="center">
          <RowIcon aria-hidden />
        </Flex>
      }
    />
  );
}

function ManageShopsSection({
  organizationId,
  shops,
  shopUsage,
  canAddShop,
  addShopDisabledReason,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
  onOpenShop,
}: {
  organizationId: Id<"organizations">;
  shops: OrganizationShopView[];
  shopUsage: { current: number; max: number };
  canAddShop: boolean;
  addShopDisabledReason?: string;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onOpenShop: (shopId: string) => void;
}) {
  const shopManagement = useShopManagementController({ organizationId, canAddShop });
  return (
    <>
      <ShopsSection
        shops={shops}
        shopUsage={shopUsage}
        showAddShop
        canAddShop={canAddShop}
        addShopDisabledReason={addShopDisabledReason}
        onAddShop={shopManagement.addShop}
        onOpenShop={onOpenShop}
      />
      {canLoadMore && (
        <Flex justify="center">
          <Button variant="outline" onClick={onLoadMore} loading={isLoadingMore} minW="180px">
            店舗をさらに表示
          </Button>
        </Flex>
      )}
      <ShopManagementDialog {...shopManagement.dialog} />
    </>
  );
}

export function AppManageOrganizationRoutePage(props: OrganizationScopeProps) {
  return <ManageErrorBoundary>{() => <ConnectedOrganizationPage {...props} />}</ManageErrorBoundary>;
}

function ConnectedOrganizationPage({ organizationId, memberStatus }: OrganizationScopeProps) {
  const overview = useQuery(api.appOrganization.manageQueries.getManageOverview, { organizationId });
  const billingOverview = useQuery(api.appOrganization.manageQueries.getBillingOverview, { organizationId });
  if (overview === undefined || billingOverview === undefined) return <OrganizationDetailSkeleton />;

  return (
    <ReadyOrganizationPage
      organizationId={organizationId}
      memberStatus={memberStatus}
      overview={overview}
      billing={billingOverview.billing}
    />
  );
}

function ReadyOrganizationPage({
  organizationId,
  memberStatus,
  overview,
  billing,
}: OrganizationScopeProps & {
  overview: FunctionReturnType<typeof api.appOrganization.manageQueries.getManageOverview>;
  billing: FunctionReturnType<typeof api.appOrganization.manageQueries.getBillingOverview>["billing"];
}) {
  const router = useRouter();

  const organizationName = useOrganizationNameController({
    organizationId,
    organizationName: overview.organizationName,
    canUpdateOrganizationName: overview.capabilities.canUpdateOrganizationName,
  });
  const deletion = useOrganizationDeletionController({
    organizationId,
    appOrganizationId: organizationId,
    organizationUpdatedAt: overview.organizationUpdatedAt,
    organizationName: overview.organizationName,
    canDeleteOrganization: overview.capabilities.canDeleteOrganization,
  });

  return (
    <Animation>
      <Stack gap={{ base: 5, md: 7 }}>
        <DetailPageHeader
          title="組織情報"
          icon={LuBuilding2}
          onBack={() => router.history.back()}
          backLabel="前の画面へ戻る"
          backAriaLabel="前の画面へ戻る"
        />
        <AppManageReadOnlyNotice memberStatus={memberStatus} />
        <OrganizationUsageSection billing={billing} />
        <OrganizationBasicInformationSection
          organizationName={overview.organizationName}
          organizationCreatedAt={overview.organizationCreatedAt}
          canUpdateOrganizationName={overview.capabilities.canUpdateOrganizationName}
          updateOrganizationNameDisabledReason={overview.capabilities.updateOrganizationNameDisabledReason}
          onEdit={organizationName.open}
        />
        <OrganizationDeletionSection
          canDelete={overview.capabilities.canDeleteOrganization}
          disabledReason={overview.capabilities.deleteOrganizationDisabledReason}
          onDelete={deletion.open}
        />
      </Stack>
      <OrganizationNameDialog {...organizationName.dialog} />
      <OrganizationDeletionDialog {...deletion.dialog} />
    </Animation>
  );
}

export function OrganizationBasicInformationSection({
  organizationName,
  organizationCreatedAt,
  canUpdateOrganizationName,
  updateOrganizationNameDisabledReason,
  onEdit,
}: {
  organizationName: string;
  organizationCreatedAt: number;
  canUpdateOrganizationName: boolean;
  updateOrganizationNameDisabledReason?: string;
  onEdit: () => void;
}) {
  return (
    <Stack as="section" gap={3} aria-labelledby="app-organization-basic-information-heading">
      <Flex align="center" justify="space-between" gap={3}>
        <Heading
          id="app-organization-basic-information-heading"
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          基本情報
        </Heading>
        <Button
          type="button"
          variant="ghost"
          colorPalette="teal"
          size="sm"
          gap={1.5}
          fontWeight="semibold"
          flexShrink={0}
          disabled={!canUpdateOrganizationName}
          title={!canUpdateOrganizationName ? updateOrganizationNameDisabledReason : undefined}
          aria-describedby={
            !canUpdateOrganizationName && updateOrganizationNameDisabledReason
              ? "app-organization-name-update-disabled-reason"
              : undefined
          }
          onClick={onEdit}
        >
          <LuPencil aria-hidden />
          編集する
        </Button>
      </Flex>
      <Box as="dl" borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          <Grid
            templateColumns={{ base: "minmax(0, 9rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
            gap={{ base: 3, md: 5 }}
            alignItems="start"
            px={{ base: 4, md: 5 }}
            py={{ base: 3.5, md: 4 }}
          >
            <Text as="dt" fontSize="sm" fontWeight="semibold" color="gray.700">
              組織名
            </Text>
            <Text as="dd" fontSize="sm" color="gray.900" lineHeight="tall" overflowWrap="anywhere">
              {organizationName}
            </Text>
          </Grid>
          <Grid
            templateColumns={{ base: "minmax(0, 9rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
            gap={{ base: 3, md: 5 }}
            alignItems="start"
            px={{ base: 4, md: 5 }}
            py={{ base: 3.5, md: 4 }}
          >
            <Text as="dt" fontSize="sm" fontWeight="semibold" color="gray.700">
              作成日
            </Text>
            <Text as="dd" fontSize="sm" color="gray.900" lineHeight="tall">
              {formatCreatedAt(organizationCreatedAt)}
            </Text>
          </Grid>
        </Stack>
      </Box>
      {!canUpdateOrganizationName && updateOrganizationNameDisabledReason && (
        <Text id="app-organization-name-update-disabled-reason" fontSize="xs" color="orange.700">
          {updateOrganizationNameDisabledReason}
        </Text>
      )}
    </Stack>
  );
}

export function AppManageManagersRoutePage({ organizationId, memberStatus }: OrganizationScopeProps) {
  return (
    <ManageErrorBoundary>
      {() => (
        <Stack gap={5}>
          <AppManageReadOnlyNotice memberStatus={memberStatus} />
          <ConnectedManagersPage organizationId={organizationId} />
        </Stack>
      )}
    </ManageErrorBoundary>
  );
}

function ConnectedManagersPage({ organizationId }: { organizationId: Id<"organizations"> }) {
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.appOrganization.manageQueries.getManagerSettingsOverview, { organizationId, now });
  if (overview === undefined) return <ManagerSettingsSkeleton />;
  if (overview.kind !== "ready") return <ManageQueryState message={overview.message} />;
  return <ManagerSettings overview={overview} organizationId={organizationId} />;
}

export function AppManageInviteStaffRoutePage({ organizationId, memberStatus }: OrganizationScopeProps) {
  return (
    <ManageErrorBoundary maxW="760px" includeMobileNavigation={false}>
      {() => (
        <Stack gap={5}>
          <AppManageReadOnlyNotice memberStatus={memberStatus} />
          <ConnectedInviteStaffPage organizationId={organizationId} />
        </Stack>
      )}
    </ManageErrorBoundary>
  );
}

function ConnectedInviteStaffPage({ organizationId }: { organizationId: Id<"organizations"> }) {
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.appOrganization.manageQueries.getManagerSettingsOverview, { organizationId, now });
  const candidates = useQuery(api.appOrganization.manageQueries.getManagerCandidates, { organizationId, now });
  if (overview === undefined || candidates === undefined) return <ManagerCandidatePageSkeleton />;
  if (overview.kind !== "ready") return <ManageQueryState message={overview.message} />;
  return <ManagerCandidatePageContent overview={overview} result={candidates} organizationId={organizationId} />;
}

export function AppManageInviteNewRoutePage({ organizationId, memberStatus }: OrganizationScopeProps) {
  return (
    <ManageErrorBoundary maxW="760px" includeMobileNavigation={false}>
      {() => (
        <Stack gap={5}>
          <AppManageReadOnlyNotice memberStatus={memberStatus} />
          <ConnectedInviteNewPage organizationId={organizationId} />
        </Stack>
      )}
    </ManageErrorBoundary>
  );
}

function ConnectedInviteNewPage({ organizationId }: { organizationId: Id<"organizations"> }) {
  const [now] = useState(() => Date.now());
  const overview = useQuery(api.appOrganization.manageQueries.getManagerSettingsOverview, { organizationId, now });
  if (overview === undefined) return <ManagerExternalInvitePageSkeleton />;
  if (overview.kind !== "ready") return <ManageQueryState message={overview.message} />;
  return <ManagerExternalInviteForm overview={overview} organizationId={organizationId} />;
}

export function AppManageBillingRoutePage(props: OrganizationScopeProps) {
  return <ManageErrorBoundary>{() => <ConnectedBillingPage {...props} />}</ManageErrorBoundary>;
}

function ConnectedBillingPage({ organizationId, memberStatus }: OrganizationScopeProps) {
  const overview = useQuery(api.appOrganization.manageQueries.getBillingOverview, { organizationId });
  if (overview === undefined) return <AppManageBillingPageSkeleton />;

  return <ReadyBillingPage organizationId={organizationId} memberStatus={memberStatus} overview={overview} />;
}

function ReadyBillingPage({
  organizationId,
  memberStatus,
  overview,
}: OrganizationScopeProps & {
  overview: FunctionReturnType<typeof api.appOrganization.manageQueries.getBillingOverview>;
}) {
  const router = useRouter();

  const billingEmail = useBillingSettingsController({ organizationId, billing: overview.billing });
  const stripe = useStripeBillingController({
    organizationId,
    organizationName: overview.organizationName,
    billing: overview.billing,
  });
  return (
    <Animation>
      <Stack gap={{ base: 5, md: 7 }}>
        <DetailPageHeader
          title="プランと支払い"
          icon={LuCreditCard}
          onBack={() => router.history.back()}
          backLabel="前の画面へ戻る"
          backAriaLabel="前の画面へ戻る"
        />
        <AppManageReadOnlyNotice memberStatus={memberStatus} />
        <OrganizationUsageSection billing={overview.billing} />
        <PlanAndPaymentSection
          billing={overview.billing}
          planPrices={stripe.planPrices}
          onManagePlan={stripe.managePlan}
          onRetryPlanPrice={stripe.retryPlanPrice}
          onUpdatePaymentMethod={stripe.updatePaymentMethod}
          onUpdateBillingEmail={billingEmail.updateBillingEmail}
          onOpenBillingDocuments={stripe.openBillingDocuments}
        />
      </Stack>
      <BillingEmailDialog {...billingEmail.dialog} />
      <BillingActionDialog {...stripe.dialog} />
    </Animation>
  );
}

function ManageErrorBoundary({
  children,
  maxW,
  includeMobileNavigation = true,
}: {
  children: () => ReactNode;
  maxW?: string;
  includeMobileNavigation?: boolean;
}) {
  const [retryRevision, setRetryRevision] = useState(0);
  return (
    <AuthenticatedPageContent includeMobileNavigation={includeMobileNavigation}>
      <Box maxW={maxW} mx={maxW ? "auto" : undefined}>
        <ErrorBoundary
          key={retryRevision}
          fallback={<ManageQueryState onRetry={() => setRetryRevision((revision) => revision + 1)} />}
        >
          {children()}
        </ErrorBoundary>
      </Box>
    </AuthenticatedPageContent>
  );
}

export function AppManagePageStateView({
  state,
  onRetry,
}: {
  state: { kind: "loading" } | { kind: "error"; message?: string };
  onRetry?: () => void;
}) {
  if (state.kind === "loading") return <ManagePageSkeleton />;
  return <ManageQueryState message={state.message} onRetry={onRetry} />;
}

function ManageQueryState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <Empty
      icon={LuRefreshCw}
      title="管理情報を表示できません"
      description={message ?? "通信状態を確認して、もう一度お試しください。"}
      minH="360px"
      action={
        onRetry ? (
          <Button onClick={onRetry} variant="outline">
            再試行する
          </Button>
        ) : undefined
      }
    />
  );
}

export function AppManageReadOnlyNotice({ memberStatus }: { memberStatus: "active" | "readOnly" }) {
  if (memberStatus !== "readOnly") return null;
  return (
    <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
      <Alert.Indicator mt={1} />
      <Alert.Content>
        <Alert.Title>この組織は閲覧のみです</Alert.Title>
        <Alert.Description>管理情報は確認できますが、設定や契約は変更できません。</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

function ManagePageSkeleton() {
  return (
    <Stack gap={{ base: 6, lg: 8 }} aria-label="管理画面を読み込み中" aria-busy="true">
      <HStack gap={2.5} minH="44px">
        <Skeleton boxSize={{ base: 5, lg: 6 }} borderRadius="full" />
        <Skeleton h="28px" w="80px" />
      </HStack>
      <OrganizationUsageSectionSkeleton />

      <Stack as="section" gap={4} aria-hidden>
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <HStack gap={2}>
            <Skeleton boxSize={5} borderRadius="sm" />
            <Skeleton h="28px" w="96px" />
          </HStack>
          <Skeleton h="36px" w="144px" borderRadius="md" />
        </Flex>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <ManageRouteRowSkeleton titleWidth="80px" descriptionWidth="224px" />
            <ManageRouteRowSkeleton titleWidth="112px" descriptionWidth="168px" />
            <ManageRouteRowSkeleton titleWidth="128px" descriptionWidth="144px" />
          </Stack>
        </Box>
      </Stack>

      <Stack as="section" gap={4} aria-hidden>
        <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
          <HStack gap={2}>
            <Skeleton boxSize={5} borderRadius="sm" />
            <Skeleton h="28px" w="144px" />
          </HStack>
          <Skeleton h="36px" w="120px" borderRadius="md" />
        </Flex>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            {Array.from({ length: 3 }, (_, index) => (
              <Flex key={index} gap={3} align="center" px={{ base: 3, md: 4 }} py={3.5}>
                <Skeleton boxSize="40px" borderRadius="lg" flexShrink={0} />
                <Skeleton h="20px" w={index === 1 ? "152px" : "112px"} maxW="full" flex={1} />
                <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
              </Flex>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}

function ManageRouteRowSkeleton({ titleWidth, descriptionWidth }: { titleWidth: string; descriptionWidth: string }) {
  return (
    <Flex gap={3} align="center" px={{ base: 3, md: 4 }} py={3.5}>
      <Skeleton boxSize="40px" borderRadius="lg" flexShrink={0} />
      <Stack gap={1} flex={1} minW={0}>
        <Skeleton h="20px" w={titleWidth} maxW="full" />
        <Skeleton h="18px" w={descriptionWidth} maxW="90%" />
      </Stack>
      <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
    </Flex>
  );
}

export function AppManageBillingPageSkeleton() {
  return (
    <Stack gap={{ base: 5, md: 7 }} aria-label="プランと支払いを読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "176px", md: "240px" }} />
      <OrganizationUsageSectionSkeleton />

      <Stack gap={4} aria-hidden>
        <BillingPlanSummarySkeleton />
        <BillingPlanComparisonSkeleton />
      </Stack>

      <BillingPaymentInformationSkeleton />
    </Stack>
  );
}

function BillingPlanSummarySkeleton() {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <Grid
        templateColumns={{
          base: "repeat(2, minmax(0, 1fr))",
          lg: "minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(180px, 1fr)",
        }}
      >
        <Stack gridColumn={{ base: "1 / -1", lg: "auto" }} gap={1.5} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
          <Skeleton h="18px" w="96px" />
          <HStack gap={2} wrap="wrap">
            <Skeleton h={{ base: "28px", md: "32px" }} w="96px" />
            <Skeleton h="20px" w="88px" borderRadius="full" />
          </HStack>
          <Skeleton h="18px" w="232px" maxW="90%" />
          <Skeleton h="18px" w="280px" maxW="90%" />
        </Stack>

        <Stack
          gap={1.5}
          px={{ base: 4, md: 5 }}
          py={{ base: 3, md: 5 }}
          borderTopWidth={{ base: "1px", lg: 0 }}
          borderRightWidth={{ base: "1px", lg: 0 }}
          borderLeftWidth={{ base: 0, lg: "1px" }}
          borderColor="blackAlpha.100"
        >
          <Skeleton h="18px" w="40px" />
          <HStack gap={1.5}>
            <Skeleton boxSize={4} borderRadius="full" />
            <Skeleton h="20px" w="96px" />
          </HStack>
        </Stack>

        <Stack
          gap={1.5}
          px={{ base: 4, md: 5 }}
          py={{ base: 3, md: 5 }}
          borderTopWidth={{ base: "1px", lg: 0 }}
          borderLeftWidth={{ base: 0, lg: "1px" }}
          borderColor="blackAlpha.100"
        >
          <Skeleton h="18px" w="88px" />
          <HStack gap={1.5} align="flex-start">
            <Skeleton boxSize={4} borderRadius="sm" flexShrink={0} />
            <Skeleton h="20px" w="128px" />
          </HStack>
          <Skeleton h="18px" w="216px" maxW="90%" />
        </Stack>
      </Grid>
    </Box>
  );
}

function BillingPlanComparisonSkeleton() {
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))" }} gap={3}>
      {Array.from({ length: 2 }, (_, index) => (
        <Stack
          key={index}
          minH="216px"
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          p={4}
          gap={3}
        >
          <HStack justify="space-between" align="flex-start" gap={2}>
            <Skeleton h="24px" w={index === 0 ? "48px" : "80px"} />
            {index === 0 && <Skeleton h="20px" w="56px" borderRadius="full" />}
          </HStack>
          <Stack gap={0.5}>
            <Skeleton h="22px" w="112px" />
            <Skeleton h="16px" w="72px" />
          </Stack>
          <Stack gap={1}>
            <Skeleton h="18px" w="136px" />
            <Skeleton h="18px" w="112px" />
            <Skeleton h="18px" w="120px" />
          </Stack>
          <Skeleton h="40px" w="full" mt="auto" borderRadius="md" />
        </Stack>
      ))}
    </Grid>
  );
}

function BillingPaymentInformationSkeleton() {
  return (
    <Stack as="section" gap={3} aria-hidden>
      <Skeleton h="28px" w="96px" />
      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          <BillingInformationRowSkeleton labelWidth="112px" />
          <BillingInformationRowSkeleton labelWidth="144px" />
          <BillingInformationRowSkeleton labelWidth="160px" valueWidth="184px" />
        </Stack>
      </Box>
    </Stack>
  );
}

function BillingInformationRowSkeleton({ labelWidth, valueWidth }: { labelWidth: string; valueWidth?: string }) {
  return (
    <Flex align="center" gap={{ base: 2.5, md: 3 }} w="full" minH="64px" px={{ base: 3, md: 4 }} py={3.5}>
      <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
      <Grid
        flex={1}
        minW={0}
        templateColumns={
          valueWidth ? { base: "minmax(88px, auto) minmax(0, 1fr)", md: "160px minmax(0, 1fr)" } : "minmax(0, 1fr)"
        }
        alignItems="center"
        gap={{ base: 2, md: 4 }}
      >
        <Skeleton h="20px" w={labelWidth} maxW="100%" />
        {valueWidth && <Skeleton h="18px" w={valueWidth} maxW="100%" />}
      </Grid>
      <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
    </Flex>
  );
}

function OrganizationDetailSkeleton() {
  return (
    <Stack gap={{ base: 5, md: 7 }} aria-label="組織情報を読み込み中" aria-busy="true">
      <DetailPageHeaderSkeleton titleWidth={{ base: "176px", md: "240px" }} />
      <OrganizationUsageSectionSkeleton />
      <Stack gap={3}>
        <Flex align="center" justify="space-between" gap={3}>
          <Skeleton h={{ base: "28px", lg: "30px" }} w="96px" />
          <Skeleton h="36px" w="96px" borderRadius="md" flexShrink={0} />
        </Flex>
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <Grid
              templateColumns={{ base: "minmax(0, 9rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
              gap={{ base: 3, md: 5 }}
              alignItems="start"
              px={{ base: 4, md: 5 }}
              py={{ base: 3.5, md: 4 }}
            >
              <Skeleton h="20px" w="64px" />
              <Skeleton h="20px" w="240px" maxW="100%" />
            </Grid>
            <Grid
              templateColumns={{ base: "minmax(0, 9rem) minmax(0, 1fr)", md: "200px minmax(0, 1fr)" }}
              gap={{ base: 3, md: 5 }}
              alignItems="start"
              px={{ base: 4, md: 5 }}
              py={{ base: 3.5, md: 4 }}
            >
              <Skeleton h="20px" w="64px" />
              <Skeleton h="20px" w="144px" />
            </Grid>
          </Stack>
        </Box>
      </Stack>
      <DeletionActionSectionSkeleton titleWidth="240px" descriptionLines={2} actionWidth="104px" />
    </Stack>
  );
}

function toOrganizationShopViews(
  shops: Array<{ shopId: Id<"shops">; shopName: string; operatingStatus: string }>,
): OrganizationShopView[] {
  return shops.map((shop) => ({
    id: shop.shopId,
    name: shop.operatingStatus === "archived" ? `${shop.shopName}（アーカイブ）` : shop.shopName,
    regularClosedDays: [],
    submissionPattern: { kind: "dateOnly" },
    staffCount: 0,
    canUpdateSettings: false,
    canDelete: false,
  }));
}

function billingStateLabel(state: string) {
  const labels: Record<string, string> = {
    trial: "トライアル",
    free: "無料プラン",
    pro: "Proプラン",
    business: "Businessプラン",
    grace: "支払い猶予中",
    restricted: "契約制限中",
    scheduledChange: "プラン変更予定",
    scheduledFree: "無料へ変更予定",
    migrationPending: "設定移行中",
    initialPaymentPending: "初回請求を確認中",
    pendingActivation: "支払い結果を確認中",
  };
  return labels[state] ?? "契約状態を確認中";
}

function formatCreatedAt(timestamp: number) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium" }).format(new Date(timestamp));
}
