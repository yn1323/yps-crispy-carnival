import { Stack, Text } from "@chakra-ui/react";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Dialog } from "@/src/components/ui/Dialog";
import type { ManagerInvitationIssueConfirmation } from "./types";

type Props = {
  confirmation: ManagerInvitationIssueConfirmation;
  isRunning: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ManagerIssueConfirmationDialog({ confirmation, isRunning, onClose, onConfirm }: Props) {
  if (!confirmation) return null;

  return (
    <Dialog
      title={
        confirmation.kind === "existingStaff"
          ? `${confirmation.candidate.name}さんを招待しますか？`
          : "新しい管理者を招待しますか？"
      }
      role="alertdialog"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      onSubmit={onConfirm}
      closeLabel="戻る"
      submitLabel="招待する"
      isLoading={isRunning}
      preventClose={isRunning}
      mobileActionLayout="stacked"
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      <ManagerIssueConfirmationContent confirmation={confirmation} />
    </Dialog>
  );
}

export function ManagerIssueConfirmationContent({
  confirmation,
}: {
  confirmation: Exclude<ManagerInvitationIssueConfirmation, null>;
}) {
  if (confirmation.kind === "existingStaff") {
    return (
      <ManagerAssignmentConfirmation
        personName={confirmation.candidate.name}
        personEmail={confirmation.candidate.contactEmail}
        mode={confirmation.mode === "freeManagerExchange" ? "freeManagerExchange" : "addition"}
      />
    );
  }

  return (
    <Stack gap={2} fontSize="sm" color="fg.muted" lineHeight="tall">
      <Text fontWeight="semibold" color="gray.900">
        {confirmation.invitedName}さんへ管理者招待を送ります。
      </Text>
      <Text>{confirmation.email}</Text>
      <Text>シフトリに登録後、招待URLをクリックすることで管理者として追加します。</Text>
    </Stack>
  );
}
