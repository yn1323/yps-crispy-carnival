import { Box, Skeleton, Stack, Tabs } from "@chakra-ui/react";
import { LuCreditCard, LuSettings, LuStore, LuUsers } from "react-icons/lu";
import { OrganizationContext } from "./OrganizationContext";
import { OrganizationCreationSection } from "./OrganizationCreation/OrganizationCreationSection";
import { OrganizationDeletionSection } from "./OrganizationDeletion/OrganizationDeletionSection";
import { PeopleSection } from "./PeopleSection";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import { ShopsSection } from "./ShopsSection";
import type { OrganizationSettingsTab, OrganizationSettingsViewProps } from "./types";

export const OrganizationSettingsView = ({
  organizationContext,
  people,
  shops,
  billing,
  planPrices,
  canInviteManager,
  managerInvitations,
  managerInvitationMode,
  inviteManagerDisabledReason,
  canUpdateOrganizationName,
  updateOrganizationNameDisabledReason,
  canAddShop,
  addShopDisabledReason,
  canDeleteOrganization,
  deleteOrganizationDisabledReason,
  canCreateOrganization,
  createOrganizationDisabledReason,
  features,
  actions,
  defaultTab = "people",
  onTabChange,
  initialVisibleUserCount,
  focusedPersonId,
  onVisibleUserCountChange,
}: OrganizationSettingsViewProps) => (
  <Stack gap={{ base: 5, md: 7 }}>
    <OrganizationContext
      model={organizationContext}
      canUpdateOrganizationName={canUpdateOrganizationName}
      updateOrganizationNameDisabledReason={updateOrganizationNameDisabledReason}
      onSelectOrganization={actions.onSelectOrganization}
      onUpdateOrganizationName={actions.onUpdateOrganizationName}
    />

    <Tabs.Root
      value={onTabChange ? defaultTab : undefined}
      defaultValue={onTabChange ? undefined : defaultTab}
      onValueChange={onTabChange ? ({ value }) => onTabChange(value as OrganizationSettingsTab) : undefined}
      colorPalette="teal"
      variant="outline"
      lazyMount
    >
      <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap">
        <Tabs.Trigger value="people" flexShrink={0} gap={2}>
          <LuUsers aria-hidden />
          ユーザー
        </Tabs.Trigger>
        <Tabs.Trigger value="shops" flexShrink={0} gap={2}>
          <LuStore aria-hidden />
          店舗
        </Tabs.Trigger>
        {features.billing && (
          <Tabs.Trigger value="billing" flexShrink={0} gap={2}>
            <LuCreditCard aria-hidden />
            プランと支払い
          </Tabs.Trigger>
        )}
        <Tabs.Trigger value="settings" flexShrink={0} gap={2}>
          <LuSettings aria-hidden />
          設定
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="people" p={0} pt={{ base: 5, md: 6 }}>
        <PeopleSection
          people={people}
          showManagerInvitation={features.managerInvitation}
          canInviteManager={canInviteManager}
          canOpenManagerInvitation={
            features.managerInvitation &&
            (canInviteManager || managerInvitations.some((invitation) => invitation.canResend))
          }
          managerInvitationMode={managerInvitationMode}
          inviteManagerDisabledReason={inviteManagerDisabledReason}
          onInviteManager={actions.onInviteManager}
          onOpenUser={actions.onOpenUser}
          initialVisibleUserCount={initialVisibleUserCount}
          focusedPersonId={focusedPersonId}
          onVisibleUserCountChange={onVisibleUserCountChange}
        />
      </Tabs.Content>

      <Tabs.Content value="shops" p={0} pt={{ base: 5, md: 6 }}>
        <ShopsSection
          shops={shops}
          showAddShop={features.shopAddition}
          canAddShop={canAddShop}
          addShopDisabledReason={addShopDisabledReason}
          onAddShop={actions.onAddShop}
          onOpenShop={actions.onOpenShop}
        />
      </Tabs.Content>

      {features.billing && (
        <Tabs.Content value="billing" p={0} pt={{ base: 5, md: 6 }}>
          <PlanAndPaymentSection
            billing={billing}
            planPrices={planPrices}
            onManagePlan={actions.onManagePlan}
            onRetryPlanPrice={actions.onRetryPlanPrice}
            onUpdatePaymentMethod={actions.onUpdatePaymentMethod}
            onUpdateBillingEmail={actions.onUpdateBillingEmail}
            onOpenBillingDocuments={actions.onOpenBillingDocuments}
          />
        </Tabs.Content>
      )}

      <Tabs.Content value="settings" p={0} pt={{ base: 5, md: 6 }}>
        <Stack gap={{ base: 5, md: 6 }}>
          {features.organizationCreation && (
            <OrganizationCreationSection
              canCreate={canCreateOrganization}
              disabledReason={createOrganizationDisabledReason}
              onCreate={actions.onCreateOrganization}
            />
          )}
          <OrganizationDeletionSection
            canDelete={canDeleteOrganization}
            disabledReason={deleteOrganizationDisabledReason}
            onDelete={actions.onDeleteOrganization}
          />
        </Stack>
      </Tabs.Content>
    </Tabs.Root>
  </Stack>
);

export const OrganizationSettingsSkeleton = () => (
  <Stack gap={6} aria-label="組織設定を読み込み中">
    <Stack gap={2}>
      <Skeleton h="20px" w="220px" />
      <Skeleton h="40px" w="200px" />
    </Stack>
    <Skeleton h="42px" w="full" />
    <Box borderWidth="1px" borderRadius="xl" bg="white" p={5}>
      <Stack gap={4}>
        <Skeleton h="28px" w="180px" />
        <Skeleton h="72px" w="full" />
        <Skeleton h="72px" w="full" />
        <Skeleton h="72px" w="full" />
      </Stack>
    </Box>
  </Stack>
);
