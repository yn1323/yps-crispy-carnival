import { Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog } from "@/src/components/ui/Dialog";
import { type DashboardNotificationFailure, NotificationFailureDialogContent } from "../NotificationFailureDialog";

type Props = {
  isOpen: boolean;
  isReadOnly?: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  failures: DashboardNotificationFailure[];
  acceptedFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  resendingFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  isResendingAll: boolean;
  dismissTarget: DashboardNotificationFailure | null;
  isDismissing: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  onResendAll: () => void;
  onDismiss: (failure: DashboardNotificationFailure) => void;
  onCancelDismiss: () => void;
  onConfirmDismiss: () => void;
};

export function NotificationFailureRecoveryView({
  isOpen,
  isReadOnly = false,
  onOpenChange,
  onClose,
  failures,
  acceptedFailureIds,
  resendingFailureIds,
  isResendingAll,
  dismissTarget,
  isDismissing,
  onResend,
  onResendAll,
  onDismiss,
  onCancelDismiss,
  onConfirmDismiss,
}: Props) {
  const isConfirmingDismiss = dismissTarget !== null;
  const dismissTriggerIdRef = useRef<string | null>(null);
  const confirmationBodyRef = useRef<HTMLDivElement>(null);
  const wasConfirmingDismiss = useRef(false);

  useEffect(() => {
    if (isConfirmingDismiss) {
      confirmationBodyRef.current?.focus();
    } else if (wasConfirmingDismiss.current) {
      const trigger = dismissTriggerIdRef.current
        ? document.querySelector<HTMLButtonElement>(
            `[data-notification-dismiss-trigger="${dismissTriggerIdRef.current}"]`,
          )
        : null;
      trigger?.focus();
    }
    wasConfirmingDismiss.current = isConfirmingDismiss;
  }, [isConfirmingDismiss]);

  const closeCurrentState = () => {
    if (isConfirmingDismiss) {
      if (!isDismissing) onCancelDismiss();
      return;
    }
    onClose();
  };

  return (
    <Dialog
      title={isConfirmingDismiss ? "送れなかった通知を無視する" : "送れなかった通知"}
      role={isConfirmingDismiss ? "alertdialog" : "dialog"}
      isOpen={(isOpen || isConfirmingDismiss) && !isReadOnly}
      onOpenChange={(details) => {
        if (!details.open && isConfirmingDismiss) closeCurrentState();
        else onOpenChange(details);
      }}
      onClose={closeCurrentState}
      closeLabel={isConfirmingDismiss ? "キャンセル" : "閉じる"}
      onSubmit={isConfirmingDismiss ? onConfirmDismiss : undefined}
      submitLabel="無視する"
      submitColorPalette="red"
      isLoading={isDismissing}
      isSubmitDisabled={isReadOnly || dismissTarget === null}
      mobileFullScreen
      maxW={isConfirmingDismiss ? "480px" : { lg: "960px" }}
      maxH={isConfirmingDismiss ? undefined : { lg: "82dvh" }}
    >
      {isConfirmingDismiss ? (
        <Stack
          ref={confirmationBodyRef}
          data-testid="notification-dismiss-confirmation"
          tabIndex={-1}
          gap={2}
          outline="none"
        >
          <Text color="gray.800">
            「{dismissTarget.staffName}」さんへの{dismissTarget.notificationKindLabel}を無視しますか？
          </Text>
          <Text color="fg.muted">無視すると一覧から削除され、再送されません。</Text>
        </Stack>
      ) : (
        <NotificationFailureDialogContent
          failures={failures}
          isReadOnly={isReadOnly}
          acceptedFailureIds={acceptedFailureIds}
          resendingFailureIds={resendingFailureIds}
          isResendingAll={isResendingAll}
          onResend={onResend}
          onResendAll={onResendAll}
          onDismiss={(failure) => {
            dismissTriggerIdRef.current = failure._id;
            onDismiss(failure);
          }}
        />
      )}
    </Dialog>
  );
}
