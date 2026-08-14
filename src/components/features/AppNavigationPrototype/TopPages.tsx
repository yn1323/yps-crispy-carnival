import { Box, Flex, Heading, HStack, Icon, Separator, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import { LuBuilding2, LuCreditCard, LuPlus, LuShieldCheck } from "react-icons/lu";
import { type ActionInboxItem, ActionInboxView } from "@/src/components/features/ActionInbox";
import {
  APP_PRIMARY_NAVIGATION_ITEMS,
  type AppNavigationKey,
} from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import {
  buildOperationContextModel,
  type DashboardRecruitmentGroup,
  HeroSummary,
  OperationContextView,
  type Recruitment,
  RecruitmentBoard,
  type Staff,
  StaffRoster,
} from "@/src/components/features/Dashboard";
import {
  type OrganizationBillingView,
  type OrganizationPersonView,
  type OrganizationShopView,
  OrganizationUsageSection,
  PeopleSection,
  ShopsSection,
} from "@/src/components/features/OrganizationSettings";
import { AuthenticatedPageContent } from "@/src/components/templates/AuthenticatedPageContent";
import { Button } from "@/src/components/ui/Button";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import { APP_PROTOTYPE_FIXTURE, APP_PROTOTYPE_IDS, APP_PROTOTYPE_SHOP_CONTEXTS } from "./fixtures";
import { ShopFilterMenu } from "./PrototypeUI";

const PREVIEW_DISABLED_REASON = "固定プレビューのため操作できません";

const PROTOTYPE_RECRUITMENTS: Recruitment[] = [
  {
    _id: "sample-recruitment-adjusting-1" as Recruitment["_id"],
    createdAt: 0,
    periodStart: "2026-08-17",
    periodEnd: "2026-08-24",
    deadline: "2026-08-12",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 2,
    totalStaffCount: 3,
  },
  {
    _id: "sample-recruitment-adjusting-2" as Recruitment["_id"],
    createdAt: 0,
    periodStart: "2026-08-20",
    periodEnd: "2026-08-27",
    deadline: "2026-08-13",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 1,
    totalStaffCount: 5,
  },
  {
    _id: APP_PROTOTYPE_IDS.recruitment as Recruitment["_id"],
    createdAt: 0,
    periodStart: "2026-08-26",
    periodEnd: "2026-08-28",
    deadline: "2026-08-20",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    responseCount: 0,
    totalStaffCount: 3,
  },
];

const PROTOTYPE_RECRUITMENT_GROUPS: DashboardRecruitmentGroup[] = [
  {
    key: "actionRequired",
    title: "要シフト調整",
    recruitments: PROTOTYPE_RECRUITMENTS.slice(0, 2),
    totalCount: 2,
  },
  {
    key: "collecting",
    title: "募集中",
    recruitments: PROTOTYPE_RECRUITMENTS.slice(2),
    totalCount: 1,
  },
];

const PROTOTYPE_RECRUITMENT_SHOP_IDS: Readonly<Record<string, string>> = {
  "sample-recruitment-adjusting-1": APP_PROTOTYPE_IDS.shop,
  "sample-recruitment-adjusting-2": "sample-shop-2",
  [APP_PROTOTYPE_IDS.recruitment]: APP_PROTOTYPE_IDS.shop,
};

const PROTOTYPE_SHOP_FILTER_OPTIONS = APP_PROTOTYPE_SHOP_CONTEXTS.map((shop) => ({
  value: shop.shopId,
  label: shop.shopName,
}));

const PROTOTYPE_STAFFS: Staff[] = APP_PROTOTYPE_FIXTURE.people.map((person, index) => ({
  _id: `sample-staff-${index + 1}` as Staff["_id"],
  organizationPersonId: (index === 0 ? APP_PROTOTYPE_IDS.person : `sample-person-${index + 1}`) as NonNullable<
    Staff["organizationPersonId"]
  >,
  name: person.name,
  email: person.email,
  isManager: person.isManager,
  isLineLinked: person.isLineLinked,
  isLineFollowing: person.isLineLinked,
  excludedFromShift: false,
  isOrganizationLinked: true,
  managerInvitationState: { kind: "hidden" },
}));

const PROTOTYPE_PEOPLE: OrganizationPersonView[] = APP_PROTOTYPE_FIXTURE.people.map((person, index) => ({
  id: index === 0 ? APP_PROTOTYPE_IDS.person : `sample-person-${index + 1}`,
  name: person.name,
  email: person.email,
  managerRole: person.isManager ? "active" : "none",
  isStaff: true,
  isLineConnected: person.isLineLinked,
  lineStatus: person.isLineLinked ? "linked_following" : "unlinked",
  shopNames: person.secondary.split("、"),
  shopIds: [],
  canRemoveManagerRole: false,
  canRemove: false,
}));

const PROTOTYPE_SHOPS: OrganizationShopView[] = APP_PROTOTYPE_FIXTURE.shops.map((shop, index) => ({
  id: index === 0 ? APP_PROTOTYPE_IDS.shop : `sample-shop-${index + 1}`,
  name: shop.name,
  regularClosedDays: [],
  submissionPattern: { kind: "dateOnly" },
  staffCount: shop.staffCount,
  canUpdateSettings: true,
  canDelete: false,
}));

const PROTOTYPE_BILLING: OrganizationBillingView = {
  state: "business",
  currentPlan: "business",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 3, max: 40, pendingInvitations: 0 },
  shopUsage: { current: 3, max: 5 },
  managerUsage: { current: 1, max: 5, pendingInvitations: 1 },
  billingEmail: "billing@example.com",
  canManagePlan: false,
  canUpdatePaymentMethod: false,
  canUpdateBillingEmail: false,
  canScheduleFree: false,
};

