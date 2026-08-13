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

  const isExistingStaff = confirmation.kind === "existingStaff";
  return (
    <Dialog
      title={isExistingStaff ? `${confirmation.candidate.name}さんを招待しますか？` : "新しい管理者を招待しますか？"}
      role="alertdialog"
      isOpen
      onOpenChange={({ open }) => {
        if (!open && !isRunning) onClose();
      }}
      onClose={onClose}
      onSubmit={onConfirm}
      closeLabel="やめる"
      submitLabel="招待する"
      isLoading={isRunning}
      preventClose={isRunning}
      mobileActionLayout="stacked"
      maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
    >
      {isExistingStaff ? (
        <ManagerAssignmentConfirmation
          personName={confirmation.candidate.name}
          personEmail={confirmation.candidate.contactEmail}
          mode={confirmation.mode === "freeManagerExchange" ? "freeManagerExchange" : "addition"}
        />
      ) : (
        <Stack gap={2} fontSize="sm" color="fg.muted" lineHeight="tall">
          <Text fontWeight="semibold" color="gray.900">
            {confirmation.invitedName}さんへ管理者招待を送ります。
          </Text>
          <Text>{confirmation.email}</Text>
          <Text>
            本人が有効な招待URLからログインまたは登録し、招待を承認すると管理者になります。
            <br />
            承認されるまでは、組織の人物として登録されません。
          </Text>
        </Stack>
      )}
    </Dialog>
  );
}
