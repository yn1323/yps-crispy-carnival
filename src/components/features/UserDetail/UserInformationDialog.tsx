import { Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import {
  getManagerAssignmentConfirmationCopy,
  ManagerAssignmentConfirmation,
} from "@/src/components/shared/ManagerAssignmentConfirmation";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailDialog } from "./types";
import { UserInformationTab } from "./UserInformationTab";
import { UserManagerSettings } from "./UserSettingsTab";

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  isUpdatingProfile: boolean;
  managerDialog: UserDetailDialog;
  isManagerAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  isRemovingManagerSetting: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
  onConfirmManagerSetting: () => void | Promise<void>;
  onCancelManagerSetting: () => void;
};

export function UserInformationDialog({
  data,
  isOpen,
  isUpdatingProfile,
  managerDialog,
  isManagerAssignmentConfirmationOpen,
  isAssigningManager,
  isRemovingManagerSetting,
  onOpenChange,
  onClose,
  onUpdateProfile,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRequestRemoveManagerRole,
  onConfirmManagerSetting,
  onCancelManagerSetting,
}: Props) {
  const formId = `user-profile-${data.person.id}`;
  const normalContentRef = useRef<HTMLDivElement>(null);
  const confirmationBodyRef = useRef<HTMLDivElement>(null);
  const focusRestoreKindRef = useRef<"assign" | "remove" | null>(null);
  const invitation = data.managerInvitationState;
  const managerConfirmationProps =
    isManagerAssignmentConfirmationOpen &&
    data.person.email.length > 0 &&
    (invitation.kind === "available" || invitation.kind === "pending")
      ? {
          personName: data.person.name,
          personEmail: data.person.email,
          mode: invitation.mode,
          replacesStaleInvitation: invitation.kind === "available" && invitation.replacesStaleInvitation,
          isResend: invitation.kind === "pending",
        }
      : null;
  const managerConfirmationCopy = managerConfirmationProps
    ? getManagerAssignmentConfirmationCopy(managerConfirmationProps)
    : null;
  const confirmationKind = managerConfirmationProps
    ? "assign"
    : managerDialog?.kind === "removeManagerRole"
      ? "remove"
      : null;
  const isConfirmationRunning =
    confirmationKind === "assign"
      ? isAssigningManager
      : confirmationKind === "remove"
        ? isRemovingManagerSetting
        : false;

  useEffect(() => {
    if (confirmationKind) {
      confirmationBodyRef.current?.focus();
      return;
    }
    const focusRestoreKind = focusRestoreKindRef.current;
    if (!focusRestoreKind) return;
    focusRestoreKindRef.current = null;
    normalContentRef.current
      ?.querySelector<HTMLElement>(`[data-user-manager-confirmation-trigger="${focusRestoreKind}"]`)
      ?.focus();
  }, [confirmationKind]);

  const leaveConfirmation = () => {
    if (!confirmationKind || isConfirmationRunning) return;
    focusRestoreKindRef.current = confirmationKind;
    if (confirmationKind === "assign") onCancelManagerAssignment();
    else onCancelManagerSetting();
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && confirmationKind) {
      leaveConfirmation();
      return;
    }
    onOpenChange(details);
  };

  return (
    <Dialog
      title={
        confirmationKind === "remove"
          ? `${data.person.name}さんの管理者権限を外しますか？`
          : (managerConfirmationCopy?.title ?? "スタッフ情報")
      }
      role={confirmationKind ? "alertdialog" : "dialog"}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onClose={confirmationKind ? leaveConfirmation : onClose}
      onBackGuardRemoved={confirmationKind ? undefined : onClose}
      closeLabel={confirmationKind ? "やめる" : data.canWrite ? "キャンセル" : "閉じる"}
      formId={!confirmationKind && data.canWrite ? formId : undefined}
      onSubmit={
        confirmationKind === "assign"
          ? onAssignManager
          : confirmationKind === "remove"
            ? onConfirmManagerSetting
            : undefined
      }
      submitLabel={
        confirmationKind === "assign"
          ? managerConfirmationCopy?.confirmLabel
          : confirmationKind === "remove"
            ? "管理者権限を外す"
            : "変更を保存"
      }
      submitColorPalette={confirmationKind === "remove" ? "red" : "teal"}
      isLoading={confirmationKind ? isConfirmationRunning : isUpdatingProfile}
      isSubmitDisabled={!confirmationKind && (!data.canWrite || isUpdatingProfile)}
      mobileActionLayout={confirmationKind ? "stacked" : "inline"}
      mobileFullScreen
      maxW={{ lg: "720px" }}
      maxH={{ lg: "86dvh" }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 6, lg: 6 } }}
    >
      {confirmationKind === "assign" && managerConfirmationProps ? (
        <Stack ref={confirmationBodyRef} data-testid="user-manager-confirmation-body" tabIndex={-1} outline="none">
          <ManagerAssignmentConfirmation {...managerConfirmationProps} />
        </Stack>
      ) : confirmationKind === "remove" ? (
        <Stack
          ref={confirmationBodyRef}
          data-testid="user-manager-confirmation-body"
          tabIndex={-1}
          gap={2}
          outline="none"
        >
          <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
            {data.memberships.length > 0
              ? "このユーザーの組織全体に対する管理権限を外します。\nスタッフとしての店舗所属は維持します。\nこのユーザーが発行した未連携のログイン案内は無効になります。"
              : "店舗所属がないため、管理者権限を外すと、この組織へのアクセスも終了します。\n組織のユーザー情報とシフト記録は残ります。\nこのユーザーが発行した未連携のログイン案内は無効になります。"}
          </Text>
        </Stack>
      ) : (
        <Stack ref={normalContentRef}>
          <UserInformationTab
            data={data}
            formId={formId}
            isReadOnly={!data.canWrite}
            managerSettings={
              data.managerInvitationState.kind === "hidden" ? null : (
                <UserManagerSettings
                  data={data}
                  isAssigningManager={isAssigningManager}
                  onRequestManagerAssignment={onRequestManagerAssignment}
                  onRequestRemoveManagerRole={onRequestRemoveManagerRole}
                />
              )
            }
            onUpdate={onUpdateProfile}
          />
        </Stack>
      )}
    </Dialog>
  );
}
