import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailDialog } from "./types";

type Props = {
  data: UserDetailData;
  membershipDialog: UserDetailDialog;
  managerDialog: UserDetailDialog;
  isRemovingMembership: boolean;
  isRemovingManagerSetting: boolean;
  onCloseMembershipDialog: () => void;
  onCloseManagerDialog: () => void;
  onConfirmRemoveMembership: () => void | Promise<void>;
  onConfirmManagerSetting: () => void | Promise<void>;
};

export function UserDetailDialogs({
  data,
  membershipDialog,
  managerDialog,
  isRemovingMembership,
  isRemovingManagerSetting,
  onCloseMembershipDialog,
  onCloseManagerDialog,
  onConfirmRemoveMembership,
  onConfirmManagerSetting,
}: Props) {
  const membership = membershipDialog?.kind === "removeMembership" ? membershipDialog.membership : null;

  return (
    <>
      {membership && (
        <Dialog
          title={`${membership.shopName}から外す`}
          isOpen
          onOpenChange={({ open }) => {
            if (!open) onCloseMembershipDialog();
          }}
          onClose={onCloseMembershipDialog}
          onSubmit={onConfirmRemoveMembership}
          submitLabel="この店舗から外す"
          submitColorPalette="red"
          isLoading={isRemovingMembership}
          role="alertdialog"
          maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
        >
          <Stack gap={3}>
            <Text fontWeight="bold">{data.person.name}</Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              この店舗のスタッフ所属、既存のシフト用リンク、LINE連携を終了します。
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              グループのユーザー情報、ほかの店舗所属、管理者権限は変更しません。将来のシフトに割り当てられている場合は削除できません。
            </Text>
          </Stack>
        </Dialog>
      )}

      {managerDialog?.kind === "removeManagerRole" && (
        <Dialog
          title="管理者権限を外す"
          isOpen
          onOpenChange={({ open }) => {
            if (!open) onCloseManagerDialog();
          }}
          onClose={onCloseManagerDialog}
          onSubmit={onConfirmManagerSetting}
          submitLabel="管理者権限を外す"
          submitColorPalette={data.memberships.length === 0 ? "red" : "teal"}
          isLoading={isRemovingManagerSetting}
          role="alertdialog"
          maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
        >
          <Stack gap={3}>
            <Text fontWeight="bold">{data.person.name}</Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              {data.memberships.length > 0
                ? "グループ全体の管理権限を終了します。スタッフとしての店舗所属は維持します。"
                : "店舗所属がないため、管理者権限を外すと、このグループへのアクセスも終了します。"}
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              このユーザーが発行した未連携のログイン案内は無効になります。
            </Text>
          </Stack>
        </Dialog>
      )}

      {managerDialog?.kind === "removePerson" && (
        <Dialog
          title="グループからユーザーを削除"
          isOpen
          onOpenChange={({ open }) => {
            if (!open) onCloseManagerDialog();
          }}
          onClose={onCloseManagerDialog}
          onSubmit={onConfirmManagerSetting}
          submitLabel="グループから削除"
          submitColorPalette="red"
          isLoading={isRemovingManagerSetting}
          role="alertdialog"
          maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
        >
          <Stack gap={3}>
            <Text fontWeight="bold">{data.person.name}</Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              このグループのすべての店舗所属、管理権限、スタッフ権限、閲覧権限を終了します。ほかのグループへの所属には影響しません。
            </Text>
            <Text fontSize="sm" color="fg.muted" lineHeight="tall">
              過去のシフト履歴は保持します。この操作は元に戻せません。
            </Text>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
