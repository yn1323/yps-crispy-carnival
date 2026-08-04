import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { LuPlus, LuUserRound } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import type { UserDetailData, UserDetailDialog, UserDetailPanel } from "./types";
import { UserInformationDialog } from "./UserInformationDialog";
import { UserGroupRemovalSection } from "./UserSettingsTab";
import { UserShopAdditionDialog } from "./UserShopAdditionDialog";
import { UserShopMembershipList } from "./UserShopMembershipList";
import { UserSummary } from "./UserSummary";

export type UserDetailViewProps = {
  data: UserDetailData;
  showShopMembershipAddition: boolean;
  activePanel?: UserDetailPanel;
  state: {
    isUpdatingProfile: boolean;
    membership: {
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
    onAddMembership: (shopId: Id<"shops">) => void | Promise<void>;
    onRequestManagerAssignment: () => void;
    onCancelManagerAssignment: () => void;
    onAssignManager: () => void | Promise<void>;
    onRequestRemoveManagerRole: () => void;
    onRequestRemovePerson: () => void;
    onConfirmManagerSetting: () => void | Promise<void>;
    onCloseManagerDialog: () => void;
  };
};

export function UserDetailView({ data, showShopMembershipAddition, activePanel, state, actions }: UserDetailViewProps) {
  const handleDialogOpenChange = ({ open }: { open: boolean }) => {
    if (!open) actions.onClosePanel();
  };

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader title="スタッフ詳細" onBack={actions.onBack} />

      <UserSummary data={data} />

      {!data.canWrite && (
        <ReadOnlyNotice
          title={data.canRemove ? "利用上限の整理のみ行えます" : "グループ情報は閲覧のみです"}
          description={
            data.canRemove
              ? "契約制限中のため、通常の設定変更はできません。\n制限の解消に必要なユーザー削除は、この画面から行えます。"
              : (data.writeDisabledReason ?? "現在、このグループの情報を変更できません。")
          }
        />
      )}

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <DrilldownRow
          ariaLabel="スタッフ情報を開く"
          title="スタッフ情報"
          leading={<BasicInformationIcon />}
          secondary={
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              {data.managerInvitationState.kind === "hidden"
                ? "名前・シフト連絡先を管理します"
                : "名前・シフト連絡先・権限を管理します"}
            </Text>
          }
          onClick={actions.onOpenBasic}
        />
      </Box>

      <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
        <Flex align="center" justify="space-between" gap={3} px={{ base: 4, md: 5 }} pt={4} pb={0}>
          <Text as="h2" fontSize="md" fontWeight="semibold" color="gray.900">
            {data.person.name}の所属店舗
          </Text>
          {showShopMembershipAddition && (
            <Button
              type="button"
              variant="ghost"
              colorPalette="teal"
              size="sm"
              gap={1.5}
              fontWeight="semibold"
              disabled={!data.canWrite || state.membership.isAdding}
              onClick={actions.onOpenAddShop}
            >
              <LuPlus aria-hidden />
              店舗を追加
            </Button>
          )}
        </Flex>
        <Box p={{ base: 3, md: 4 }}>
          <UserShopMembershipList
            data={data}
            showShopMembershipAddition={showShopMembershipAddition}
            onOpenShop={actions.onOpenShop}
          />
        </Box>
      </Box>

      <UserGroupRemovalSection
        personName={data.person.name}
        isDisabled={data.shops.length === 0 || !data.canRemove}
        disabledReason={
          data.shops.length === 0
            ? "操作できる店舗がないため、このユーザーを削除できません。"
            : data.removeDisabledReason
        }
        removalPreview={
          state.manager.dialog?.kind === "removePerson" ? state.manager.dialog.removalPreview : data.removalPreview
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

      {showShopMembershipAddition && (
        <UserShopAdditionDialog
          data={data}
          isOpen={activePanel === "addShop"}
          addingShopId={state.membership.addingShopId}
          isAdding={state.membership.isAdding}
          onOpenChange={handleDialogOpenChange}
          onClose={actions.onClosePanel}
          onAddShop={actions.onAddMembership}
        />
      )}
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
