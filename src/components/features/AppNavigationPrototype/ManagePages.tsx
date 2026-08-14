import { Stack, Text } from "@chakra-ui/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuBuilding2, LuCreditCard, LuShieldCheck } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ManagerCandidateListView,
  ManagerExternalInviteFormView,
  type ManagerSettingsCandidate,
  ManagerSettingsView,
  type ReadyManagerSettingsOverview,
} from "@/src/components/features/ManagerSettings";
import {
  type BillingPlanPrices,
  type OrganizationBillingView,
  OrganizationCreationSection,
  OrganizationDeletionSection,
  OrganizationUsageSection,
  PlanAndPaymentSection,
} from "@/src/components/features/OrganizationSettings";
import { type ShopDetailData, type ShopDetailPerson, ShopDetailView } from "@/src/components/features/ShopDetail";
import { ActionSection } from "@/src/components/ui/ActionSection";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { APP_PROTOTYPE_FIXTURE, APP_PROTOTYPE_IDS } from "./fixtures";
import { PrototypePage } from "./PrototypeUI";

const noop = () => undefined;
const PREVIEW_DISABLED_REASON = "固定プレビューのため、この画面では操作できません。";

const personIds = APP_PROTOTYPE_FIXTURE.people.map(
  (_, index) => `${APP_PROTOTYPE_IDS.person}-${index + 1}` as Id<"organizationPeople">,
);
const managerInvitationId = "sample-manager-invitation" as Id<"organizationInvitations">;

const managerOverview: ReadyManagerSettingsOverview = {
  kind: "ready",
  organizationName: APP_PROTOTYPE_FIXTURE.organization.name,
  mode: "managerAddition",
  usage: {
    activeManagers: 1,
    activeInvitationCount: 1,
    pendingAdditions: 1,
    pendingExchanges: 0,
    projectedManagers: 2,
    maxManagers: 5,
  },
  actions: {
    canInviteExistingStaff: true,
    canInviteExternal: true,
  },
  managers: [
    {
      personId: personIds[0],
      name: APP_PROTOTYPE_FIXTURE.people[0].name,
      contactEmail: APP_PROTOTYPE_FIXTURE.people[0].email,
      role: "active",
      isSelf: true,
      canRemoveRole: false,
      removeRoleDisabledReason: "最後の有効な管理者の管理者権限は外せません。",
    },
  ],
  invitations: [
    {
      invitationId: managerInvitationId,
      name: "鈴木さん",
      invitedEmail: "suzuki@example.com",
      purpose: "managerAddition",
      status: "pending",
      expiresAt: Date.UTC(2026, 7, 20, 9, 0),
      canResend: true,
      canRevoke: true,
    },
  ],
};

const managerCandidates: ManagerSettingsCandidate[] = APP_PROTOTYPE_FIXTURE.people.map((person, index) => ({
  personId: personIds[index],
  name: person.name,
  contactEmail: person.email,
  canSelect: !person.isManager,
  ...(person.isManager ? { disabledReason: "すでに管理者です。" } : {}),
}));

const billing: OrganizationBillingView = {
  state: "business",
  currentPlan: "business",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 3, max: 40 },
  shopUsage: { current: 3, max: 5 },
  managerUsage: { current: 1, max: 5 },
  nextEvent: { label: "次回更新日", date: "2026年9月1日" },
  billingEmail: "billing@example.com",
  canManagePlan: false,
  canUpdatePaymentMethod: false,
  canUpdateBillingEmail: false,
  canScheduleFree: false,
  managePlanDisabledReason: PREVIEW_DISABLED_REASON,
  paymentMethodDisabledReason: PREVIEW_DISABLED_REASON,
  billingEmailDisabledReason: PREVIEW_DISABLED_REASON,
};

