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
  onBackGuardRemoved?: () => void;
  onSubmit: () => void;
};

export function OrganizationDeletionDialog({ dialog, isRunning, onClose, onBackGuardRemoved, onSubmit }: Props) {
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
      onBackGuardRemoved={onBackGuardRemoved}
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
            <Text>
              グループとすべての店舗を利用できない状態にし、管理権限、LINE連携、提出・閲覧用リンクを停止します。
            </Text>
            <Text>
              グループ名、店舗名、氏名、メールアドレス、過去のシフト・同意・請求などの履歴は、業務記録として残ります。
            </Text>
            <Text>ほかのグループへの所属と、シフトリへのログインに使うアカウントは削除しません。</Text>
            <Text>ほかに所属がない場合は、削除後に新しい店舗を登録できます。</Text>
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
