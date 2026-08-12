import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
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
  const isReactivationConfirmation = invitation.reactivationConfirmation.dialog.isOpen;
  const isBusy =
    invitation.isAddingStaffs ||
    invitation.isAddingOrganizationPerson ||
    invitation.reactivationConfirmation.isConfirming;
  const confirmationCancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (invitation.dialog.isOpen && isReactivationConfirmation && !isBusy) {
      confirmationCancelRef.current?.focus();
    }
  }, [invitation.dialog.isOpen, isBusy, isReactivationConfirmation]);

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
  const confirmationCancelAction = (
    <Button
      ref={confirmationCancelRef}
      variant="outline"
      onClick={invitation.reactivationConfirmation.onClose}
      disabled={isBusy}
    >
      キャンセル
    </Button>
  );
  const confirmationSubmitAction = (
    <Button
      colorPalette="teal"
      onClick={invitation.reactivationConfirmation.onConfirm}
      loading={invitation.reactivationConfirmation.isConfirming}
      loadingText="確認して再追加する"
      disabled={isReadOnly || invitation.isAddingStaffs || invitation.isAddingOrganizationPerson}
    >
      確認して再追加する
    </Button>
  );

  return (
    <Dialog
      title={isReactivationConfirmation ? "削除済みの人物を再追加しますか？" : "スタッフを追加"}
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={
        isReactivationConfirmation
          ? ({ open }) => {
              if (open) invitation.dialog.onOpenChange({ open });
              else invitation.reactivationConfirmation.dialog.onOpenChange({ open });
            }
          : invitation.dialog.onOpenChange
      }
      formId={!isReactivationConfirmation && isManualMethod ? "add-staff-form" : undefined}
      onClose={isReactivationConfirmation ? invitation.reactivationConfirmation.onClose : invitation.onClose}
      preventClose={isBusy}
      role={isReactivationConfirmation ? "alertdialog" : "dialog"}
      footer={
        isReactivationConfirmation ? (
          <DialogActionArea
            layout="standard"
            mobileLayout="stacked"
            startAction={confirmationCancelAction}
            endAction={confirmationSubmitAction}
          />
        ) : (
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
