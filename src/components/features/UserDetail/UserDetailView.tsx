import { Alert, Badge, Box, HStack, Icon, Menu, Portal, Stack, Tabs, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuCheck, LuChevronDown, LuChevronLeft } from "react-icons/lu";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Button, IconButton } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailDialog, UserDetailRecruitment, UserDetailTab } from "./types";
import { UserDetailDialogs } from "./UserDetailDialogs";
import { UserInformationTab } from "./UserInformationTab";
import { UserLineTab } from "./UserLineTab";
import { UserNotificationTab } from "./UserNotificationTab";
import { UserGroupRemovalSection, UserManagerSettings, UserSettingsTab } from "./UserSettingsTab";
import { UserSummary } from "./UserSummary";

export type UserDetailViewProps = {
  data: UserDetailData;
  selectedShopId: string | null;
  activeTab: UserDetailTab;
  notificationHistory: ReactNode;
  state: {
    isUpdatingProfile: boolean;
    notification: {
      isLoading: boolean;
      openRecruitments: UserDetailRecruitment[];
      currentRecruitments: UserDetailRecruitment[];
      isSendingRecruitments: boolean;
      isSendingCurrentShift: boolean;
    };
    line: {
      authorizeUrl: string | null;
      showQr: boolean;
      isQrLoading: boolean;
      isSendingInvite: boolean;
    };
    membership: {
      dialog: UserDetailDialog;
      isChangingShiftTarget: boolean;
      isRemoving: boolean;
      isAdding: boolean;
    };
    manager: {
      dialog: UserDetailDialog;
      isAssignmentConfirmationOpen: boolean;
      isAssigning: boolean;
      isRemoving: boolean;
    };
  };
  actions: {
    onBack: () => void;
    onSelectShop: (shopId: string) => void;
    onTabChange: (tab: UserDetailTab) => void;
    onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
    onSendRecruitments: () => void | Promise<void>;
    onSendCurrentShift: () => void | Promise<void>;
    onShowLineQr: () => void | Promise<void>;
    onSendLineInvite: () => void | Promise<void>;
    onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
    onAddMembership: () => void | Promise<void>;
    onRequestRemoveMembership: () => void;
    onConfirmRemoveMembership: () => void | Promise<void>;
    onCloseMembershipDialog: () => void;
    onRequestManagerAssignment: () => void;
    onCancelManagerAssignment: () => void;
    onAssignManager: () => void | Promise<void>;
    onRequestRemoveManagerRole: () => void;
    onRequestRemovePerson: () => void;
    onConfirmManagerSetting: () => void | Promise<void>;
    onCloseManagerDialog: () => void;
  };
};

