import { Stack, Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";

export type ActionInboxConfirmation =
  | {
      kind: "rejectRegistration";
      itemId: string;
      applicantName: string;
    }
  | {
      kind: "resolveNotification";
      itemId: string;
      staffName: string;
      notificationKindLabel: string;
    }
  | {
      kind: "revokeInvitation";
      itemId: string;
      inviteeName: string;
    }
  | null;

export function ActionInboxConfirmationDialog({
  confirmation,
  errorMessage,
  isRunning,
  onClose,
  onConfirm,
  finalFocusEl,
}: {
  confirmation: ActionInboxConfirmation;
  errorMessage: string | null;
  isRunning: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  finalFocusEl?: () => HTMLElement | null;
}) {
  if (!confirmation) return null;
  const copy = getCopy(confirmation);

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
      submitColorPalette="red"
      isLoading={isRunning}
      preventClose={isRunning}
      finalFocusEl={finalFocusEl}
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <Stack gap={2} fontSize="sm" color="fg.muted" lineHeight="tall">
        <Text fontWeight="semibold" color="gray.900">
          {copy.subject}
        </Text>
        <Text whiteSpace="pre-line">{copy.description}</Text>
        <Text color="red.700" fontWeight="semibold">
          この操作はもとに戻せません。
        </Text>
        {errorMessage && (
          <Text role="alert" color="red.700">
            {errorMessage}
          </Text>
        )}
      </Stack>
    </Dialog>
  );
}

function getCopy(confirmation: Exclude<ActionInboxConfirmation, null>) {
  if (confirmation.kind === "rejectRegistration") {
    return {
      title: "スタッフ登録申請を却下しますか？",
      subject: `${confirmation.applicantName}さんの申請を却下します。`,
      description: "却下してもスタッフには通知されません。必要な場合は担当者から直接案内してください。",
      submitLabel: "この申請を却下",
    };
  }
  if (confirmation.kind === "resolveNotification") {
    return {
      title: "送れなかった通知を再送せず破棄しますか？",
      subject: `${confirmation.staffName}さんへの${confirmation.notificationKindLabel}を一覧から外します。`,
      description: "この通知は一覧から外れ、再送されません。",
      submitLabel: "再送せず破棄する",
    };
  }
  return {
    title: "管理者招待を取り消しますか？",
    subject: `${confirmation.inviteeName}さんへの管理者招待を取り消します。`,
    description: "招待URLは使えなくなり、招待用に確保していた管理者枠が空きます。",
    submitLabel: "招待を取り消す",
  };
}
