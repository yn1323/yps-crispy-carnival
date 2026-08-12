import { Stack, Tabs, Text } from "@chakra-ui/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  getManagerAssignmentConfirmationCopy,
  ManagerAssignmentConfirmation,
} from "@/src/components/shared/ManagerAssignmentConfirmation";
import { Dialog } from "@/src/components/ui/Dialog";
import type { EditStaffFormData } from "../EditStaffForm";
import type { Recruitment, Staff } from "../types";
import { StaffDetailBasicTab } from "./StaffDetailBasicTab";
import { StaffDetailLineTab } from "./StaffDetailLineTab";
import { StaffDetailNotificationTab } from "./StaffDetailNotificationTab";
import { StaffDetailSettingsTab } from "./StaffDetailSettingsTab";
import { StaffDetailSummary } from "./StaffDetailSummary";
import { getStaffLineStatus } from "./staffDetailPresentation";

type PendingAction = {
  kind: "delete" | "managerInvitation";
  contextKey: string;
};
type DirectAction = "sendRecruitments" | "sendCurrentShift" | "sendLineInvite";
type StaffDetailTab = "basic" | "notification" | "line" | "settings";

type Props = {
  staff: Staff | null;
  isReadOnly?: boolean;
  isOpen: boolean;
  defaultTab?: StaffDetailTab;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  recruitmentDataStatus?: "ready" | "loading" | "unavailable";
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

export const StaffDetailDialog = ({
  staff,
  isReadOnly = false,
  isOpen,
  defaultTab = "basic",
  onOpenChange,
  onClose,
  openRecruitments,
  currentRecruitments,
  recruitmentDataStatus = "ready",
  onEdit,
  isEditing,
  onDelete,
  isDeleting,
  onShowLineQr,
  lineQrState,
  onSendLineInvite,
  isSendingLineInvite,
  onSendRecruitments,
  isSendingRecruitments,
  onSendCurrentShift,
  isSendingCurrentShift,
  notificationHistory,
  onChangeShiftTarget,
  isChangingShiftTarget,
  onInviteManager,
  isInvitingManager,
}: Props) => {
  const [activeTab, setActiveTab] = useState<StaffDetailTab>(defaultTab);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const normalContentRef = useRef<HTMLDivElement>(null);
  const confirmationBodyRef = useRef<HTMLDivElement>(null);
  const focusRestoreKindRef = useRef<PendingAction["kind"] | null>(null);
  const directActionRef = useRef<DirectAction | null>(null);
  const [directAction, setDirectAction] = useState<DirectAction | null>(null);
  const managerInvitationState = staff?.managerInvitationState;
  const managerInvitationCapability =
    managerInvitationState && (managerInvitationState.kind === "available" || managerInvitationState.kind === "pending")
      ? `${managerInvitationState.kind}:${managerInvitationState.mode}:${
          managerInvitationState.kind === "available" ? managerInvitationState.replacesStaleInvitation : true
        }`
      : null;
  const pendingActionContextKey = `${staff?._id ?? "none"}:${managerInvitationCapability ?? "unavailable"}:${isReadOnly}`;
  const previousPendingActionContextKeyRef = useRef(pendingActionContextKey);

  useEffect(() => {
    if (previousPendingActionContextKeyRef.current === pendingActionContextKey) return;
    previousPendingActionContextKeyRef.current = pendingActionContextKey;
    setPendingAction(null);
  }, [pendingActionContextKey]);

  const activePendingAction = pendingAction?.contextKey === pendingActionContextKey ? pendingAction.kind : null;
  const managerConfirmationProps =
    staff &&
    activePendingAction === "managerInvitation" &&
    (staff.managerInvitationState.kind === "available" || staff.managerInvitationState.kind === "pending")
      ? {
          personName: staff.name,
          personEmail: staff.email,
          mode: staff.managerInvitationState.mode,
          replacesStaleInvitation:
            staff.managerInvitationState.kind === "available" && staff.managerInvitationState.replacesStaleInvitation,
          isResend: staff.managerInvitationState.kind === "pending",
        }
      : null;
  const managerConfirmationCopy = managerConfirmationProps
    ? getManagerAssignmentConfirmationCopy(managerConfirmationProps)
    : null;
  const isConfirmationRunning =
    activePendingAction === "delete"
      ? isDeleting
      : activePendingAction === "managerInvitation"
        ? isInvitingManager
        : false;

  useEffect(() => {
    if (activePendingAction) {
      confirmationBodyRef.current?.focus();
      return;
    }
    const focusRestoreKind = focusRestoreKindRef.current;
    if (!focusRestoreKind) return;
    focusRestoreKindRef.current = null;
    normalContentRef.current
      ?.querySelector<HTMLElement>(`[data-staff-detail-confirmation-trigger="${focusRestoreKind}"]`)
      ?.focus();
  }, [activePendingAction]);

  if (!staff) return null;

  const leaveConfirmation = () => {
    if (!activePendingAction || isConfirmationRunning) return;
    focusRestoreKindRef.current = activePendingAction;
    setPendingAction(null);
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open && activePendingAction) {
      leaveConfirmation();
      return;
    }
    if (!details.open) setPendingAction(null);
    onOpenChange(details);
  };

  const handleClose = () => {
    setPendingAction(null);
    onClose();
  };

  const handleDelete = async () => {
    await onDelete(staff);
    focusRestoreKindRef.current = "delete";
    setPendingAction(null);
  };

  const handleManagerInvitation = async () => {
    const succeeded = await onInviteManager(staff);
    if (succeeded) {
      focusRestoreKindRef.current = "managerInvitation";
      setPendingAction(null);
    }
  };

  const runDirectAction = async (action: DirectAction, handler: () => void | Promise<void>) => {
    if (directActionRef.current !== null) return;

    directActionRef.current = action;
    setDirectAction(action);
    try {
      await handler();
    } finally {
      directActionRef.current = null;
      setDirectAction(null);
    }
  };

  const isLineActive = staff.isLineLinked && staff.isLineFollowing;
  const isShiftTarget = !staff.excludedFromShift;
  const hasEmail = staff.email.length > 0;
  const canSendNotification = (hasEmail || isLineActive) && isShiftTarget;
  const canSendRecruitments = recruitmentDataStatus === "ready" && canSendNotification && openRecruitments.length > 0;
  const canSendCurrentShift =
    recruitmentDataStatus === "ready" && canSendNotification && currentRecruitments.length > 0;
  const showLineQr = lineQrState.staffId === staff._id;
  const lineStatus = getStaffLineStatus(staff);
  const isDirectActionRunning = directAction !== null;

  return (
    <Dialog
      title={
        activePendingAction === "delete"
          ? staff.isOrganizationLinked
            ? "店舗からスタッフを削除"
            : "スタッフを削除"
          : (managerConfirmationCopy?.title ?? "スタッフ詳細")
      }
      role={activePendingAction ? "alertdialog" : "dialog"}
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onClose={activePendingAction ? leaveConfirmation : handleClose}
      closeLabel={activePendingAction ? "やめる" : "閉じる"}
      onSubmit={
        activePendingAction === "delete"
          ? handleDelete
          : activePendingAction === "managerInvitation"
            ? handleManagerInvitation
            : undefined
      }
      submitLabel={
        activePendingAction === "delete"
          ? staff.isOrganizationLinked
            ? "店舗から削除"
            : "スタッフを削除"
          : managerConfirmationCopy?.confirmLabel
      }
      submitColorPalette={activePendingAction === "delete" ? "red" : "teal"}
      isLoading={isConfirmationRunning}
      mobileActionLayout={activePendingAction ? "stacked" : "inline"}
      mobileFullScreen
      maxW={{ lg: "960px" }}
      maxH={{ lg: "86dvh" }}
      bodyProps={{
        px: { base: 4, lg: 6 },
        pt: 0,
        pb: { base: 6, lg: 6 },
      }}
    >
      {activePendingAction === "delete" ? (
        <Stack
          ref={confirmationBodyRef}
          data-testid="staff-detail-confirmation-body"
          tabIndex={-1}
          gap={2}
          outline="none"
        >
          <Text fontSize="sm" color="fg.muted" lineHeight="tall" whiteSpace="pre-line">
            {staff.isOrganizationLinked
              ? "将来のシフトに割り当てられている場合は削除できません。\n削除すると、この店舗の所属と既存のシフト用リンク、LINE連携を終了します。\n組織のユーザー情報、ほかの店舗所属、管理者権限は変更せず、利用人数にも引き続き含まれます。"
              : "削除すると元に戻せません。\n既存のシフト用リンクやLINE連携も使えなくなります。"}
          </Text>
        </Stack>
      ) : managerConfirmationProps ? (
        <Stack ref={confirmationBodyRef} data-testid="staff-detail-confirmation-body" tabIndex={-1} outline="none">
          <ManagerAssignmentConfirmation {...managerConfirmationProps} />
        </Stack>
      ) : (
        <Stack ref={normalContentRef} gap={5}>
          <StaffDetailSummary staff={staff} lineStatus={lineStatus} />

          <Tabs.Root
            value={activeTab}
            onValueChange={({ value }) => setActiveTab(value as StaffDetailTab)}
            colorPalette="teal"
            variant="line"
            lazyMount
          >
            <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
              <Tabs.Trigger value="basic" flexShrink={0}>
                情報
              </Tabs.Trigger>
              <Tabs.Trigger value="notification" flexShrink={0}>
                通知
              </Tabs.Trigger>
              <Tabs.Trigger value="line" flexShrink={0}>
                LINE
              </Tabs.Trigger>
              <Tabs.Trigger value="settings" flexShrink={0}>
                設定
              </Tabs.Trigger>
            </Tabs.List>

            <Tabs.Content value="basic" pt={4}>
              <fieldset disabled={isReadOnly} style={FIELDSET_STYLE}>
                <StaffDetailBasicTab staff={staff} onEdit={onEdit} isEditing={isEditing} />
              </fieldset>
            </Tabs.Content>

            <Tabs.Content value="notification" pt={4}>
              <StaffDetailNotificationTab
                isReadOnly={isReadOnly}
                isShiftTarget={isShiftTarget}
                openRecruitments={openRecruitments}
                currentRecruitments={currentRecruitments}
                recruitmentDataStatus={recruitmentDataStatus}
                notificationHistory={activeTab === "notification" ? notificationHistory : null}
                sendRecruitmentsAction={{
                  isDisabled: !canSendRecruitments || isDirectActionRunning,
                  isLoading: isSendingRecruitments || directAction === "sendRecruitments",
                  onAction: () => runDirectAction("sendRecruitments", () => onSendRecruitments(staff)),
                }}
                sendCurrentShiftAction={{
                  isDisabled: !canSendCurrentShift || isDirectActionRunning,
                  isLoading: isSendingCurrentShift || directAction === "sendCurrentShift",
                  onAction: () => runDirectAction("sendCurrentShift", () => onSendCurrentShift(staff)),
                }}
              />
            </Tabs.Content>

            <Tabs.Content value="line" pt={4}>
              <fieldset disabled={isReadOnly} style={FIELDSET_STYLE}>
                <StaffDetailLineTab
                  lineStatus={lineStatus}
                  isLineActive={isLineActive}
                  hasEmail={hasEmail}
                  showLineQr={showLineQr}
                  lineAuthorizeUrl={lineQrState.authorizeUrl}
                  isLineQrLoading={lineQrState.isLoading}
                  onShowLineQr={() => onShowLineQr(staff)}
                  sendLineInviteAction={{
                    isDisabled: !hasEmail || isLineActive || isSendingLineInvite || isDirectActionRunning,
                    isLoading: isSendingLineInvite || directAction === "sendLineInvite",
                    onAction: () => runDirectAction("sendLineInvite", () => onSendLineInvite(staff)),
                  }}
                />
              </fieldset>
            </Tabs.Content>

            <Tabs.Content value="settings" pt={4}>
              <fieldset disabled={isReadOnly} style={FIELDSET_STYLE}>
                <StaffDetailSettingsTab
                  isShiftTarget={isShiftTarget}
                  isChangingShiftTarget={isChangingShiftTarget}
                  isManager={staff.isManager}
                  managerInvitationState={staff.managerInvitationState}
                  isInvitingManager={isInvitingManager}
                  onChangeShiftTarget={(nextIsShiftTarget) => onChangeShiftTarget(staff, nextIsShiftTarget)}
                  onRequestManagerInvitation={() =>
                    setPendingAction({ kind: "managerInvitation", contextKey: pendingActionContextKey })
                  }
                  onRequestDelete={() => setPendingAction({ kind: "delete", contextKey: pendingActionContextKey })}
                />
              </fieldset>
            </Tabs.Content>
          </Tabs.Root>
        </Stack>
      )}
    </Dialog>
  );
};

const FIELDSET_STYLE = { border: 0, margin: 0, minWidth: 0, padding: 0 } as const;
