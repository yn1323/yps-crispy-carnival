import { usePaginatedQuery } from "convex/react";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecoveryView } from "./NotificationFailureRecoveryView";
import { resendAllOpenNotificationFailuresBatches } from "./script";

type Props = {
  failures?: DashboardNotificationFailure[];
  children: (state: NotificationFailureRecoveryState) => ReactNode;
};

export type NotificationFailureRecoveryState = {
  failures: DashboardNotificationFailure[];
  openNotificationFailures: () => void;
  content: ReactNode;
};

const NOTIFICATION_FAILURE_PAGE_SIZE = 50;

export function NotificationFailureRecovery({ failures: failureOverrides, children }: Props) {
  const dialog = useDialog();
  const failureQuery = usePaginatedQuery(
    api.notificationOutbox.queries.listOpenFailures,
    failureOverrides ? "skip" : {},
    { initialNumItems: NOTIFICATION_FAILURE_PAGE_SIZE },
  );
  const failures = failureOverrides ?? failureQuery.results;
  const [dialogRows, setDialogRows] = useState<DashboardNotificationFailure[]>(failures);
  const [acceptedFailureIds, setAcceptedFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(() => new Set());
  const [resendingFailureIds, setResendingFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(() => new Set());
  const resendFailure = useShopMutation(api.notificationOutbox.mutations.resendFailure);
  const resendOpenFailures = useShopMutation(api.notificationOutbox.mutations.resendOpenFailures);

  useEffect(() => {
    if (!dialog.isOpen) {
      setDialogRows(failures);
      return;
    }

    setDialogRows((currentRows) => {
      const nextRowsById = new Map(currentRows.map((failure) => [failure._id, failure]));
      for (const failure of failures) {
        nextRowsById.set(failure._id, failure);
      }
      return Array.from(nextRowsById.values()).filter(
        (failure) =>
          acceptedFailureIds.has(failure._id) || failures.some((openFailure) => openFailure._id === failure._id),
      );
    });
  }, [acceptedFailureIds, dialog.isOpen, failures]);

  const resetDialogState = () => {
    setDialogRows(failures);
    setAcceptedFailureIds(new Set());
    setResendingFailureIds(new Set());
  };

  const handleOpenChange = (details: { open: boolean }) => {
    dialog.onOpenChange(details);
    if (!details.open) resetDialogState();
  };

  const handleClose = () => {
    dialog.close();
    resetDialogState();
  };

  const handleResend = async (failureId: Id<"notificationFailureInbox">) => {
    if (acceptedFailureIds.has(failureId) || resendingFailureIds.has(failureId) || isResendingAll) return;

    setResendingFailureIds((current) => new Set(current).add(failureId));
    try {
      const result = await resendFailure({ failureId });
      if (result.scheduled) {
        setAcceptedFailureIds((current) => new Set(current).add(failureId));
        showSuccessToast({ title: "通知を再送しました" });
        return;
      }
      toaster.create({
        title: result.reason === "rateLimited" ? "少し時間をおいてから再送してください" : "再送できませんでした",
        type: result.reason === "rateLimited" ? "error" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    } finally {
      setResendingFailureIds((current) => {
        const next = new Set(current);
        next.delete(failureId);
        return next;
      });
    }
  };

  const { run: handleResendAll, isRunning: isResendingAll } = useSingleFlight(async () => {
    const retryableFailures = dialogRows.filter((failure) => failure.canRetry && !acceptedFailureIds.has(failure._id));
    if (retryableFailures.length === 0) return;

    try {
      const result = await resendAllOpenNotificationFailuresBatches(() => resendOpenFailures({}));
      if (result.scheduledFailureIds.length > 0) {
        setAcceptedFailureIds((current) => {
          const next = new Set(current);
          for (const failureId of result.scheduledFailureIds) next.add(failureId);
          return next;
        });
        toaster.create({
          title: result.hasRemainingFailures ? "一部の通知を再送しました" : "送れなかった通知を再送しました",
          description: result.hasRemainingFailures ? "残りの通知は少し時間をおいてから再送してください。" : undefined,
          type: result.hasRemainingFailures ? "warning" : "success",
        });
        return;
      }
      toaster.create({
        title: result.hasRemainingFailures ? "一部の通知を再送できませんでした" : "再送できる通知がありません",
        description: result.hasRemainingFailures ? "残りの通知は少し時間をおいてから再送してください。" : undefined,
        type: result.hasRemainingFailures ? "warning" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const content = (
    <NotificationFailureRecoveryView
      isOpen={dialog.isOpen}
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      failures={dialogRows}
      acceptedFailureIds={acceptedFailureIds}
      resendingFailureIds={resendingFailureIds}
      isResendingAll={isResendingAll}
      onResend={handleResend}
      onResendAll={handleResendAll}
    />
  );

  return children({ failures, openNotificationFailures: dialog.open, content });
}
