import { Stack, Tabs } from "@chakra-ui/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
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

type Props = {
  staff: Staff | null;
  isReadOnly?: boolean;
  isOpen: boolean;
  defaultTab?: "basic" | "notification" | "line" | "settings";
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const directActionRef = useRef<DirectAction | null>(null);
  const [directAction, setDirectAction] = useState<DirectAction | null>(null);
  const managerInvitationState = staff?.managerInvitationState;
  const managerInvitationCapability =
    managerInvitationState && managerInvitationState.kind !== "unavailable"
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

  if (!staff) return null;
  const activePendingAction = pendingAction?.contextKey === pendingActionContextKey ? pendingAction.kind : null;

  const handleOpenChange = (details: { open: boolean }) => {
    if (!details.open) setPendingAction(null);
    onOpenChange(details);
  };

  const handleClose = () => {
    setPendingAction(null);
    onClose();
  };

  const handleDelete = async () => {
    await onDelete(staff);
    setPendingAction(null);
  };

  const handleManagerInvitation = async () => {
    const succeeded = await onInviteManager(staff);
    if (succeeded) setPendingAction(null);
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
  const canSendRecruitments = canSendNotification && openRecruitments.length > 0;
  const canSendCurrentShift = canSendNotification && currentRecruitments.length > 0;
  const showLineQr = lineQrState.staffId === staff._id;
  const lineStatus = getStaffLineStatus(staff);
  const isDirectActionRunning = directAction !== null;

  return (
    <Dialog
      title="スタッフ詳細"
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      hideFooter
      maxW={{ base: "100vw", lg: "960px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "86dvh" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{
        px: { base: 4, lg: 6 },
        pt: 0,
        pb: { base: 6, lg: 6 },
      }}
    >
      <Stack gap={5}>
        <StaffDetailSummary staff={staff} lineStatus={lineStatus} />

        <Tabs.Root defaultValue={defaultTab} colorPalette="teal" variant="line">
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
              notificationHistory={notificationHistory}
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
                staffName={staff.name}
                staffEmail={staff.email}
                managerInvitationState={staff.managerInvitationState}
                isManagerInvitationConfirmationOpen={activePendingAction === "managerInvitation"}
                isInvitingManager={isInvitingManager}
                isOrganizationLinked={staff.isOrganizationLinked ?? false}
                isDeleteConfirmationOpen={activePendingAction === "delete"}
                isDeleting={isDeleting}
                onChangeShiftTarget={(nextIsShiftTarget) => onChangeShiftTarget(staff, nextIsShiftTarget)}
                onRequestManagerInvitation={() =>
                  setPendingAction({ kind: "managerInvitation", contextKey: pendingActionContextKey })
                }
                onCancelManagerInvitation={() => setPendingAction(null)}
                onConfirmManagerInvitation={handleManagerInvitation}
                onRequestDelete={() => setPendingAction({ kind: "delete", contextKey: pendingActionContextKey })}
                onCancelDelete={() => setPendingAction(null)}
                onConfirmDelete={handleDelete}
              />
            </fieldset>
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Dialog>
  );
};

const FIELDSET_STYLE = { border: 0, margin: 0, minWidth: 0, padding: 0 } as const;
