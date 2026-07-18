import { Field, Input, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Dialog } from "@/src/components/ui/Dialog";

export type OrganizationDeletionDialogState = {
  intentKey: string;
  organizationName: string;
};

type Props = {
  dialog: OrganizationDeletionDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function OrganizationDeletionDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  const [confirmationName, setConfirmationName] = useState("");
  const intentKey = dialog?.intentKey;
  useEffect(() => {
    if (intentKey) setConfirmationName("");
  }, [intentKey]);

  if (!dialog) return null;
  const isConfirmed = confirmationName === dialog.organizationName;

  return (
    <Dialog
      title="グループを削除"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      formId="organization-deletion-form"
      submitLabel="このグループを削除"
      submitColorPalette="red"
      isLoading={isRunning}
      isSubmitDisabled={!isConfirmed || isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "600px" }}
    >
      <form
        id="organization-deletion-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (isConfirmed && !isRunning) onSubmit();
        }}
      >
        <Stack gap={4}>
          <Text fontWeight="bold">この操作は元に戻せません。</Text>
          <Stack gap={2} fontSize="sm" color="fg" lineHeight="tall">
            <Text>グループとすべての店舗を利用できない状態にします。</Text>
            <Text>
              基本情報に保存したグループ名、店舗名、氏名、メールアドレス、LINE IDを削除済みの値へ置き換えます。
            </Text>
            <Text>ほかのグループに所属するユーザーと、Clerkのログインアカウントは削除しません。</Text>
            <Text>過去のシフト、同意、請求、監査、通知、登録申請、送信済みメールとLINEの記録は残ります。</Text>
          </Stack>
          <Field.Root required>
            <Field.Label>確認のため「{dialog.organizationName}」と入力してください</Field.Label>
            <Input
              value={confirmationName}
              autoFocus
              autoComplete="off"
              onChange={(event) => setConfirmationName(event.currentTarget.value)}
            />
          </Field.Root>
        </Stack>
      </form>
    </Dialog>
  );
}
