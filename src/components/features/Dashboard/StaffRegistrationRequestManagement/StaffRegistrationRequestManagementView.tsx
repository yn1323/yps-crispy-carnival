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
      rejectTarget={rejectTarget}
      onRejectClose={onRejectClose}
      onRejectConfirm={onRejectConfirm}
    />
  );
}
