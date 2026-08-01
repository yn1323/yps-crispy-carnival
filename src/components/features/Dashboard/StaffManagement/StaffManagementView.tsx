import { Alert, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Dialog } from "@/src/components/ui/Dialog";
import type { EditStaffFormData } from "../EditStaffForm";
import { StaffRoster } from "../StaffRoster";
import { StaffDetailDialog } from "../StaffRoster/StaffDetailDialog";
import type { PaginationStatus, Recruitment, Staff } from "../types";
import { StaffInvitationDialog, type StaffInvitationViewModel } from "./StaffInvitationDialog";

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
  onSendRecruitments: (staff: Staff) => void | Promise<void>;
  isSendingRecruitments: boolean;
  onSendCurrentShift: (staff: Staff) => void | Promise<void>;
  isSendingCurrentShift: boolean;
  notificationHistory: ReactNode;
  onChangeShiftTarget: (staff: Staff, isShiftTarget: boolean) => void | Promise<void>;
  isChangingShiftTarget: boolean;
  onInviteManager: (staff: Staff) => Promise<boolean>;
  isInvitingManager: boolean;
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
        onOpenDetail={onOpenDetail}
        onLoadMore={onLoadMore}
        focusedPersonId={focusedPersonId}
      />

      <StaffInvitationDialog invitation={invitation} isReadOnly={isReadOnly} />

      <Dialog
        title="削除済みの人物を再追加しますか？"
        isOpen={invitation.reactivationConfirmation.dialog.isOpen && !isReadOnly}
        onOpenChange={invitation.reactivationConfirmation.dialog.onOpenChange}
        role="alertdialog"
        submitLabel="確認して再追加する"
        onSubmit={invitation.reactivationConfirmation.onConfirm}
        onClose={invitation.reactivationConfirmation.onClose}
        isLoading={invitation.reactivationConfirmation.isConfirming}
        isSubmitDisabled={isReadOnly}
      >
        <Stack gap={4}>
          {invitation.peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert
              resolution={invitation.peopleCapacityResolution}
              retryActionLabel="スタッフを再追加"
            />
          )}
          <Text fontSize="sm">入力したメールアドレスは、以前このグループから削除されたユーザーのものです。</Text>
          <Stack gap={2}>
            {invitation.reactivationConfirmation.candidates.map((candidate) => (
              <Stack key={candidate.personId} gap={0} rounded="md" borderWidth="1px" px={3} py={2}>
                <Text fontWeight="medium">{candidate.name}</Text>
                <Text fontSize="sm" color="fg.muted">
                  {candidate.email}
                </Text>
              </Stack>
            ))}
          </Stack>
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>この店舗のスタッフとしてのみ再追加します</Alert.Title>
              <Alert.Description>
                以前の管理者権限や、ほかの店舗への所属は復元しません。
                <br />
                必要な権限と店舗所属は、再追加後に個別に設定してください。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Stack>
      </Dialog>

      <StaffDetailDialog
        staff={detail.staff}
        isReadOnly={isReadOnly}
        isOpen={detail.dialog.isOpen}
        onOpenChange={detail.onOpenChange}
        onClose={detail.onClose}
        openRecruitments={openRecruitments}
        currentRecruitments={currentRecruitments}
        onEdit={detail.onEdit}
        isEditing={detail.isEditing}
        onDelete={detail.onDelete}
        isDeleting={detail.isDeleting}
        onShowLineQr={detail.onShowLineQr}
        lineQrState={detail.lineQrState}
        onSendLineInvite={detail.onSendLineInvite}
        isSendingLineInvite={detail.isSendingLineInvite}
        onSendRecruitments={detail.onSendRecruitments}
        isSendingRecruitments={detail.isSendingRecruitments}
        onSendCurrentShift={detail.onSendCurrentShift}
        isSendingCurrentShift={detail.isSendingCurrentShift}
        notificationHistory={detail.notificationHistory}
        onChangeShiftTarget={detail.onChangeShiftTarget}
        isChangingShiftTarget={detail.isChangingShiftTarget}
        onInviteManager={detail.onInviteManager}
        isInvitingManager={detail.isInvitingManager}
      />
    </>
  );
}
