import { Flex, Stack, Text } from "@chakra-ui/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type ActionInboxConfirmation,
  ActionInboxConfirmationDialog,
  type ActionInboxItem,
  ActionInboxView,
  buildNotificationFailureActionInboxItem,
} from "@/src/components/features/ActionInbox";
import { showErrorToast } from "@/src/components/shared/feedback";
import { Button } from "@/src/components/ui/Button";
import { toaster } from "@/src/components/ui/toaster";
import { useShopCustomPaginatedQuery } from "@/src/hooks/useShopCustomPaginatedQuery";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { resendAllOpenNotificationFailuresBatches } from "./script";
import type { DashboardNotificationFailure } from "./types";

export type { DashboardNotificationFailure } from "./types";

type Props = {
  shopName: string;
  failures?: DashboardNotificationFailure[];
  isReadOnly?: boolean;
  children: (state: NotificationFailureRecoveryState) => ReactNode;
};

export type NotificationFailureRecoveryState = {
  isInitialLoading: boolean;
  failures: DashboardNotificationFailure[];
  actionItemCount: number;
  content: ReactNode;
};

const NOTIFICATION_FAILURE_PAGE_SIZE = 50;
const actionItemId = (failureId: Id<"notificationFailureInbox">) => `notificationFailure:${failureId}`;