export function PrototypeHomeView() {
  const navigate = useNavigate();
  const { model, selectShop } = usePrototypeOperationContext();
  const visibleRecruitmentGroups = useMemo(
    () => filterRecruitmentGroups(model.selectedShop.shopId),
    [model.selectedShop.shopId],
  );
  const visibleRecruitments = useMemo(
    () => visibleRecruitmentGroups.flatMap((group) => group.recruitments),
    [visibleRecruitmentGroups],
  );
  const visibleStaffs = useMemo(
    () =>
      PROTOTYPE_STAFFS.filter((_, index) => PROTOTYPE_PEOPLE[index]?.shopNames.includes(model.selectedShop.shopName)),
    [model.selectedShop.shopName],
  );

  const openShiftBoard = (recruitmentId: string) =>
    void navigate({
      to: "/app/shifts/$recruitmentId/board",
      params: { recruitmentId },
    });

  const openStaffDetail = (staff: Staff) => {
    if (!staff.organizationPersonId) return;

    void navigate({
      to: "/app/staff/$personId",
      params: { personId: staff.organizationPersonId },
    });
  };

  return (
    <PrototypeTopPage navigationKey="home">
      <OperationContextView
        model={model}
        onShopSelect={selectShop}
        onOpenShopDetail={() =>
          void navigate({
            to: "/app/manage/shops/$shopId",
            params: { shopId: model.selectedShop.shopId },
          })
        }
        onOpenOrganizationSettings={() => void navigate({ to: "/app/manage/organization" })}
        showPageHeading={false}
      />

      <HeroSummary
        recruitments={visibleRecruitments}
        onOpenShiftBoard={openShiftBoard}
        onCreateRecruitment={() => undefined}
        isCreateRecruitmentActionDisabled
        createRecruitmentDisabledReason={PREVIEW_DISABLED_REASON}
      />

      <RecruitmentBoard
        groups={visibleRecruitmentGroups}
        isReadOnly
        showRecruitmentMenus
        canDeleteRecruitments={false}
        deleteRecruitmentDisabledReason={PREVIEW_DISABLED_REASON}
        pastStatus="Exhausted"
        hasPastRecruitments={false}
        isPastRecruitmentsVisible={false}
        canLoadMorePastRecruitments={false}
        onCreateClick={() => undefined}
        onOpenShiftBoard={openShiftBoard}
        onDeleteRecruitment={() => undefined}
        onShowPastRecruitments={() => undefined}
        onLoadMorePastRecruitments={() => undefined}
      />

      <StaffRoster
        staffs={visibleStaffs}
        isReadOnly
        status="Exhausted"
        canLoadMore={false}
        onAddClick={() => undefined}
        onOpenDetail={openStaffDetail}
        onLoadMore={() => undefined}
      />
    </PrototypeTopPage>
  );
}

