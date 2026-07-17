import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PersonRemovalDialogState } from "./types";

type Props = {
  dialog: PersonRemovalDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function PersonRemovalDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  if (!dialog) return null;
  const confirmation = confirmationFor(dialog);

  return (
    <Dialog
      title={confirmation.title}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel={confirmation.submitLabel}
      submitColorPalette={confirmation.destructive ? "red" : "teal"}
      isLoading={isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <Stack gap={3}>
        <Text fontWeight="bold">{dialog.person.name}</Text>
        {confirmation.messages.map((message) => (
          <Text key={message} fontSize="sm" color="fg.muted" lineHeight="tall">
            {message}
          </Text>
        ))}
      </Stack>
    </Dialog>
  );
}

function confirmationFor(dialog: PersonRemovalDialogState) {
  switch (dialog.kind) {
    case "removeManagerRole":
      return {
        title: "管理者権限を外す",
        messages: dialog.person.isStaff
          ? [
              "グループ全体の管理権限と契約操作の権限を終了します。スタッフとしての店舗所属と業務用アクセスは維持します。",
              "この人物が発行した未承認の管理者招待は無効になります。",
            ]
          : [
              "この人物にはスタッフ所属がないため、管理者権限を外すと、このグループへのアクセスも終了します。過去の履歴は保持します。",
              "将来のシフト割当や請求先メールアドレスを先に整理する必要がある場合は、操作を完了できません。",
            ],
        submitLabel: "管理者権限を外す",
        destructive: !dialog.person.isStaff,
      };
    case "removePerson":
      return {
        title: "グループから利用者を削除",
        messages: [
          "このグループのすべての店舗所属、管理権限、スタッフ権限、閲覧権限を終了します。ほかのグループへの所属には影響しません。",
          "過去のシフト履歴は保持します。将来のシフトに割り当てられている場合や、請求先メールアドレスの所有者である場合は削除できません。",
        ],
        submitLabel: "グループから削除",
        destructive: true,
      };
  }
}
