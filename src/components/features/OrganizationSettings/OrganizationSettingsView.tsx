import { Box, Flex, Grid, HStack, Skeleton, Stack, Tabs } from "@chakra-ui/react";
import { LuCreditCard, LuSettings, LuStore, LuUsers } from "react-icons/lu";
import { DeletionActionSectionSkeleton } from "@/src/components/shared/DeletionActionSection";
import { DetailPageHeaderSkeleton } from "@/src/components/ui/DetailPageHeader";
import {
  AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
  type OrganizationSettingsFeatures,
} from "@/src/domains/featureVisibility";
import { OrganizationContext } from "./OrganizationContext";
import { OrganizationCreationSection } from "./OrganizationCreation/OrganizationCreationSection";
import { OrganizationDeletionSection } from "./OrganizationDeletion/OrganizationDeletionSection";
import { OrganizationUsageSection, OrganizationUsageSectionSkeleton } from "./OrganizationUsageSection";
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
      onBackToDashboard={actions.onBackToDashboard}
      onSelectOrganization={actions.onSelectOrganization}
      onUpdateOrganizationName={actions.onUpdateOrganizationName}
    />

    {features.billing && <OrganizationUsageSection billing={billing} />}

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
          スタッフ
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
          peopleUsage={billing.peopleUsage}
          showManagerInvitation={features.managerInvitation}
          onManageManagers={actions.onManageManagers}
          onOpenUser={actions.onOpenUser}
          initialVisibleUserCount={initialVisibleUserCount}
          focusedPersonId={focusedPersonId}
          onVisibleUserCountChange={onVisibleUserCountChange}
        />
      </Tabs.Content>

      <Tabs.Content value="shops" p={0} pt={{ base: 5, md: 6 }}>
        <ShopsSection
          shops={shops}
          shopUsage={billing.shopUsage}
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

type OrganizationSettingsSkeletonProps = {
  defaultTab?: OrganizationSettingsTab;
  showOrganizationSelector?: boolean;
  features?: OrganizationSettingsFeatures;
};

export function OrganizationSettingsSkeleton({
  defaultTab = "people",
  showOrganizationSelector = false,
  features = AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
}: OrganizationSettingsSkeletonProps) {
  const visibleTab = defaultTab === "billing" && !features.billing ? "people" : defaultTab;

  return (
    <Stack gap={{ base: 5, md: 7 }} aria-label="組織設定を読み込み中" aria-busy="true">
      <OrganizationContextSkeleton showOrganizationSelector={showOrganizationSelector} />
      {features.billing && <OrganizationUsageSectionSkeleton />}
      <Box>
        <OrganizationTabsSkeleton showBilling={features.billing} />
        <Box pt={{ base: 5, md: 6 }}>{organizationSettingsBodySkeleton(visibleTab, features)}</Box>
      </Box>
    </Stack>
  );
}

function OrganizationContextSkeleton({ showOrganizationSelector }: { showOrganizationSelector: boolean }) {
  return (
    <Stack gap={2}>
      <DetailPageHeaderSkeleton titleWidth={{ base: "176px", md: "320px" }} showAction />
      {showOrganizationSelector && (
        <Flex
          minH={{ base: "48px", md: "56px" }}
          align="center"
          justify="space-between"
          gap={3}
          px={{ base: 3, md: 4 }}
          py={2.5}
          borderWidth="1px"
          borderColor="gray.300"
          borderRadius="lg"
          bg="white"
        >
          <Skeleton h={{ base: "28px", md: "32px" }} w={{ base: "176px", md: "320px" }} maxW="80%" />
          <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
        </Flex>
      )}
    </Stack>
  );
}

