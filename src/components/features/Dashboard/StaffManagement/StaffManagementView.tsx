import { lazy, type ReactNode } from "react";
import { DeferredDialogBoundary } from "@/src/components/ui/Dialog/DeferredDialogBoundary";
import type { EditStaffFormData } from "../EditStaffForm";
import { StaffRoster } from "../StaffRoster";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import type { StaffInvitationViewModel } from "./StaffInvitationDialog";
import { StaffInvitationDialogShell } from "./StaffInvitationDialogShell";

const loadStaffInvitationDialog = () => import("./StaffInvitationDialog");
const loadStaffDetailDialog = () => import("../StaffRoster/StaffDetailDialog");
const LazyStaffInvitationDialog = lazy(() =>
  loadStaffInvitationDialog().then((module) => ({ default: module.StaffInvitationDialogContent })),
);
const LazyStaffDetailDialog = lazy(() =>
  loadStaffDetailDialog().then((module) => ({ default: module.StaffDetailDialog })),
);

function preloadStaffInvitationDialog() {
  void loadStaffInvitationDialog().catch(() => undefined);
}

function preloadStaffDetailDialog() {
  void loadStaffDetailDialog().catch(() => undefined);
}

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

type StaffDetailViewModel = {
  staff: Staff | null;
  dialog: DialogState;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onEdit: (data: EditStaffFormData) => void | Promise<void>;
  isEditing: boolean;
  onDelete: (staff: Staff) => void | Promise<void>;
  isDeleting: boolean;
  onShowLineQr: (staff: Staff) => void | Promise<void>;
  lineQrState: {
    staffId: Staff["_id"] | null;
    authorizeUrl: string | null;
    isLoading: boolean;
  };
  onSendLineInvite: (staff: Staff) => void | Promise<void>;
  isSendingLineInvite: boolean;
  isLineInviteCooldownActive: boolean;
  onSendRecruitments: (staff: Staff) => void | Promise<void>;
  isSendingRecruitments: boolean;
  isRecruitmentCooldownActive: boolean;
  onSendCurrentShift: (staff: Staff) => void | Promise<void>;
  isSendingCurrentShift: boolean;
  isCurrentShiftCooldownActive: boolean;
  isNotificationCooldownLoading: boolean;
  notificationHistory: ReactNode;
  onChangeShiftTarget: (staff: Staff, isShiftTarget: boolean) => void | Promise<void>;
  isChangingShiftTarget: boolean;
  onManageManagers: () => void;
};

type Props = {
  staffs: Staff[];
  isReadOnly?: boolean;
  status: PaginationStatus;
  canLoadMore: boolean;
  onLoadMore: () => void;
  focusedPersonId?: string;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  recruitmentDataStatus?: "ready" | "loading" | "unavailable";
  onOpenDetail: (staff: Staff) => void;
  invitation: StaffInvitationViewModel;
  detail: StaffDetailViewModel;
};

export function StaffManagementView({
  staffs,
  isReadOnly = false,
  status,
  canLoadMore,
  onLoadMore,
  focusedPersonId,
  openRecruitments,
  currentRecruitments,
  recruitmentDataStatus = "ready",
  onOpenDetail,
  invitation,
  detail,
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
        onOpenDetailIntent={preloadStaffDetailDialog}
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

      {detail.staff && detail.dialog.isOpen && (
        <DeferredDialogBoundary title="スタッフ詳細" isOpen onOpenChange={detail.onOpenChange} onClose={detail.onClose}>
          <LazyStaffDetailDialog
            staff={detail.staff}
            isReadOnly={isReadOnly}
            isOpen
            onOpenChange={detail.onOpenChange}
            onClose={detail.onClose}
            openRecruitments={openRecruitments}
            currentRecruitments={currentRecruitments}
            recruitmentDataStatus={recruitmentDataStatus}
            onEdit={detail.onEdit}
            isEditing={detail.isEditing}
            onDelete={detail.onDelete}
            isDeleting={detail.isDeleting}
            onShowLineQr={detail.onShowLineQr}
            lineQrState={detail.lineQrState}
            onSendLineInvite={detail.onSendLineInvite}
            isSendingLineInvite={detail.isSendingLineInvite}
            isLineInviteCooldownActive={detail.isLineInviteCooldownActive}
            onSendRecruitments={detail.onSendRecruitments}
            isSendingRecruitments={detail.isSendingRecruitments}
            isRecruitmentCooldownActive={detail.isRecruitmentCooldownActive}
            onSendCurrentShift={detail.onSendCurrentShift}
            isSendingCurrentShift={detail.isSendingCurrentShift}
            isCurrentShiftCooldownActive={detail.isCurrentShiftCooldownActive}
            isNotificationCooldownLoading={detail.isNotificationCooldownLoading}
            notificationHistory={detail.notificationHistory}
            onChangeShiftTarget={detail.onChangeShiftTarget}
            isChangingShiftTarget={detail.isChangingShiftTarget}
            onManageManagers={detail.onManageManagers}
          />
        </DeferredDialogBoundary>
      )}
    </>
  );
}