export function PrototypeShiftsView() {
  const navigate = useNavigate();

  return (
    <PrototypeTopPage navigationKey="shifts" showHeading={false}>
      <Stack gap={0}>
        {APP_PROTOTYPE_SHOP_CONTEXTS.map((shop, index) => (
          <Fragment key={shop.shopId}>
            {index > 0 && <Separator my={{ base: 7, lg: 10 }} borderColor="gray.200" />}
            <RecruitmentBoard
              title={`${shop.shopName}のシフト一覧`}
              groups={filterRecruitmentGroups(shop.shopId)}
              isReadOnly
              showRecruitmentMenus
              canDeleteRecruitments={false}
              deleteRecruitmentDisabledReason={PREVIEW_DISABLED_REASON}
              pastStatus="Exhausted"
              hasPastRecruitments={false}
              isPastRecruitmentsVisible={false}
              canLoadMorePastRecruitments={false}
              onCreateClick={() => undefined}
              onOpenShiftBoard={(recruitmentId) =>
                void navigate({
                  to: "/app/shifts/$recruitmentId/board",
                  params: { recruitmentId },
                })
              }
              onDeleteRecruitment={() => undefined}
              onShowPastRecruitments={() => undefined}
              onLoadMorePastRecruitments={() => undefined}
            />
          </Fragment>
        ))}
      </Stack>
    </PrototypeTopPage>
  );
}

export function PrototypeStaffView() {
  const navigate = useNavigate();
  const [shopFilter, setShopFilter] = useState<string | null>(null);
  const selectedShopName = APP_PROTOTYPE_SHOP_CONTEXTS.find((shop) => shop.shopId === shopFilter)?.shopName;
  const visiblePeople = selectedShopName
    ? PROTOTYPE_PEOPLE.filter((person) => person.shopNames.includes(selectedShopName))
    : PROTOTYPE_PEOPLE;

  return (
    <PrototypeTopPage
      navigationKey="staff"
      headingAction={
        <ShopFilterMenu value={shopFilter} options={PROTOTYPE_SHOP_FILTER_OPTIONS} onChange={setShopFilter} />
      }
    >
      <PeopleSection
        people={visiblePeople}
        peopleUsage={PROTOTYPE_BILLING.peopleUsage}
        filterResultCount={shopFilter === null ? undefined : visiblePeople.length}
        showManagerInvitation
        onManageManagers={() => void navigate({ to: "/app/manage/managers" })}
        onOpenUser={(personId) =>
          void navigate({
            to: "/app/staff/$personId",
            params: { personId },
          })
        }
      />
    </PrototypeTopPage>
  );
}

