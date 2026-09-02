import { lazy } from "react";
import { DeferredDialogBoundary } from "@/src/components/ui/Dialog/DeferredDialogBoundary";
import { StaffRoster } from "../StaffRoster";
import type { PaginationStatus, Staff } from "../types";
import type { StaffInvitationViewModel } from "./StaffInvitationDialog";
import { StaffInvitationDialogShell } from "./StaffInvitationDialogShell";

const loadStaffInvitationDialog = () => import("./StaffInvitationDialog");
const LazyStaffInvitationDialog = lazy(() =>
  loadStaffInvitationDialog().then((module) => ({ default: module.StaffInvitationDialogContent })),
);

function preloadStaffInvitationDialog() {
  void loadStaffInvitationDialog().catch(() => undefined);
}

type Props = {
  staffs: Staff[];
  isReadOnly?: boolean;
  status: PaginationStatus;
  canLoadMore: boolean;
  onLoadMore: () => void;
  focusedPersonId?: string;
  onOpenDetail: (staff: Staff) => void;
  invitation: StaffInvitationViewModel;
};

export function StaffManagementView({
  staffs,
  isReadOnly = false,
  status,
  canLoadMore,
  onLoadMore,
  focusedPersonId,
  onOpenDetail,
  invitation,
}: Props) {
  return (
    <>
      <StaffRoster
        staffs={staffs}
        isReadOnly={isReadOnly}
        status={status}
        canLoadMore={canLoadMore}
        onAddClick={invitation.onOpen}
        onAddIntent={preloadStaffInvitationDialog}
        onOpenDetail={onOpenDetail}
        onLoadMore={onLoadMore}
        focusedPersonId={focusedPersonId}
      />

      {invitation.dialog.isOpen && (
        <DeferredDialogBoundary
          title="スタッフを追加"
          isOpen
          onOpenChange={invitation.dialog.onOpenChange}
          onClose={invitation.onClose}
          renderDialog={(content) => (
            <StaffInvitationDialogShell invitation={invitation} isReadOnly={isReadOnly}>
              {content}
            </StaffInvitationDialogShell>
          )}
        >
          <LazyStaffInvitationDialog invitation={invitation} isReadOnly={isReadOnly} />
        </DeferredDialogBoundary>
      )}
    </>
  );
}