export function UserDetailView({
  data,
  selectedShopId,
  activeTab,
  notificationHistory,
  state,
  actions,
}: UserDetailViewProps) {
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const selectedShop = data.shops.find((shop) => shop.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || Boolean(selectedShop && selectedShop.shopStatus !== "active");
  const storeDisabledReason = selectedMembership
    ? getStoreDisabledReason(data, selectedMembership.shopStatus)
    : data.writeDisabledReason;

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <HStack gap={2} minW={0}>
        <IconButton aria-label="前の画面に戻る" variant="ghost" size="sm" onClick={actions.onBack}>
          <LuChevronLeft aria-hidden />
        </IconButton>
        <Text as="h1" textStyle={{ base: "sectionTitle", md: "pageTitle" }} color="gray.900">
          ユーザー詳細
        </Text>
      </HStack>

      <UserSummary data={data} />

      {!data.canWrite && (
        <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
          <Alert.Indicator mt={1} />
          <Alert.Content>
            <Alert.Title>グループ情報は閲覧のみです</Alert.Title>
            <Alert.Description>
              {data.writeDisabledReason ?? "現在、このグループの情報を変更できません。"}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {selectedShop && selectedShop.shopStatus !== "active" && (
        <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
          <Alert.Indicator mt={1} />
          <Alert.Content>
            <Alert.Title>{selectedShop.shopName}は閲覧のみです</Alert.Title>
            <Alert.Description>{getShopStatusDescription(selectedShop.shopStatus)}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <UserInformationTab
        data={data}
        isReadOnly={!data.canWrite}
        isUpdating={state.isUpdatingProfile}
        managerSettings={
          <UserManagerSettings
            data={data}
            isAssignmentConfirmationOpen={state.manager.isAssignmentConfirmationOpen}
            isAssigningManager={state.manager.isAssigning}
            onRequestManagerAssignment={actions.onRequestManagerAssignment}
            onCancelManagerAssignment={actions.onCancelManagerAssignment}
            onAssignManager={actions.onAssignManager}
            onRequestRemoveManagerRole={actions.onRequestRemoveManagerRole}
          />
        }
        onUpdate={actions.onUpdateProfile}
      />

      <Stack gap={3}>
        <Text
          as="h2"
          fontSize={{ base: "lg", lg: "xl" }}
          lineHeight={{ base: "1.75rem", lg: "1.875rem" }}
          fontWeight="bold"
          color="gray.900"
        >
          店舗設定
        </Text>
        <UserDetailShopSelector data={data} selectedShopId={selectedShopId} onSelect={actions.onSelectShop} />
      </Stack>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Tabs.Root
          value={activeTab}
          colorPalette="teal"
          variant="outline"
          onValueChange={({ value }) => actions.onTabChange(value as UserDetailTab)}
        >
          <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" px={{ base: 3, md: 5 }}>
            <Tabs.Trigger value="notification" flexShrink={0}>
              通知
            </Tabs.Trigger>
            <Tabs.Trigger value="line" flexShrink={0}>
              LINE連携
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" flexShrink={0}>
              店舗設定
            </Tabs.Trigger>
          </Tabs.List>

          <Box p={{ base: 4, md: 6 }}>
            <Tabs.Content value="notification" p={0}>
              {!selectedMembership ? (
                <UnregisteredStore
                  data={data}
                  shopName={selectedShop?.shopName}
                  isAdding={state.membership.isAdding}
                  isReadOnly={isStoreReadOnly}
                  onAdd={actions.onAddMembership}
                />
              ) : (
                <UserNotificationTab
                  data={data}
                  membership={selectedMembership}
                  isReadOnly={isStoreReadOnly}
                  isLoading={state.notification.isLoading}
                  openRecruitments={state.notification.openRecruitments}
                  currentRecruitments={state.notification.currentRecruitments}
                  notificationHistory={notificationHistory}
                  sendRecruitmentsAction={{
                    isDisabled:
                      isStoreReadOnly ||
                      state.notification.isSendingRecruitments ||
                      state.notification.isSendingCurrentShift,
                    isLoading: state.notification.isSendingRecruitments,
                    onAction: actions.onSendRecruitments,
                  }}
                  sendCurrentShiftAction={{
                    isDisabled:
                      isStoreReadOnly ||
                      state.notification.isSendingRecruitments ||
                      state.notification.isSendingCurrentShift,
                    isLoading: state.notification.isSendingCurrentShift,
                    onAction: actions.onSendCurrentShift,
                  }}
                  onSelectShop={actions.onSelectShop}
                />
              )}
            </Tabs.Content>

            <Tabs.Content value="line" p={0}>
              {!selectedMembership ? (
                <UnregisteredStore
                  data={data}
                  shopName={selectedShop?.shopName}
                  isAdding={state.membership.isAdding}
                  isReadOnly={isStoreReadOnly}
                  onAdd={actions.onAddMembership}
                />
              ) : (
                <UserLineTab
                  data={data}
                  membership={selectedMembership}
                  isReadOnly={isStoreReadOnly}
                  authorizeUrl={state.line.authorizeUrl}
                  showQr={state.line.showQr}
                  isQrLoading={state.line.isQrLoading}
                  isSendingInvite={state.line.isSendingInvite}
                  onShowQr={actions.onShowLineQr}
                  onSendInvite={actions.onSendLineInvite}
                  onSelectShop={actions.onSelectShop}
                />
              )}
            </Tabs.Content>

            <Tabs.Content value="settings" p={0}>
              {!selectedMembership ? (
                <UnregisteredStore
                  data={data}
                  shopName={selectedShop?.shopName}
                  isAdding={state.membership.isAdding}
                  isReadOnly={isStoreReadOnly}
                  onAdd={actions.onAddMembership}
                />
              ) : (
                <UserSettingsTab
                  membership={selectedMembership}
                  isStoreReadOnly={isStoreReadOnly}
                  storeDisabledReason={storeDisabledReason}
                  isChangingShiftTarget={state.membership.isChangingShiftTarget}
                  onChangeShiftTarget={actions.onChangeShiftTarget}
                  onRequestRemoveMembership={actions.onRequestRemoveMembership}
                />
              )}
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Box>

      <UserGroupRemovalSection data={data} onRequestRemovePerson={actions.onRequestRemovePerson} />

      <UserDetailDialogs
        data={data}
        membershipDialog={state.membership.dialog}
        managerDialog={state.manager.dialog}
        isRemovingMembership={state.membership.isRemoving}
        isRemovingManagerSetting={state.manager.isRemoving}
        onCloseMembershipDialog={actions.onCloseMembershipDialog}
        onCloseManagerDialog={actions.onCloseManagerDialog}
        onConfirmRemoveMembership={actions.onConfirmRemoveMembership}
        onConfirmManagerSetting={actions.onConfirmManagerSetting}
      />
    </Stack>
  );
}

function UserDetailShopSelector({
  data,
  selectedShopId,
  onSelect,
}: {
  data: UserDetailData;
  selectedShopId: string | null;
  onSelect: (shopId: string) => void;
}) {
  const selectedShop = data.shops.find((shop) => shop.shopId === selectedShopId) ?? null;

  return (
    <Menu.Root positioning={{ placement: "bottom-start", gutter: 8 }}>
      <Menu.Trigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={selectedShop ? `店舗を切り替える。現在は${selectedShop.shopName}` : "店舗を選択する"}
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          gap={3}
          w="full"
          minW={0}
          minH="44px"
          h="auto"
          px={3}
          py={2.5}
          borderColor="gray.300"
          borderRadius="lg"
          color="gray.900"
          cursor="pointer"
          _hover={{ bg: "gray.50", borderColor: "gray.400" }}
        >
          <HStack gap={2} minW={0} textAlign="left">
            <Text fontSize="sm" fontWeight="semibold" truncate minW={0}>
              {selectedShop?.shopName ?? "店舗を選択"}
            </Text>
            {selectedShop && <ShopStatusBadge shopStatus={selectedShop.shopStatus} />}
          </HStack>
          <Icon as={LuChevronDown} boxSize={4} color="gray.500" flexShrink={0} />
        </Button>
      </Menu.Trigger>

      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(360px, calc(100vw - 24px))" maxH="min(420px, calc(100dvh - 96px))" overflowY="auto">
            {data.shops.map((shop) => {
              const isSelected = shop.shopId === selectedShopId;
              return (
                <Menu.Item
                  key={shop.shopId}
                  value={`shop-${shop.shopId}`}
                  aria-current={isSelected ? "true" : undefined}
                  cursor="pointer"
                  px={3}
                  py={2.5}
                  onClick={() => onSelect(shop.shopId)}
                >
                  <HStack w="full" gap={2.5} minW={0}>
                    <Box w="18px" color="teal.600" flexShrink={0}>
                      {isSelected && <LuCheck aria-hidden />}
                    </Box>
                    <HStack gap={2} flex={1} minW={0}>
                      <Text fontSize="sm" fontWeight={isSelected ? "bold" : "medium"} truncate minW={0}>
                        {shop.shopName}
                      </Text>
                      <ShopStatusBadge shopStatus={shop.shopStatus} />
                    </HStack>
                  </HStack>
                </Menu.Item>
              );
            })}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function ShopStatusBadge({ shopStatus }: { shopStatus: UserDetailData["shops"][number]["shopStatus"] }) {
  if (shopStatus === "active") return null;
  return (
    <Badge colorPalette={shopStatus === "archived" ? "gray" : "orange"} variant="subtle" size="sm" flexShrink={0}>
      {shopStatus === "archived" ? "アーカイブ済み" : "プラン停止中"}
    </Badge>
  );
}

function UnregisteredStore({
  data,
  shopName,
  isAdding,
  isReadOnly,
  onAdd,
}: {
  data: UserDetailData;
  shopName?: string;
  isAdding: boolean;
  isReadOnly: boolean;
  onAdd: () => void | Promise<void>;
}) {
  if (!shopName) return <Text color="fg.muted">設定する店舗を選択してください。</Text>;
  return (
    <Stack gap={4} align="flex-start">
      <Stack gap={1}>
        <Text as="h3" fontWeight="semibold">
          この店舗には未登録です
        </Text>
        <Text fontSize="sm" color="fg.muted">
          {data.person.name}さんは、{shopName}にスタッフとして所属していません。
        </Text>
      </Stack>
      <Button
        colorPalette="teal"
        loading={isAdding}
        disabled={!data.canWrite || isReadOnly || isAdding}
        onClick={onAdd}
      >
        このユーザーを{shopName}に追加する
      </Button>
    </Stack>
  );
}

function getStoreDisabledReason(data: UserDetailData, shopStatus: UserDetailData["memberships"][number]["shopStatus"]) {
  if (!data.canWrite) return data.writeDisabledReason ?? "現在、このグループの情報を変更できません。";
  return shopStatus === "active" ? undefined : getShopStatusDescription(shopStatus);
}

function getShopStatusDescription(shopStatus: UserDetailData["memberships"][number]["shopStatus"]) {
  switch (shopStatus) {
    case "archived":
      return "アーカイブ済みの店舗では、通知送信やスタッフ設定を変更できません。";
    case "planSuspended":
      return "現在のプランでは停止中のため、通知送信やスタッフ設定を変更できません。";
    case "active":
      return "";
  }
}
