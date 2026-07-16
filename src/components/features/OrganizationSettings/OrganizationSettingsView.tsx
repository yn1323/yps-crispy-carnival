import { Box, Heading, HStack, Skeleton, Stack, Tabs, Text } from "@chakra-ui/react";
import { LuBuilding2, LuCreditCard, LuStore, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { PeopleSection } from "./PeopleSection";
import { PlanAndPaymentSection } from "./PlanAndPaymentSection";
import { ShopsSection } from "./ShopsSection";
import type { OrganizationSettingsViewProps } from "./types";

export const OrganizationSettingsView = ({
  organizationName,
  currentShopName,
  people,
  managerInvitations,
  shops,
  billing,
  freeSelection,
  canInviteManager,
  managerInvitationMode,
  inviteManagerDisabledReason,
  canUpdateOrganizationName,
  updateOrganizationNameDisabledReason,
  canAddShop,
  addShopDisabledReason,
  actions,
  defaultTab = "people",
}: OrganizationSettingsViewProps) => (
  <Stack gap={{ base: 5, md: 7 }}>
    <Stack gap={2}>
      <HStack gap={2} color="teal.700" wrap="wrap">
        <LuBuilding2 aria-hidden />
        <Text fontSize="sm" fontWeight="bold">
          {organizationName}
        </Text>
        <Text fontSize="sm" color="fg.muted">
          / 操作中: {currentShopName}
        </Text>
        <Button
          size="xs"
          variant="plain"
          onClick={actions.onUpdateOrganizationName}
          disabled={!canUpdateOrganizationName}
          title={!canUpdateOrganizationName ? updateOrganizationNameDisabledReason : undefined}
          aria-describedby={
            !canUpdateOrganizationName && updateOrganizationNameDisabledReason
              ? "organization-name-update-disabled-reason"
              : undefined
          }
        >
          事業者名を変更
        </Button>
      </HStack>
      {!canUpdateOrganizationName && updateOrganizationNameDisabledReason && (
        <Text id="organization-name-update-disabled-reason" fontSize="xs" color="orange.700">
          {updateOrganizationNameDisabledReason}
        </Text>
      )}
      <Heading as="h1" fontSize={{ base: "2xl", md: "3xl" }} color="gray.900">
        事業者設定
      </Heading>
      <Text color="fg.muted">事業者全体の利用者、店舗、プランと支払いを管理します。</Text>
    </Stack>

    <Tabs.Root defaultValue={defaultTab} colorPalette="teal" variant="line">
      <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
        <Tabs.Trigger value="people" flexShrink={0} gap={2}>
          <LuUsers aria-hidden />
          利用者
        </Tabs.Trigger>
        <Tabs.Trigger value="shops" flexShrink={0} gap={2}>
          <LuStore aria-hidden />
          店舗
        </Tabs.Trigger>
        <Tabs.Trigger value="billing" flexShrink={0} gap={2}>
          <LuCreditCard aria-hidden />
          プランと支払い
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="people" pt={{ base: 5, md: 6 }}>
        <PeopleSection
          people={people}
          invitations={managerInvitations}
          billing={billing}
          canInviteManager={canInviteManager}
          managerInvitationMode={managerInvitationMode}
          inviteManagerDisabledReason={inviteManagerDisabledReason}
          onInviteManager={actions.onInviteManager}
          onRemovePersonFromCurrentShop={actions.onRemovePersonFromCurrentShop}
          onRemoveManagerRole={actions.onRemoveManagerRole}
          onRemovePerson={actions.onRemovePerson}
          onResendInvitation={actions.onResendInvitation}
          onRevokeInvitation={actions.onRevokeInvitation}
        />
      </Tabs.Content>

      <Tabs.Content value="shops" pt={{ base: 5, md: 6 }}>
        <ShopsSection
          shops={shops}
          canAddShop={canAddShop}
          addShopDisabledReason={addShopDisabledReason}
          onAddShop={actions.onAddShop}
          onArchiveShop={actions.onArchiveShop}
          onReactivateShop={actions.onReactivateShop}
        />
      </Tabs.Content>

      <Tabs.Content value="billing" pt={{ base: 5, md: 6 }}>
        <PlanAndPaymentSection
          organizationName={organizationName}
          billing={billing}
          freeSelection={freeSelection}
          onManagePlan={actions.onManagePlan}
          onUpdatePaymentMethod={actions.onUpdatePaymentMethod}
          onUpdateBillingEmail={actions.onUpdateBillingEmail}
          onOpenInvoice={actions.onOpenInvoice}
          onSaveFreeSelection={actions.onSaveFreeSelection}
        />
      </Tabs.Content>
    </Tabs.Root>
  </Stack>
);

export const OrganizationSettingsSkeleton = () => (
  <Stack gap={6} aria-label="事業者設定を読み込み中">
    <Stack gap={2}>
      <Skeleton h="20px" w="220px" />
      <Skeleton h="40px" w="200px" />
      <Skeleton h="22px" w={{ base: "100%", md: "480px" }} />
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
