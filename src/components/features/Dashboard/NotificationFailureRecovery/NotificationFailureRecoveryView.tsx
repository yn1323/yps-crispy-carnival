import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { type DashboardNotificationFailure, NotificationFailureDialogContent } from "../NotificationFailureDialog";

type Props = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  failures: DashboardNotificationFailure[];
  acceptedFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  resendingFailureIds: ReadonlySet<Id<"notificationFailureInbox">>;
  isResendingAll: boolean;
  onResend: (failureId: Id<"notificationFailureInbox">) => void;
  onResendAll: () => void;
};

export function NotificationFailureRecoveryView({
  isOpen,
  onOpenChange,
  onClose,
  failures,
  acceptedFailureIds,
  resendingFailureIds,
  isResendingAll,
  onResend,
  onResendAll,
}: Props) {
  return (
    <Dialog
      title="送れなかった通知"
      isOpen={isOpen}
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
        acceptedFailureIds={acceptedFailureIds}
        resendingFailureIds={resendingFailureIds}
        isResendingAll={isResendingAll}
        onResend={onResend}
        onResendAll={onResendAll}
      />
    </Dialog>
  );
}
