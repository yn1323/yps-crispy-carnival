import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { LuPlus, LuUserRound } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import type { UserDetailData, UserDetailDialog, UserDetailPanel, UserDetailRecruitment } from "./types";
import { UserInformationDialog } from "./UserInformationDialog";
import { UserGroupRemovalSection } from "./UserSettingsTab";
import { UserShopAdditionDialog } from "./UserShopAdditionDialog";
import { UserShopDetailDialog } from "./UserShopDetailDialog";
import { UserShopMembershipList } from "./UserShopMembershipList";
import { UserSummary } from "./UserSummary";

export type UserDetailViewProps = {
  data: UserDetailData;
  selectedShopId: string | null;
  activePanel?: UserDetailPanel;
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
      addingShopId: Id<"shops"> | null;
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
    onOpenBasic: () => void;
    onOpenAddShop: () => void;
    onOpenShop: (shopId: string) => void;
    onClosePanel: () => void;
    onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
    onSendRecruitments: () => void | Promise<void>;
    onSendCurrentShift: () => void | Promise<void>;
    onShowLineQr: () => void | Promise<void>;
    onSendLineInvite: () => void | Promise<void>;
    onChangeShiftTarget: (isShiftTarget: boolean) => void | Promise<void>;
    onAddMembership: (shopId: Id<"shops">) => void | Promise<void>;
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
  activePanel,
  notificationHistory,
  state,
  actions,
}: UserDetailViewProps) {
  const selectedMembership = data.memberships.find((membership) => membership.shopId === selectedShopId) ?? null;
  const isStoreReadOnly = !data.canWrite || selectedMembership?.shopStatus !== "active";
  const storeDisabledReason = selectedMembership
    ? getStoreDisabledReason(data, selectedMembership.shopStatus)
    : data.writeDisabledReason;
  const handleDialogOpenChange = ({ open }: { open: boolean }) => {
    if (!open) actions.onClosePanel();
  };

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader title="ユーザー詳細" onBack={actions.onBack} />

      <UserSummary data={data} />

      {!data.canWrite && (
        <ReadOnlyNotice
          title="グループ情報は閲覧のみです"
          description={data.writeDisabledReason ?? "現在、このグループの情報を変更できません。"}
        />
      )}

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <DrilldownRow
          ariaLabel="基本情報を開く"
          title="基本情報"
          leading={<BasicInformationIcon />}
          secondary={
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              名前・メールアドレス・権限を管理します
            </Text>
          }
          onClick={actions.onOpenBasic}
        />
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" justify="space-between" gap={3} px={{ base: 4, md: 5 }} py={4}>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            所属店舗
          </Text>
          <Button
            type="button"
            variant="outline"
            size="sm"
            gap={1.5}
            disabled={!data.canWrite || state.membership.isAdding}
            onClick={actions.onOpenAddShop}
          >
            <LuPlus aria-hidden />
            店舗を追加
          </Button>
        </Flex>
        <Box p={{ base: 3, md: 4 }}>
          <UserShopMembershipList data={data} onOpenShop={actions.onOpenShop} />
        </Box>
      </Box>

      <UserGroupRemovalSection
        personName={data.person.name}
        isDisabled={data.shops.length === 0 || (!data.canWrite && !data.canRemove)}
        disabledReason={
          data.shops.length === 0
            ? "操作できる店舗がないため、このユーザーを削除できません。"
            : data.removeDisabledReason
        }
        isConfirmationOpen={state.manager.dialog?.kind === "removePerson"}
        isRemoving={state.manager.isRemoving}
        onRequestRemovePerson={actions.onRequestRemovePerson}
        onCancelRemovePerson={actions.onCloseManagerDialog}
        onConfirmRemovePerson={actions.onConfirmManagerSetting}
      />

      <UserInformationDialog
        data={data}
        isOpen={activePanel === "basic"}
        isUpdatingProfile={state.isUpdatingProfile}
        managerDialog={state.manager.dialog}
        isManagerAssignmentConfirmationOpen={state.manager.isAssignmentConfirmationOpen}
        isAssigningManager={state.manager.isAssigning}
        isRemovingManagerSetting={state.manager.isRemoving}
        onOpenChange={handleDialogOpenChange}
        onClose={actions.onClosePanel}
        onUpdateProfile={actions.onUpdateProfile}
        onRequestManagerAssignment={actions.onRequestManagerAssignment}
        onCancelManagerAssignment={actions.onCancelManagerAssignment}
        onAssignManager={actions.onAssignManager}
        onRequestRemoveManagerRole={actions.onRequestRemoveManagerRole}
        onConfirmManagerSetting={actions.onConfirmManagerSetting}
        onCancelManagerSetting={actions.onCloseManagerDialog}
      />

      <UserShopAdditionDialog
        data={data}
        isOpen={activePanel === "addShop"}
        addingShopId={state.membership.addingShopId}
        isAdding={state.membership.isAdding}
        onOpenChange={handleDialogOpenChange}
        onClose={actions.onClosePanel}
        onAddShop={actions.onAddMembership}
      />

      <UserShopDetailDialog
        data={data}
        membership={selectedMembership}
        isOpen={activePanel === "shop"}
        isStoreReadOnly={isStoreReadOnly}
        storeDisabledReason={storeDisabledReason}
        notificationHistory={notificationHistory}
        notification={state.notification}
        line={state.line}
        membershipState={{
          isChangingShiftTarget: state.membership.isChangingShiftTarget,
          isRemovalConfirmationOpen:
            state.membership.dialog?.kind === "removeMembership" &&
            state.membership.dialog.membership.staffId === selectedMembership?.staffId,
          isRemoving: state.membership.isRemoving,
        }}
        onOpenChange={handleDialogOpenChange}
        onClose={actions.onClosePanel}
        onSendRecruitments={actions.onSendRecruitments}
        onSendCurrentShift={actions.onSendCurrentShift}
        onShowLineQr={actions.onShowLineQr}
        onSendLineInvite={actions.onSendLineInvite}
        onChangeShiftTarget={actions.onChangeShiftTarget}
        onRequestRemoveMembership={actions.onRequestRemoveMembership}
        onCancelRemoveMembership={actions.onCloseMembershipDialog}
        onConfirmRemoveMembership={actions.onConfirmRemoveMembership}
      />
    </Stack>
  );
}

function BasicInformationIcon() {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="teal.50"
      color="teal.700"
      align="center"
      justify="center"
      fontSize="lg"
      flexShrink={0}
      aria-hidden
    >
      <LuUserRound />
    </Flex>
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
