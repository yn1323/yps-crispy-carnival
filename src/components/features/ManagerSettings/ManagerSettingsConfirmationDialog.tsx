import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import type { ManagerSettingsConfirmation } from "./types";

type Props = {
  confirmation: ManagerSettingsConfirmation;
  isRunning: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ManagerSettingsConfirmationDialog({ confirmation, isRunning, onClose, onConfirm }: Props) {
  if (!confirmation) return null;

  const copy = getConfirmationCopy(confirmation);
  return (
    <Dialog
      title={copy.title}
      role="alertdialog"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      onSubmit={onConfirm}
      closeLabel="やめる"
      submitLabel={copy.submitLabel}
      submitColorPalette={confirmation.kind === "resend" ? "teal" : "red"}
      isLoading={isRunning}
      preventClose={isRunning}
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <Stack gap={2} fontSize="sm" color="fg.muted" lineHeight="tall">
        <Text fontWeight="semibold" color="gray.900">
          {copy.subject}
        </Text>
        <Text whiteSpace="pre-line">{copy.description}</Text>
        {confirmation.kind !== "resend" && (
          <Text color="red.700" fontWeight="semibold">
            この操作はもとに戻せません。
          </Text>
        )}
      </Stack>
    </Dialog>
  );
}

function getConfirmationCopy(confirmation: Exclude<ManagerSettingsConfirmation, null>) {
  if (confirmation.kind === "resend") {
    return {
      title: "管理者招待を再送しますか？",
      subject: `${confirmation.invitation.name}さんへ新しい案内を送ります。`,
      description: `${confirmation.invitation.invitedEmail}へ管理者招待を再送します。\n以前の招待URLは使えなくなります。`,
      submitLabel: "招待を再送する",
    };
  }
  if (confirmation.kind === "revoke") {
    return {
      title: "管理者招待を取り消しますか？",
      subject: `${confirmation.invitation.name}さんへの招待を取り消します。`,
      description: "招待URLは使えなくなり、招待用に確保していた管理者枠が空きます。",
      submitLabel: "招待を取り消す",
    };
  }
  return {
    title: `${confirmation.manager.name}さんの管理者権限を外しますか？`,
    subject: `${confirmation.manager.name}さんの組織全体に対する管理権限を外します。`,
    description: `${
      confirmation.manager.isSelf ? "この操作後、あなたはこの組織へアクセスできなくなります。\n" : ""
    }人物情報とスタッフとしての店舗所属は残ります。\nこの管理者が発行した未承認の管理者招待は取り消されます。`,
    submitLabel: "管理者権限を外す",
  };
}
