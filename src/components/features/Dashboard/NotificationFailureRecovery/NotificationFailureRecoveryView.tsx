import { Stack, Text } from "@chakra-ui/react";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
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
  return (
    <>
      <Dialog
        title="送れなかった通知"
        isOpen={isOpen && !isReadOnly}
        onOpenChange={onOpenChange}
        onClose={onClose}
        footer={
          <Button variant="outline" onClick={onClose} w={{ base: "100%", md: "auto" }}>
            閉じる
          </Button>
        }
        maxW={{ base: "100vw", lg: "960px" }}
        maxH={{ base: "100dvh", lg: "82dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
      >
        <NotificationFailureDialogContent
          failures={failures}
          isReadOnly={isReadOnly}
          acceptedFailureIds={acceptedFailureIds}
          resendingFailureIds={resendingFailureIds}
          isResendingAll={isResendingAll}
          onResend={onResend}
          onResendAll={onResendAll}
          onDismiss={onDismiss}
        />
      </Dialog>

      <Dialog
        title="送れなかった通知を無視する"
        role="alertdialog"
        isOpen={dismissTarget !== null && !isReadOnly}
        onOpenChange={({ open }) => {
          if (!open && !isDismissing) onCancelDismiss();
        }}
        onClose={() => {
          if (!isDismissing) onCancelDismiss();
        }}
        onSubmit={onConfirmDismiss}
        submitLabel="無視する"
        submitColorPalette="red"
        isLoading={isDismissing}
        isSubmitDisabled={isReadOnly || dismissTarget === null}
        maxW="480px"
      >
        <Stack gap={2}>
          {dismissTarget && (
            <Text color="gray.800">
              「{dismissTarget.staffName}」さんへの{dismissTarget.notificationKindLabel}を無視しますか？
            </Text>
          )}
          <Text color="fg.muted">無視すると一覧から削除され、再送されません。</Text>
        </Stack>
      </Dialog>
    </>
  );
}
