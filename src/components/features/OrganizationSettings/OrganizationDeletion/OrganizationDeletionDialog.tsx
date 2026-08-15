import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";

export type OrganizationDeletionDialogState = {
  organizationName: string;
};

type Props = {
  dialog: OrganizationDeletionDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onBackGuardRemoved?: () => void;
  onSubmit: () => void;
};

export function OrganizationDeletionDialog({ dialog, isRunning, onClose, onBackGuardRemoved, onSubmit }: Props) {
  if (!dialog) return null;

  return (
    <Dialog
      title="組織を削除"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      onBackGuardRemoved={onBackGuardRemoved}
      onSubmit={onSubmit}
      submitLabel="この組織を削除"
      submitColorPalette="red"
      isLoading={isRunning}
      role="alertdialog"
      mobileActionLayout="inline"
      mobileFullScreen
      maxW={{ base: "calc(100vw - 24px)", md: "600px" }}
    >
      <Stack gap={4}>
        <Text fontWeight="bold">この操作は元に戻せません。</Text>
        <Text fontWeight="semibold">対象: {dialog.organizationName}</Text>
        <Stack gap={2} fontSize="sm" color="fg" lineHeight="tall">
          <Text>組織とすべての店舗の利用を停止し、管理権限、LINE連携、提出・閲覧用リンクを無効にします。</Text>
          <Text>ほかの組織への所属と、シフトリへのログインに使うアカウントは削除しません。</Text>
          <Text>ほかの組織に所属していない場合は、削除後に新しい店舗を登録できます。</Text>
        </Stack>
      </Stack>
    </Dialog>
  );
}
