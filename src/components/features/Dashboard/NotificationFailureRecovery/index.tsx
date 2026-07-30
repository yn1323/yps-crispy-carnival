import { type ReactNode, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
import { useShopCustomPaginatedQuery } from "@/src/hooks/useShopCustomPaginatedQuery";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { DashboardNotificationFailure } from "../NotificationFailureDialog";
import { NotificationFailureRecoveryView } from "./NotificationFailureRecoveryView";
import { resendAllOpenNotificationFailuresBatches } from "./script";

type Props = {
  failures?: DashboardNotificationFailure[];
  isReadOnly?: boolean;
  children: (state: NotificationFailureRecoveryState) => ReactNode;
};

export type NotificationFailureRecoveryState = {
  failures: DashboardNotificationFailure[];
  openNotificationFailures: () => void;
  content: ReactNode;
};

const NOTIFICATION_FAILURE_PAGE_SIZE = 50;

export function NotificationFailureRecovery({ failures: failureOverrides, isReadOnly = false, children }: Props) {
  const dialog = useDialog();
  const failureQuery = useShopCustomPaginatedQuery(
    api.notificationOutbox.queries.listOpenFailures,
    failureOverrides ? "skip" : {},
    { initialNumItems: NOTIFICATION_FAILURE_PAGE_SIZE },
  );
  const failures = failureOverrides ?? failureQuery.results;
  const [dismissedFailureIds, setDismissedFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(() => new Set());
  const visibleFailures = useMemo(
    () => failures.filter((failure) => !dismissedFailureIds.has(failure._id)),
    [dismissedFailureIds, failures],
  );
  const [dialogRows, setDialogRows] = useState<DashboardNotificationFailure[]>(visibleFailures);
  const [acceptedFailureIds, setAcceptedFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(() => new Set());
  const [resendingFailureIds, setResendingFailureIds] = useState<Set<Id<"notificationFailureInbox">>>(() => new Set());
  const [dismissTarget, setDismissTarget] = useState<DashboardNotificationFailure | null>(null);
  const resendFailure = useShopMutation(api.notificationOutbox.mutations.resendFailure);
  const resendOpenFailures = useShopMutation(api.notificationOutbox.mutations.resendOpenFailures);
  const resolveFailure = useShopMutation(api.notificationOutbox.mutations.resolveFailure);

  useEffect(() => {
    const openFailureIds = new Set(failures.map((failure) => failure._id));
    setDismissedFailureIds((current) => {
      const next = new Set(Array.from(current).filter((failureId) => openFailureIds.has(failureId)));
      return next.size === current.size ? current : next;
    });
  }, [failures]);

  useEffect(() => {
    if (!dialog.isOpen) {
      setDialogRows(visibleFailures);
      return;
    }

    setDialogRows((currentRows) => {
      const nextRowsById = new Map(currentRows.map((failure) => [failure._id, failure]));
      for (const failure of visibleFailures) {
        nextRowsById.set(failure._id, failure);
      }
      return Array.from(nextRowsById.values()).filter(
        (failure) =>
          acceptedFailureIds.has(failure._id) || visibleFailures.some((openFailure) => openFailure._id === failure._id),
      );
    });
  }, [acceptedFailureIds, dialog.isOpen, visibleFailures]);

  useEffect(() => {
    if (!isReadOnly) return;
    dialog.close();
    setAcceptedFailureIds(new Set());
    setResendingFailureIds(new Set());
    setDismissTarget(null);
  }, [dialog.close, isReadOnly]);

  const resetDialogState = () => {
    setDialogRows(visibleFailures);
    setAcceptedFailureIds(new Set());
    setResendingFailureIds(new Set());
    setDismissTarget(null);
  };

  const handleOpenChange = (details: { open: boolean }) => {
    if (details.open && isReadOnly) return;
    dialog.onOpenChange(details);
    if (!details.open) resetDialogState();
  };

  const handleClose = () => {
    dialog.close();
    resetDialogState();
  };

  const handleResend = async (failureId: Id<"notificationFailureInbox">) => {
    if (isReadOnly || acceptedFailureIds.has(failureId) || resendingFailureIds.has(failureId) || isResendingAll) return;

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
    if (isReadOnly) return;
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

  const { run: handleDismiss, isRunning: isDismissing } = useSingleFlight(async () => {
    if (isReadOnly || !dismissTarget) return;

    try {
      await resolveFailure({ failureId: dismissTarget._id });
      setDismissedFailureIds((current) => new Set(current).add(dismissTarget._id));
      setDialogRows((current) => current.filter((failure) => failure._id !== dismissTarget._id));
      setDismissTarget(null);
      showSuccessToast({ title: "送れなかった通知を無視しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const content = (
    <NotificationFailureRecoveryView
      isOpen={dialog.isOpen}
      isReadOnly={isReadOnly}
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      failures={dialogRows}
      acceptedFailureIds={acceptedFailureIds}
      resendingFailureIds={resendingFailureIds}
      isResendingAll={isResendingAll}
      dismissTarget={dismissTarget}
      isDismissing={isDismissing}
      onResend={handleResend}
      onResendAll={handleResendAll}
      onDismiss={(failure) => {
        if (isReadOnly) return;
        setDismissTarget(failure);
      }}
      onCancelDismiss={() => setDismissTarget(null)}
      onConfirmDismiss={handleDismiss}
    />
  );

  return children({
    failures: visibleFailures,
    openNotificationFailures: () => {
      if (isReadOnly) return;
      dialog.open();
    },
    content,
  });
}