const planPrices: BillingPlanPrices = {
  pro: {
    status: "available",
    value: { currency: "jpy", unitAmount: 3000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
  },
  business: {
    status: "available",
    value: { currency: "jpy", unitAmount: 6000, interval: "month", intervalCount: 1, taxBehavior: "inclusive" },
  },
};

const shop: ShopDetailData = {
  id: APP_PROTOTYPE_IDS.shop,
  name: APP_PROTOTYPE_FIXTURE.currentShop.name,
  regularClosedDays: [],
  submissionPattern: {
    kind: "shiftType",
    options: [
      { id: "early", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
      { id: "late", name: "遅番", startTime: "15:00", endTime: "21:00", sortOrder: 1 },
    ],
  },
  managerNotificationRecipientStatus: "available",
  canUpdateSettings: false,
  settingsDisabledReason: PREVIEW_DISABLED_REASON,
  canDelete: false,
  deleteDisabledReason: PREVIEW_DISABLED_REASON,
};

const shopStaffs: ShopDetailPerson[] = APP_PROTOTYPE_FIXTURE.people.map((person, index) => ({
  id: personIds[index],
  name: person.name,
  managerRole: person.isManager ? "active" : "none",
  lineStatus: person.isLineLinked ? "linked_following" : "unlinked",
  shopNames: [APP_PROTOTYPE_FIXTURE.currentShop.name],
  shopIds: [APP_PROTOTYPE_IDS.shop],
}));

const closedSettingsDialog = {
  isOpen: false,
  onOpenChange: noop,
  open: noop,
  close: noop,
  isUpdating: false,
};

export function PrototypeManageOrganizationView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <Stack gap={{ base: 5, md: 7 }}>
        <DetailPageHeader
          title="組織情報"
          icon={LuBuilding2}
          onBack={() => void navigate({ to: "/app/manage" })}
          backLabel="管理へ戻る"
          backAriaLabel="管理へ戻る"
        />
        <OrganizationUsageSection billing={billing} />
        <ActionSection
          title="組織名"
          description={`${APP_PROTOTYPE_FIXTURE.organization.name}\n${APP_PROTOTYPE_FIXTURE.organization.idLabel} ・ ${APP_PROTOTYPE_FIXTURE.organization.createdAt}作成`}
          actionLabel="編集する"
          isActionEnabled={false}
          disabledReason={PREVIEW_DISABLED_REASON}
          onAction={noop}
        />
        <OrganizationCreationSection canCreate={false} disabledReason={PREVIEW_DISABLED_REASON} onCreate={noop} />
        <OrganizationDeletionSection canDelete={false} disabledReason={PREVIEW_DISABLED_REASON} onDelete={noop} />
      </Stack>
    </PrototypePage>
  );
}

export function PrototypeManageManagersView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <ManagerSettingsView
        overview={managerOverview}
        shopId={APP_PROTOTYPE_IDS.shop}
        navigationMode="app"
        title="管理者と権限"
        titleIcon={LuShieldCheck}
        backLabel="管理へ戻る"
        mutationDisabledReason={PREVIEW_DISABLED_REASON}
        onBack={() => void navigate({ to: "/app/manage" })}
        onRequestResend={noop}
        onRequestRevoke={noop}
        onRequestRemoveRole={noop}
      />
    </PrototypePage>
  );
}

export function PrototypeManageInviteStaffView() {
  const [selectedPersonId, setSelectedPersonId] = useState("");

  return (
    <PrototypePage maxW="760px" mx="auto">
      <ManagerCandidateListView
        candidates={managerCandidates}
        selectedPersonId={selectedPersonId}
        isSubmitting={false}
        isReadOnly
        onSelect={setSelectedPersonId}
        onSubmit={noop}
      />
    </PrototypePage>
  );
}

export function PrototypeManageInviteNewView() {
  return (
    <PrototypePage maxW="760px" mx="auto">
      <ManagerExternalInviteFormView isSubmitting={false} isReadOnly onRequestInvite={noop} />
    </PrototypePage>
  );
}

export function PrototypeManageBillingView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <Stack gap={{ base: 5, md: 7 }}>
        <DetailPageHeader
          title="プランと支払い"
          icon={LuCreditCard}
          onBack={() => void navigate({ to: "/app/manage" })}
          backLabel="管理へ戻る"
          backAriaLabel="管理へ戻る"
        />
        <OrganizationUsageSection billing={billing} />
        <PlanAndPaymentSection
          billing={billing}
          planPrices={planPrices}
          onManagePlan={noop}
          onRetryPlanPrice={noop}
          onUpdatePaymentMethod={noop}
          onUpdateBillingEmail={noop}
          onOpenBillingDocuments={noop}
        />
        <Text textStyle="bodySm" color="fg.muted">
          固定fixtureのため、契約や請求情報を変更する操作は実行されません。
        </Text>
      </Stack>
    </PrototypePage>
  );
}

export function PrototypeManageShopDetailView() {
  const navigate = useNavigate();

  return (
    <PrototypePage>
      <ShopDetailView
        shop={shop}
        organizationSettingsShopId={APP_PROTOTYPE_IDS.shop}
        staffs={shopStaffs}
        settingsDialog={closedSettingsDialog}
        isDeleting={false}
        onBack={() => void navigate({ to: "/app/manage" })}
        onOpenUser={(personId) => void navigate({ to: "/app/staff/$personId", params: { personId } })}
        onUpdateSettings={noop}
        onDelete={async () => false}
      />
    </PrototypePage>
  );
}
