import { Alert, Box, HStack, Stack, Tabs, Text } from "@chakra-ui/react";
import { LuChevronLeft } from "react-icons/lu";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { IconButton } from "@/src/components/ui/Button";
import type { UserDetailData, UserDetailDialog, UserDetailRecruitment, UserDetailTab } from "./types";
import { UserDetailDialogs } from "./UserDetailDialogs";
import { UserInformationTab } from "./UserInformationTab";
import { UserLineTab } from "./UserLineTab";
import { UserNotificationTab } from "./UserNotificationTab";
import { UserSettingsTab } from "./UserSettingsTab";
import { UserSummary } from "./UserSummary";

export type UserDetailViewProps = {
  data: UserDetailData;
  selectedShopId: string | null;
  activeTab: UserDetailTab;
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
  state,
  actions,
}: UserDetailViewProps) {
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || Boolean(selectedMembership && selectedMembership.shopStatus !== "active");
  const storeDisabledReason = selectedMembership
    ? getStoreDisabledReason(data, selectedMembership.shopStatus)
    : data.writeDisabledReason;
  const isStoreTab = activeTab === "notification" || activeTab === "line" || activeTab === "settings";

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <HStack gap={2} minW={0}>
        <IconButton aria-label="前の画面に戻る" variant="ghost" size="sm" onClick={actions.onBack}>
          <LuChevronLeft aria-hidden />
        </IconButton>
        <Text as="h1" fontSize={{ base: "xl", md: "2xl" }} fontWeight="bold" color="gray.900">
          ユーザー詳細
        </Text>
      </HStack>

      <UserSummary data={data} selectedMembership={selectedMembership} onSelectShop={actions.onSelectShop} />

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

      {isStoreTab && selectedMembership && selectedMembership.shopStatus !== "active" && (
        <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
          <Alert.Indicator mt={1} />
          <Alert.Content>
            <Alert.Title>{selectedMembership.shopName}は閲覧のみです</Alert.Title>
            <Alert.Description>{getShopStatusDescription(selectedMembership.shopStatus)}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Tabs.Root
          value={activeTab}
          colorPalette="teal"
          variant="line"
          onValueChange={({ value }) => actions.onTabChange(value as UserDetailTab)}
        >
          <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" px={{ base: 3, md: 5 }}>
            <Tabs.Trigger value="information" flexShrink={0}>
              情報
            </Tabs.Trigger>
            <Tabs.Trigger value="notification" flexShrink={0}>
              通知
            </Tabs.Trigger>
            <Tabs.Trigger value="line" flexShrink={0}>
              LINE
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" flexShrink={0}>
              設定
            </Tabs.Trigger>
          </Tabs.List>

          <Box p={{ base: 4, md: 6 }}>
            <Tabs.Content value="information" p={0}>
              <UserInformationTab
                data={data}
                isReadOnly={!data.canWrite}
                isUpdating={state.isUpdatingProfile}
                onUpdate={async (formData) => {
                  await actions.onUpdateProfile(formData);
                }}
              />
            </Tabs.Content>

            <Tabs.Content value="notification" p={0}>
              <UserNotificationTab
                data={data}
                membership={selectedMembership}
                isReadOnly={isStoreReadOnly}
                isLoading={state.notification.isLoading}
                openRecruitments={state.notification.openRecruitments}
                currentRecruitments={state.notification.currentRecruitments}
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
            </Tabs.Content>

            <Tabs.Content value="line" p={0}>
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
            </Tabs.Content>

            <Tabs.Content value="settings" p={0}>
              <UserSettingsTab
                data={data}
                membership={selectedMembership}
                isStoreReadOnly={isStoreReadOnly}
                storeDisabledReason={storeDisabledReason}
                isAssignmentConfirmationOpen={state.manager.isAssignmentConfirmationOpen}
                isAssigningManager={state.manager.isAssigning}
                isChangingShiftTarget={state.membership.isChangingShiftTarget}
                onRequestManagerAssignment={actions.onRequestManagerAssignment}
                onCancelManagerAssignment={actions.onCancelManagerAssignment}
                onAssignManager={actions.onAssignManager}
                onRequestRemoveManagerRole={actions.onRequestRemoveManagerRole}
                onChangeShiftTarget={actions.onChangeShiftTarget}
                onRequestRemoveMembership={actions.onRequestRemoveMembership}
                onRequestRemovePerson={actions.onRequestRemovePerson}
              />
            </Tabs.Content>
          </Box>
        </Tabs.Root>
      </Box>

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
