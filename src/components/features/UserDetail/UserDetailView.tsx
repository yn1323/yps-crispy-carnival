import { Badge, Box, Flex, Stack, Text } from "@chakra-ui/react";
import { LuMessageCircle, LuPencil, LuUserRound } from "react-icons/lu";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { ReadOnlyNotice } from "@/src/components/shared/ReadOnlyNotice";
import { Button } from "@/src/components/ui/Button";
import { DetailPageHeader } from "@/src/components/ui/DetailPageHeader";
import { DrilldownRow } from "@/src/components/ui/DrilldownRow";
import type { UserDetailData, UserDetailDialog, UserDetailPanel, UserMembershipChangeInput } from "./types";
import { UserInformationDialog } from "./UserInformationDialog";
import { getLineStatusPresentation, UserLineConnectionDialog } from "./UserLineConnectionDialog";
import { UserGroupRemovalSection } from "./UserSettingsTab";
import { UserShopMembershipDialog } from "./UserShopMembershipDialog";
import { UserShopMembershipList } from "./UserShopMembershipList";
import { UserSummary } from "./UserSummary";

export type UserDetailViewProps = {
  data: UserDetailData;
  showShopMembershipAddition: boolean;
  managerSettingsDisabledReason?: string;
  activePanel?: UserDetailPanel;
  state: {
    isUpdatingProfile: boolean;
    line: {
      authorizeUrl: string | null;
      showQr: boolean;
      isQrLoading: boolean;
      isSendingInvite: boolean;
      isDisconnecting: boolean;
    };
    membership: {
      isChanging: boolean;
    };
    removal: {
      dialog: UserDetailDialog;
      isRemoving: boolean;
    };
  };
  actions: {
    onBack: () => void;
    onOpenBasic: () => void;
    onOpenLine: () => void;
    onOpenAddShop: () => void;
    onOpenShop: (shopId: string) => void;
    onClosePanel: () => void;
    onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
    onShowLineQr: () => Promise<unknown>;
    onSendLineInvite: () => Promise<unknown>;
    onDisconnectLine: (requestId: string) => Promise<boolean | undefined>;
    onChangeMemberships: (input: UserMembershipChangeInput) => void | Promise<void>;
    onManageManagers: () => void;
    onRequestRemovePerson: () => void;
    onConfirmRemovePerson: () => void | Promise<void>;
    onCloseRemovalDialog: () => void;
  };
};

export function UserDetailView({
  data,
  showShopMembershipAddition,
  managerSettingsDisabledReason,
  activePanel,
  state,
  actions,
}: UserDetailViewProps) {
  const handleDialogOpenChange = ({ open }: { open: boolean }) => {
    if (!open) actions.onClosePanel();
  };

  return (
    <Stack gap={{ base: 4, md: 6 }}>
      <DetailPageHeader title="スタッフ詳細" icon={LuUserRound} onBack={actions.onBack} />

      <UserSummary data={data} />

      {!data.canWrite && (
        <ReadOnlyNotice
          title={data.canRemove ? "利用上限の整理のみ行えます" : "組織情報は閲覧のみです"}
          description={
            data.canRemove
              ? "契約制限中のため、通常の設定変更はできません。\n制限の解消に必要なユーザー削除は、この画面から行えます。"
              : (data.writeDisabledReason ?? "現在、この組織の情報を変更できません。")
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
              名前・シフト連絡先を管理します
            </Text>
          }
          onClick={actions.onOpenBasic}
        />
      </Box>

      <UserLineConnectionRow data={data} onOpen={actions.onOpenLine} />

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
              disabled={!data.canWrite || state.membership.isChanging}
              onClick={actions.onOpenAddShop}
            >
              <LuPencil aria-hidden />
              所属店舗を変更する
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
          state.removal.dialog?.kind === "removePerson" ? state.removal.dialog.removalPreview : data.removalPreview
        }
        isConfirmationOpen={state.removal.dialog?.kind === "removePerson"}
        isRemoving={state.removal.isRemoving}
        onRequestRemovePerson={actions.onRequestRemovePerson}
        onCancelRemovePerson={actions.onCloseRemovalDialog}
        onConfirmRemovePerson={actions.onConfirmRemovePerson}
      />

      <UserInformationDialog
        data={data}
        isOpen={activePanel === "basic"}
        isUpdatingProfile={state.isUpdatingProfile}
        onOpenChange={handleDialogOpenChange}
        onClose={actions.onClosePanel}
        onUpdateProfile={actions.onUpdateProfile}
        onManageManagers={actions.onManageManagers}
        managerSettingsDisabledReason={managerSettingsDisabledReason}
      />

      <UserLineConnectionDialog
        data={data}
        isOpen={activePanel === "line"}
        authorizeUrl={state.line.authorizeUrl}
        showQr={state.line.showQr}
        isQrLoading={state.line.isQrLoading}
        isSendingInvite={state.line.isSendingInvite}
        isDisconnecting={state.line.isDisconnecting}
        onClose={actions.onClosePanel}
        onShowQr={actions.onShowLineQr}
        onSendInvite={actions.onSendLineInvite}
        onDisconnect={actions.onDisconnectLine}
      />

      {showShopMembershipAddition && (
        <UserShopMembershipDialog
          data={data}
          isOpen={activePanel === "addShop"}
          isChanging={state.membership.isChanging}
          onOpenChange={handleDialogOpenChange}
          onClose={actions.onClosePanel}
          onChangeMemberships={actions.onChangeMemberships}
        />
      )}
    </Stack>
  );
}

function UserLineConnectionRow({ data, onOpen }: { data: UserDetailData; onOpen: () => void }) {
  const presentation = getLineStatusPresentation(data.line.status);
  return (
    <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white" overflow="hidden">
      <DrilldownRow
        ariaLabel="LINE連携を開く"
        title="LINE連携"
        leading={<LineConnectionIcon />}
        badges={
          <Badge
            colorPalette={presentation.badgeColorPalette}
            variant="subtle"
            borderRadius="full"
            px={2}
            textStyle="2xs"
          >
            {presentation.label}
          </Badge>
        }
        secondary={
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            同じ組織の所属店舗で共通です
          </Text>
        }
        accessibleDescription={`${presentation.description} 同じ組織の所属店舗で共通です。`}
        onClick={onOpen}
      />
    </Box>
  );
}

function BasicInformationIcon() {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="teal.100"
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

function LineConnectionIcon() {
  return (
    <Flex
      boxSize="40px"
      borderRadius="full"
      bg="green.100"
      color="green.700"
      align="center"
      justify="center"
      fontSize="lg"
      flexShrink={0}
      aria-hidden
    >
      <LuMessageCircle />
    </Flex>
  );
}