function OrganizationTabsSkeleton({ showBilling }: { showBilling: boolean }) {
  const tabs = [
    { value: "people", width: "64px" },
    { value: "shops", width: "40px" },
    ...(showBilling ? [{ value: "billing", width: "104px" }] : []),
    { value: "settings", width: "40px" },
  ];

  return (
    <Box h="40px" overflow="hidden" borderBottomWidth="1px" borderColor="border">
      <HStack h="full" w="max-content" gap={0} align="stretch">
        {tabs.map((tab) => (
          <Flex key={tab.value} h="full" align="center" gap={2} px={{ base: 3, md: 4 }} flexShrink={0}>
            <Skeleton boxSize={4} borderRadius="sm" />
            <Skeleton h="20px" w={tab.width} />
          </Flex>
        ))}
      </HStack>
    </Box>
  );
}

function organizationSettingsBodySkeleton(tab: OrganizationSettingsTab, features: OrganizationSettingsFeatures) {
  if (tab === "shops") return <ShopsSettingsSkeleton showAddShop={features.shopAddition} />;
  if (tab === "billing") return <BillingSettingsSkeleton />;
  if (tab === "settings") {
    return <SettingsTabSkeleton showOrganizationCreation={features.organizationCreation} />;
  }
  return <PeopleSettingsSkeleton showManagerInvitation={features.managerInvitation} />;
}

function PeopleSettingsSkeleton({ showManagerInvitation }: { showManagerInvitation: boolean }) {
  return (
    <Stack gap={4}>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <SectionHeadingSkeleton width="184px" />
        {showManagerInvitation && <Skeleton h="36px" w="136px" />}
      </Flex>
      <SettingsDrilldownListSkeleton kind="people" />
    </Stack>
  );
}

function ShopsSettingsSkeleton({ showAddShop }: { showAddShop: boolean }) {
  return (
    <Stack gap={4}>
      <Stack gap={1}>
        <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
          <SectionHeadingSkeleton width="144px" />
          {showAddShop && <Skeleton h="36px" w="120px" borderRadius="md" />}
        </Flex>
        <Skeleton h="18px" w="288px" maxW="90%" />
      </Stack>
      <SettingsDrilldownListSkeleton kind="shops" />
    </Stack>
  );
}

function SectionHeadingSkeleton({ width, showIcon = true }: { width: string; showIcon?: boolean }) {
  return (
    <HStack gap={2}>
      {showIcon && <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />}
      <Skeleton h="28px" w={width} maxW="70vw" />
    </HStack>
  );
}

function SettingsDrilldownListSkeleton({ kind }: { kind: "people" | "shops" }) {
  return (
    <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
      <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
        {Array.from({ length: 3 }, (_, index) => (
          <Flex key={index} gap={3} align="center" px={{ base: 3, md: 4 }} py={3.5}>
            <Skeleton boxSize="40px" borderRadius={kind === "people" ? "full" : "lg"} flexShrink={0} />
            <Stack gap={kind === "people" ? 1 : 0} flex={1} minW={0}>
              <Flex align="center" justify="space-between" gap={2} wrap="wrap" minW={0}>
                <Skeleton h="20px" w={index === 1 ? "136px" : "112px"} maxW="55%" />
                {kind === "people" && (
                  <Grid templateColumns="96px 64px" gap={1.5} ms="auto" flexShrink={0}>
                    <Box>{index === 1 && <Skeleton h="20px" w="96px" borderRadius="full" />}</Box>
                    <Skeleton h="20px" w="64px" borderRadius="full" />
                  </Grid>
                )}
              </Flex>
              {kind === "people" && (
                <HStack display={{ base: "none", md: "flex" }} gap={1.5}>
                  <Skeleton boxSize={4} borderRadius="sm" />
                  <Skeleton h="18px" w={index === 2 ? "96px" : "152px"} />
                </HStack>
              )}
            </Stack>
            <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
          </Flex>
        ))}
      </Stack>
    </Box>
  );
}