export function PrototypeActionsView() {
  const navigate = useNavigate();
  const [shopFilter, setShopFilter] = useState<string | null>(null);
  const items: readonly ScopedActionInboxItem[] = [
    {
      id: "shift-adjustment",
      category: "shift",
      statusLabel: "締切済み",
      title: "シフトを組んでスタッフに共有しましょう",
      description: "未提出のスタッフを確認し、必要な人数を割り当てます。",
      metadata: [
        { label: "yn1323店舗", icon: "shop" },
        { label: "8/17〜8/24" },
        { label: "提出 2/3人" },
        { label: "締切 8/12" },
      ],
      scopeShopId: APP_PROTOTYPE_IDS.shop,
      actions: [
        {
          label: "シフトを組む",
          emphasis: "primary",
          onClick: () =>
            void navigate({
              to: "/app/shifts/$recruitmentId/board",
              params: { recruitmentId: "sample-recruitment-adjusting-1" },
            }),
        },
      ],
    },
    {
      id: "staff-registration",
      category: "staff",
      statusLabel: "承認待ち",
      title: "山田花子さんからスタッフ登録申請があります",
      description: "申請内容と勤務する店舗を確認してから承認します。",
      metadata: [{ label: "もて", icon: "shop" }, { label: "申請 8/14 10:30" }],
      scopeShopId: "sample-shop-2",
      actions: [
        {
          label: "却下する",
          emphasis: "danger",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "山田花子さんのスタッフ登録申請を却下しました。",
        },
        {
          label: "承認する",
          emphasis: "primary",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "山田花子さんのスタッフ登録申請を承認しました。",
        },
      ],
    },
    {
      id: "notification-failure",
      category: "notification",
      statusLabel: "送信失敗",
      title: "田中さんへシフト募集通知を送れませんでした",
      description: "連絡先を確認して再送するか、対応済みにします。",
      metadata: [{ label: "yn1323店舗", icon: "shop" }, { label: "メール" }, { label: "8/14 09:20" }],
      scopeShopId: APP_PROTOTYPE_IDS.shop,
      actions: [
        {
          label: "対応済みにする",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "田中さんへの通知不達を対応済みにしました。",
        },
        {
          label: "再送する",
          emphasis: "primary",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "田中さんへのシフト募集通知を再送しました。",
        },
      ],
    },
    {
      id: "manager-invitation-failure",
      category: "management",
      statusLabel: "招待エラー",
      title: "鈴木さんへの管理者招待を確認してください",
      description: "招待メールを送信できなかったため、状態の確認が必要です。",
      metadata: [{ label: "メール" }, { label: "8/14 08:45" }],
      scopeShopId: null,
      actions: [
        {
          label: "取り消す",
          emphasis: "danger",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "鈴木さんへの管理者招待を取り消しました。",
        },
        {
          label: "再送する",
          emphasis: "primary",
          onClick: () => undefined,
          removesItemOnSuccess: true,
          successMessage: "鈴木さんへの管理者招待メールを再送しました。",
        },
      ],
    },
  ];
  const visibleItems = shopFilter === null ? items : items.filter((item) => item.scopeShopId === shopFilter);

  return (
    <PrototypeTopPage navigationKey="actions" title="対応が必要なこと">
      <Flex justify="flex-start">
        <ShopFilterMenu
          value={shopFilter}
          options={PROTOTYPE_SHOP_FILTER_OPTIONS}
          onChange={setShopFilter}
          prefix="対象"
        />
      </Flex>

      <ActionInboxView items={visibleItems} />
    </PrototypeTopPage>
  );
}

export function PrototypeManageView() {
  const navigate = useNavigate();
  const { model, selectShop } = usePrototypeOperationContext();

  return (
    <PrototypeTopPage navigationKey="manage">
      <OperationContextView
        model={model}
        onShopSelect={selectShop}
        onOpenShopDetail={() => undefined}
        onOpenOrganizationSettings={() => void navigate({ to: "/app/manage/organization" })}
        showPageHeading={false}
        showShopContext={false}
      />
      <OrganizationUsageSection billing={PROTOTYPE_BILLING} />

      <Stack as="section" gap={4} aria-labelledby="prototype-organization-management-heading">
        <Flex justify="space-between" align="center" gap={3} wrap="wrap">
          <HStack gap={2}>
            <LuBuilding2 aria-hidden />
            <Heading id="prototype-organization-management-heading" as="h2" fontSize="lg">
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
            disabled
            title={PREVIEW_DISABLED_REASON}
          >
            <LuPlus aria-hidden />
            別の組織を作る
          </Button>
        </Flex>
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            <ManagementRouteRow
              icon={LuBuilding2}
              title="組織情報"
              description={APP_PROTOTYPE_FIXTURE.organization.name}
              onClick={() => void navigate({ to: "/app/manage/organization" })}
            />
            <ManagementRouteRow
              icon={LuShieldCheck}
              title="管理者と権限"
              description="管理者 1人 ・ 招待中 1件"
              onClick={() => void navigate({ to: "/app/manage/managers" })}
            />
            <ManagementRouteRow
              icon={LuCreditCard}
              title="プランと支払い"
              description="Businessプラン"
              onClick={() => void navigate({ to: "/app/manage/billing" })}
            />
          </Stack>
        </Box>
      </Stack>

      <ShopsSection
        shops={PROTOTYPE_SHOPS}
        shopUsage={PROTOTYPE_BILLING.shopUsage}
        showAddShop
        canAddShop={false}
        onAddShop={() => undefined}
        onOpenShop={(shopId) =>
          void navigate({
            to: "/app/manage/shops/$shopId",
            params: { shopId },
          })
        }
      />
    </PrototypeTopPage>
  );
}