export function NotificationFailureRecovery({
  shopName,
  failures: failureOverrides,
  isReadOnly = false,
  children,
}: Props) {
  const failureQuery = useShopCustomPaginatedQuery(
    api.notificationOutbox.queries.listOpenFailures,
    failureOverrides ? "skip" : {},
    { initialNumItems: NOTIFICATION_FAILURE_PAGE_SIZE },
  );
  const failures = failureOverrides ?? failureQuery.results;
  const [processedFailureIds, setProcessedFailureIds] = useState<ReadonlySet<Id<"notificationFailureInbox">>>(
    () => new Set(),
  );
  const visibleFailures = useMemo(
    () => failures.filter((failure) => !processedFailureIds.has(failure._id)),
    [failures, processedFailureIds],
  );
  const [visibleItemCount, setVisibleItemCount] = useState(visibleFailures.length);
  const [completedItemIds, setCompletedItemIds] = useState<readonly string[]>([]);
  const [dismissTarget, setDismissTarget] = useState<DashboardNotificationFailure | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const resendFailure = useShopMutation(api.notificationOutbox.mutations.resendFailure);
  const resendOpenFailures = useShopMutation(api.notificationOutbox.mutations.resendOpenFailures);
  const resolveFailure = useShopMutation(api.notificationOutbox.mutations.resolveFailure);

  useEffect(() => {
    const openFailureIds = new Set(failures.map((failure) => failure._id));
    setProcessedFailureIds((current) => {
      const next = new Set([...current].filter((failureId) => openFailureIds.has(failureId)));
      return next.size === current.size ? current : next;
    });
    if (dismissTarget && !openFailureIds.has(dismissTarget._id)) {
      setDismissTarget(null);
      setConfirmationError(null);
    }
  }, [dismissTarget, failures]);

  useEffect(() => {
    if (!isReadOnly) return;
    setDismissTarget(null);
    setConfirmationError(null);
    confirmationTriggerRef.current = null;
  }, [isReadOnly]);

  const markProcessed = (failureIds: readonly Id<"notificationFailureInbox">[], announceCompletion: boolean) => {
    setProcessedFailureIds((current) => {
      const next = new Set(current);
      for (const failureId of failureIds) next.add(failureId);
      return next;
    });
    if (announceCompletion) {
      setCompletedItemIds((current) => [...current, ...failureIds.map(actionItemId)]);
    }
  };

  const handleResend = async (failure: DashboardNotificationFailure) => {
    if (isReadOnly || !failure.canRetry) throw new Error("この通知は現在再送できません。");
    const result = await resendFailure({ failureId: failure._id });
    if (!result.scheduled) {
      throw new Error(
        result.reason === "rateLimited"
          ? "少し時間をおいてから、もう一度お試しください。"
          : "連絡先や募集の状態が変わったため、通知を再送できませんでした。",
      );
    }
    markProcessed([failure._id], false);
  };

  const { run: handleResendAll, isRunning: isResendingAll } = useSingleFlight(async () => {
    if (isReadOnly || !visibleFailures.some((failure) => failure.canRetry)) return;
    try {
      const result = await resendAllOpenNotificationFailuresBatches(() => resendOpenFailures({}));
      if (result.scheduledFailureIds.length > 0) {
        markProcessed(result.scheduledFailureIds, true);
        toaster.create({
          title: result.hasRemainingFailures ? "一部の通知を再送しました" : "送れなかった通知を再送しました",
          description: result.hasRemainingFailures ? "残りの通知は、少し時間をおいてから再送してください。" : undefined,
          type: result.hasRemainingFailures ? "warning" : "success",
        });
        return;
      }
      toaster.create({
        title: result.hasRemainingFailures ? "一部の通知を再送できませんでした" : "再送できる通知がありません",
        description: result.hasRemainingFailures ? "残りの通知は、少し時間をおいてから再送してください。" : undefined,
        type: result.hasRemainingFailures ? "warning" : "info",
      });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const restoreConfirmationTriggerFocus = () => {
    const trigger = confirmationTriggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  };

  const closeConfirmation = () => {
    setDismissTarget(null);
    setConfirmationError(null);
    restoreConfirmationTriggerFocus();
  };

  const { run: handleDismiss, isRunning: isDismissing } = useSingleFlight(async () => {
    if (isReadOnly || !dismissTarget) return;
    const target = dismissTarget;
    try {
      await resolveFailure({ failureId: target._id });
      markProcessed([target._id], true);
      setDismissTarget(null);
      setConfirmationError(null);
      restoreConfirmationTriggerFocus();
    } catch {
      if (!isReadOnlyRef.current) {
        setConfirmationError("送れなかった通知を破棄できませんでした。通知の状態を確認して、もう一度お試しください。");
      }
    }
  });

  const actionItems: readonly ActionInboxItem[] = visibleFailures.map((failure) =>
    buildNotificationFailureActionInboxItem(
      {
        id: actionItemId(failure._id),
        staffName: failure.staffName,
        shopName,
        notificationKindLabel: failure.notificationKindLabel,
        channel: failure.channel,
        lastFailedAt: failure.lastFailedAt,
        canRetry: !isReadOnly && !isResendingAll && failure.canRetry,
        canResolve: !isReadOnly && !isResendingAll,
      },
      {
        retry: () => handleResend(failure),
        resolve: (context) => {
          confirmationTriggerRef.current = context?.triggerElement ?? null;
          setConfirmationError(null);
          setDismissTarget(failure);
        },
      },
    ),
  );

  const confirmation: ActionInboxConfirmation = dismissTarget
    ? {
        kind: "resolveNotification",
        itemId: actionItemId(dismissTarget._id),
        staffName: dismissTarget.staffName,
        notificationKindLabel: dismissTarget.notificationKindLabel,
      }
    : null;
  const hasRetryableFailures = visibleFailures.some((failure) => !isReadOnly && failure.canRetry);
  const actionItemCount = visibleItemCount > 0 ? visibleItemCount : actionItems.length;
  const content = (
    <Stack gap={4}>
      <Flex
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
        gap={3}
        direction={{ base: "column", md: "row" }}
      >
        <Text fontSize="sm" color="fg.muted" whiteSpace="pre-line">
          {"送れなかった通知は再送できます。何度も失敗する場合は、スタッフの通知先やLINE連携状態を確認してください。"}
        </Text>
        <Button
          size="sm"
          colorPalette="teal"
          variant="solid"
          alignSelf={{ base: "stretch", md: "center" }}
          loading={isResendingAll}
          disabled={isResendingAll || !hasRetryableFailures}
          onClick={handleResendAll}
          gap={1.5}
          flexShrink={0}
        >
          <LuRefreshCw />
          すべて再送
        </Button>
      </Flex>
      <ActionInboxView
        items={actionItems}
        completedItemIds={completedItemIds}
        ariaLabel="送れなかった通知"
        hideEmpty
        itemVariant="list"
        onVisibleItemCountChange={setVisibleItemCount}
      />
      <ActionInboxConfirmationDialog
        confirmation={confirmation}
        errorMessage={confirmationError}
        isRunning={isDismissing}
        onClose={closeConfirmation}
        onConfirm={handleDismiss}
        finalFocusEl={() => confirmationTriggerRef.current}
      />
    </Stack>
  );

  return children({
    isInitialLoading: failureOverrides === undefined && failureQuery.status === "LoadingFirstPage",
    failures: visibleFailures,
    actionItemCount,
    content,
  });
}
