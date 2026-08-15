import type { ReactNode } from "react";
import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import type { StaffInvitationViewModel } from "./StaffInvitationDialog";

type Props = {
  invitation: StaffInvitationViewModel;
  isReadOnly?: boolean;
  children: ReactNode;
};

/** 本文の遅延読み込み中も、本番とStoryで同じDialogと操作領域を表示する。 */
export function StaffInvitationDialogShell({ invitation, isReadOnly = false, children }: Props) {
  const selectedMethod = getStaffInvitationSelectedMethod(invitation);
  const isManualMethod = selectedMethod === "manual";
  const isBusy = invitation.isAddingStaffs || invitation.isAddingOrganizationPerson;

  const backAction = (
    <Button variant="outline" onClick={invitation.onBackToMethods} disabled={isBusy}>
      <LuChevronLeft aria-hidden />
      戻る
    </Button>
  );
  const closeAction = (
    <Button variant="outline" onClick={invitation.onClose} disabled={isReadOnly || isBusy}>
      閉じる
    </Button>
  );
  const manualSubmitAction = (
    <Button
      type="submit"
      form="add-staff-form"
      colorPalette="teal"
      loading={invitation.isAddingStaffs}
      loadingText="スタッフを登録する"
      disabled={isReadOnly || invitation.isAddingOrganizationPerson}
    >
      スタッフを登録する
    </Button>
  );
  return (
    <Dialog
      title="スタッフを追加"
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={invitation.dialog.onOpenChange}
      formId={isManualMethod ? "add-staff-form" : undefined}
      onClose={invitation.onClose}
      preventClose={isBusy}
      role="dialog"
      footer={
        <DialogActionArea
          layout={selectedMethod === null ? "standard" : "flow"}
          mobileLayout={isManualMethod ? "stacked" : "inline"}
          startAction={selectedMethod !== null ? backAction : undefined}
          endAction={
            selectedMethod === null || selectedMethod === "link"
              ? closeAction
              : isManualMethod
                ? manualSubmitAction
                : undefined
          }
        />
      }
      mobileFullScreen
      bodyProps={{ pt: 0 }}
    >
      {children}
    </Dialog>
  );
}

export function getStaffInvitationSelectedMethod(invitation: StaffInvitationViewModel) {
  return !invitation.showOrganizationPeopleAddition && invitation.selectedMethod === "organization"
    ? null
    : invitation.selectedMethod;
}
