import { Flex } from "@chakra-ui/react";
import { LuUserPlus } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { AddStaffFormData } from "../AddStaffForm";
import { AddStaffForm } from "../AddStaffForm";
import type { EditStaffFormData } from "../EditStaffForm";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { StaffRoster } from "../StaffRoster";
import { StaffDetailDialog } from "../StaffRoster/StaffDetailDialog";
import type { PaginationStatus, Recruitment, Staff } from "../types";

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

type InvitationViewModel = {
  dialog: DialogState;
  mode: "qr" | "manual";
  registrationUrl: string | null;
  isRegistrationUrlLoading: boolean;
  isAddingStaffs: boolean;
  onOpen: () => void | Promise<void>;
  onBackOrClose: () => void;
  onShowManualEntry: () => void;
  onAddStaffs: (data: AddStaffFormData) => void | Promise<void>;
};

type StaffDetailViewModel = {
  staff: Staff | null;
  dialog: DialogState;
  onOpen: (staff: Staff) => void;
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
  onChangeShiftTarget: (staff: Staff, isShiftTarget: boolean) => void | Promise<void>;
  isChangingShiftTarget: boolean;
};

type Props = {
  staffs: Staff[];
  status: PaginationStatus;
  canLoadMore: boolean;
  onLoadMore: () => void;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  invitation: InvitationViewModel;
  detail: StaffDetailViewModel;
};

export function StaffManagementView({
  staffs,
  status,
  canLoadMore,
  onLoadMore,
  openRecruitments,
  currentRecruitments,
  invitation,
  detail,
}: Props) {
  return (
    <>
      <StaffRoster
        staffs={staffs}
        status={status}
        canLoadMore={canLoadMore}
        onAddClick={invitation.onOpen}
        onOpenDetail={detail.onOpen}
        onLoadMore={onLoadMore}
      />

      <Dialog
        title="スタッフを招待"
        isOpen={invitation.dialog.isOpen}
        onOpenChange={invitation.dialog.onOpenChange}
        formId={invitation.mode === "manual" ? "add-staff-form" : undefined}
        submitLabel={invitation.mode === "manual" ? "スタッフを追加する" : undefined}
        onClose={invitation.onBackOrClose}
        closeLabel={invitation.mode === "manual" ? "戻る" : "閉じる"}
        hideFooter={invitation.mode === "qr"}
        footer={
          invitation.mode === "manual" ? (
            <Flex w="full" align="center" justify="space-between" gap={3}>
              <Button variant="outline" onClick={invitation.onBackOrClose} disabled={invitation.isAddingStaffs}>
                戻る
              </Button>
              <Button type="submit" form="add-staff-form" colorPalette="teal" loading={invitation.isAddingStaffs}>
                スタッフを追加する
              </Button>
            </Flex>
          ) : undefined
        }
        maxW={{ base: "100vw", lg: "640px" }}
        maxH={{ base: "100dvh", lg: "85dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
      >
        {invitation.mode === "qr" ? (
          <StaffRegistrationLinkPanel
            registrationUrl={invitation.registrationUrl}
            isLoading={invitation.isRegistrationUrlLoading}
            manualEntryAction={
              <Button onClick={invitation.onShowManualEntry} size="sm" colorPalette="teal" gap={1.5}>
                <LuUserPlus />
                スタッフ情報を手入力する
              </Button>
            }
          />
        ) : (
          <AddStaffForm onSubmit={invitation.onAddStaffs} />
        )}
      </Dialog>

      <StaffDetailDialog
        staff={detail.staff}
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
        onChangeShiftTarget={detail.onChangeShiftTarget}
        isChangingShiftTarget={detail.isChangingShiftTarget}
      />
    </>
  );
}
