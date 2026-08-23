import { type ReactNode, useEffect, useRef } from "react";
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
  const isConfirmingRotation = invitation.isConfirmingRegistrationLinkRotation;
  const isBusy =
    invitation.isAddingStaffs || invitation.isAddingOrganizationPerson || invitation.isRotatingRegistrationLink;
  const cancelRotationRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (invitation.dialog.isOpen && isConfirmingRotation && !invitation.isRotatingRegistrationLink) {
      cancelRotationRef.current?.focus();
    }
  }, [invitation.dialog.isOpen, invitation.isRotatingRegistrationLink, isConfirmingRotation]);

  const handleCloseRequest = () => {
    if (isBusy) return;
    if (isConfirmingRotation) {
      invitation.onCancelRegistrationLinkRotation();
      return;
    }
    invitation.onClose();
  };

  const backAction = (
    <Button variant="outline" onClick={invitation.onBackToMethods} disabled={isBusy}>
      <LuChevronLeft aria-hidden />
      戻る
    </Button>
  );
  const closeAction = (
    <Button variant="outline" onClick={handleCloseRequest} disabled={isReadOnly || isBusy}>
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
  const rotationConfirmationFooter = (
    <DialogActionArea
      layout="standard"
      startAction={
        <Button
          ref={cancelRotationRef}
          variant="outline"
          onClick={invitation.onCancelRegistrationLinkRotation}
          disabled={invitation.isRotatingRegistrationLink}
        >
          キャンセル
        </Button>
      }
      endAction={
        <Button
          colorPalette="red"
          loading={invitation.isRotatingRegistrationLink}
          loadingText="再発行する"
          onClick={invitation.onRotateRegistrationLink}
        >
          再発行する
        </Button>
      }
    />
  );
  return (
    <Dialog
      title={isConfirmingRotation ? "登録リンクを再発行" : "スタッフを追加"}
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={({ open }) => {
        if (!open) {
          handleCloseRequest();
          return;
        }
        invitation.dialog.onOpenChange({ open });
      }}
      formId={isManualMethod ? "add-staff-form" : undefined}
      onClose={handleCloseRequest}
      preventClose={isBusy}
      role={isConfirmingRotation ? "alertdialog" : "dialog"}
      footer={
        isConfirmingRotation ? (
          rotationConfirmationFooter
        ) : (
          <DialogActionArea
            layout={selectedMethod === null ? "standard" : "flow"}
            startAction={selectedMethod !== null ? backAction : undefined}
            endAction={
              selectedMethod === null || selectedMethod === "link"
                ? closeAction
                : isManualMethod
                  ? manualSubmitAction
                  : undefined
            }
          />
        )
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
