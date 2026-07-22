import { Text } from "@chakra-ui/react";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import { StaffRegistrationRequestDialog } from "../StaffRegistrationRequests";
import type { StaffRegistrationRequest } from "../types";

type Props = {
  isOpen: boolean;
  isReadOnly: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  requests: StaffRegistrationRequest[];
  peopleCapacityResolution: PeopleCapacityResolution | null;
  rejectTarget: StaffRegistrationRequest | null;
  onApprove: (request: StaffRegistrationRequest) => void;
  onRejectClick: (request: StaffRegistrationRequest) => void;
  onRejectClose: () => void;
  onRejectConfirm: () => void | Promise<void>;
  isApproving: boolean;
  isRejecting: boolean;
};

export function StaffRegistrationRequestManagementView({
  isOpen,
  isReadOnly,
  onOpenChange,
  onClose,
  requests,
  peopleCapacityResolution,
  rejectTarget,
  onApprove,
  onRejectClick,
  onRejectClose,
  onRejectConfirm,
  isApproving,
  isRejecting,
}: Props) {
  return (
    <>
      <StaffRegistrationRequestDialog
        isOpen={isOpen && !isReadOnly}
        isReadOnly={isReadOnly}
        onOpenChange={onOpenChange}
        onClose={onClose}
        requests={requests}
        peopleCapacityResolution={peopleCapacityResolution}
        onApprove={onApprove}
        onReject={onRejectClick}
        isApproving={isApproving}
        isRejecting={isRejecting}
      />

      <Dialog
        title="スタッフ登録申請を却下"
        isOpen={rejectTarget !== null && !isReadOnly}
        onOpenChange={({ open }) => {
          if (!open) onRejectClose();
        }}
        onClose={onRejectClose}
        onSubmit={onRejectConfirm}
        submitLabel="この申請を却下"
        role="alertdialog"
        submitColorPalette="red"
        isLoading={isRejecting}
        isSubmitDisabled={isReadOnly || isRejecting}
      >
        <Text>「{rejectTarget?.name}」さんのスタッフ登録申請を却下しますか？</Text>
        <Text fontSize="sm" color="gray.600">
          却下してもスタッフには通知されません。必要な場合はシフト作成担当者から直接案内してください。
        </Text>
      </Dialog>
    </>
  );
}