function PrototypeTopPage({
  navigationKey,
  title,
  headingAction,
  showHeading = true,
  children,
}: {
  navigationKey: AppNavigationKey;
  title?: string;
  headingAction?: React.ReactNode;
  showHeading?: boolean;
  children: React.ReactNode;
}) {
  const navigationItem = APP_PRIMARY_NAVIGATION_ITEMS.find((item) => item.key === navigationKey);

  if (!navigationItem) return null;

  return (
    <AuthenticatedPageContent>
      <Stack as="main" gap={{ base: 6, lg: 8 }}>
        {showHeading ? (
          <Flex align="center" justify="space-between" gap={3} minH="44px">
            <HStack gap={2.5} minW={0} flexShrink={0}>
              <Icon as={navigationItem.icon} boxSize={{ base: 5, lg: 6 }} flexShrink={0} aria-hidden />
              <Heading as="h1" textStyle="sectionTitle" color="gray.900">
                {title ?? navigationItem.label}
              </Heading>
            </HStack>
            {headingAction && (
              <Box minW={0} maxW={{ base: "190px", sm: "240px" }}>
                {headingAction}
              </Box>
            )}
          </Flex>
        ) : (
          <VisuallyHidden as="h1">{title ?? navigationItem.label}</VisuallyHidden>
        )}
        {children}
      </Stack>
    </AuthenticatedPageContent>
  );
}

type ScopedActionInboxItem = ActionInboxItem & {
  scopeShopId: string | null;
};

function usePrototypeOperationContext() {
  const [selectedShopId, setSelectedShopId] = useState<string>(APP_PROTOTYPE_IDS.shop);
  const model = useMemo(
    () => buildOperationContextModel(APP_PROTOTYPE_SHOP_CONTEXTS, selectedShopId),
    [selectedShopId],
  );

  if (!model) throw new Error("固定プレビューの店舗コンテキストを構築できませんでした");

  return {
    model,
    selectShop: setSelectedShopId,
  };
}

function filterRecruitmentGroups(shopId: string | null): DashboardRecruitmentGroup[] {
  if (shopId === null) return PROTOTYPE_RECRUITMENT_GROUPS;

  return PROTOTYPE_RECRUITMENT_GROUPS.flatMap((group) => {
    const recruitments = group.recruitments.filter(
      (recruitment) => PROTOTYPE_RECRUITMENT_SHOP_IDS[recruitment._id] === shopId,
    );

    return recruitments.length > 0 ? [{ ...group, recruitments, totalCount: recruitments.length }] : [];
  });
}

function ManagementRouteRow({
  icon: RowIcon,
  title,
  description,
  onClick,
}: {
  icon: IconType;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <DrilldownRow
      ariaLabel={`${title}を開く`}
      title={title}
      secondary={
        <Text fontSize="xs" color="fg.muted">
          {description}
        </Text>
      }
      leading={
        <Flex
          boxSize="40px"
          borderRadius="lg"
          bg="teal.100"
          color="teal.700"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <RowIcon aria-hidden />
        </Flex>
      }
      onClick={onClick}
    />
  );
}