function BillingSettingsSkeleton() {
  return (
    <Stack gap={{ base: 6, md: 7 }}>
      <Stack gap={4}>
        <SectionHeadingSkeleton width="64px" showIcon={false} />
        <BillingSummarySkeleton />
        <BillingPlanCardsSkeleton />
      </Stack>
      <Stack gap={3}>
        <SectionHeadingSkeleton width="96px" showIcon={false} />
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            {Array.from({ length: 3 }, (_, index) => (
              <Flex key={index} align="center" gap={{ base: 2, md: 3 }} px={{ base: 3, md: 4 }} py={3}>
                <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
                <Skeleton h="20px" w={index === 2 ? "160px" : "112px"} maxW="50%" />
                <Skeleton h={{ base: "44px", md: "36px" }} w={{ base: "44px", md: "136px" }} ms="auto" />
              </Flex>
            ))}
          </Stack>
        </Box>
      </Stack>
    </Stack>
  );
}

function BillingSummarySkeleton() {
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <Grid
        templateColumns={{
          base: "repeat(2, minmax(0, 1fr))",
          lg: "minmax(180px, 1.2fr) minmax(150px, 1fr) minmax(180px, 1fr)",
        }}
      >
        <Stack gridColumn={{ base: "1 / -1", lg: "auto" }} gap={2} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
          <Skeleton h="18px" w="96px" />
          <Skeleton h={{ base: "28px", md: "32px" }} w="144px" />
          <Skeleton h="18px" w="216px" maxW="90%" />
        </Stack>
        {Array.from({ length: 2 }, (_, index) => (
          <Stack
            key={index}
            gap={2}
            px={{ base: 4, md: 5 }}
            py={{ base: 3, md: 5 }}
            borderTopWidth={{ base: "1px", lg: 0 }}
            borderLeftWidth={index === 1 ? "1px" : { base: 0, lg: "1px" }}
            borderRightWidth={index === 0 ? { base: "1px", lg: 0 } : 0}
            borderColor="blackAlpha.100"
          >
            <Skeleton h="18px" w="64px" />
            <Skeleton h="20px" w={index === 0 ? "88px" : "112px"} maxW="90%" />
          </Stack>
        ))}
      </Grid>
    </Box>
  );
}

function BillingPlanCardsSkeleton() {
  return (
    <Grid templateColumns={{ base: "1fr", md: "repeat(3, minmax(0, 1fr))" }} gap={3}>
      {Array.from({ length: 3 }, (_, index) => (
        <Stack
          key={index}
          minH="184px"
          borderWidth="1px"
          borderColor="blackAlpha.100"
          borderRadius="xl"
          bg="white"
          p={4}
          gap={3}
        >
          <HStack justify="space-between" gap={2}>
            <Skeleton h="24px" w={index === 0 ? "48px" : "80px"} />
            {index === 1 && <Skeleton h="20px" w="56px" borderRadius="full" />}
          </HStack>
          <Skeleton h="28px" w="104px" />
          <Stack gap={1}>
            <Skeleton h="18px" w="120px" />
            <Skeleton h="18px" w="104px" />
            <Skeleton h="18px" w="112px" />
          </Stack>
          {index !== 1 && <Skeleton h="40px" w="full" mt="auto" borderRadius="md" />}
        </Stack>
      ))}
    </Grid>
  );
}

function SettingsTabSkeleton({ showOrganizationCreation }: { showOrganizationCreation: boolean }) {
  return (
    <Stack gap={{ base: 5, md: 6 }}>
      {showOrganizationCreation && (
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" p={{ base: 4, md: 5 }}>
          <Stack gap={4}>
            <Stack gap={1}>
              <Skeleton h="24px" w="128px" />
              <Skeleton h="18px" w="92%" />
              <Skeleton h="18px" w="88%" />
              <Skeleton h="18px" w="72%" />
            </Stack>
            <Stack align="flex-end">
              <Skeleton h="40px" w="160px" borderRadius="md" />
            </Stack>
          </Stack>
        </Box>
      )}
      <DeletionActionSectionSkeleton
        titleWidth="224px"
        titleTrailingWidth="64px"
        descriptionLines={2}
        actionWidth="104px"
      />
    </Stack>
  );
}
