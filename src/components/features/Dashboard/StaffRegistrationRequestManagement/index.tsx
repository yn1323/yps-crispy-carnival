import { Separator, Stack } from "@chakra-ui/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type ActionInboxConfirmation,
  ActionInboxConfirmationDialog,
  type ActionInboxItem,
  ActionInboxView,
  buildStaffRegistrationActionInboxItem,
} from "@/src/components/features/ActionInbox";
import { showSuccessToast } from "@/src/components/shared/feedback";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import {
  classifyPeopleCapacityError,
  type PeopleCapacityResolution,
} from "@/src/domains/organizationBilling/peopleCapacity";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useShopQuery } from "@/src/hooks/useShopQuery";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { getConvexErrorMessage } from "@/src/lib/convex/error";
import type { StaffRegistrationRequest } from "../types";
import { resolveStaffRegistrationApprovalAvailability } from "./script";

export type StaffRegistrationRequestManagementState = {
  isInitialLoading: boolean;
  requests: StaffRegistrationRequest[];
  actionItemCount: number;
  content: ReactNode;
};

type Props = {
  shopName: string;
  requests?: StaffRegistrationRequest[];
  isReadOnly?: boolean;
  onOpenBillingSettings?: () => void;
  children: (state: StaffRegistrationRequestManagementState) => ReactNode;
};

const actionItemId = (requestId: Id<"staffRegistrationRequests">) => `staffRegistration:${requestId}`;

export function StaffRegistrationRequestManagement({
  shopName,
  requests: requestOverrides,
  isReadOnly = false,
  onOpenBillingSettings,
  children,
}: Props) {
  const queriedRequests = useShopQuery(
    api.staffRegistration.queries.getPendingRequests,
    requestOverrides ? "skip" : {},
  );
  const requests = requestOverrides ?? queriedRequests ?? [];
  const [processedRequestIds, setProcessedRequestIds] = useState<ReadonlySet<Id<"staffRegistrationRequests">>>(
    () => new Set(),
  );
  const visibleRequests = useMemo(
    () => requests.filter((request) => !processedRequestIds.has(request._id)),
    [processedRequestIds, requests],
  );
  const [visibleItemCount, setVisibleItemCount] = useState(visibleRequests.length);
  const [rejectTarget, setRejectTarget] = useState<StaffRegistrationRequest | null>(null);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [completedItemIds, setCompletedItemIds] = useState<readonly string[]>([]);
  const [peopleCapacityResolution, setPeopleCapacityResolution] = useState<PeopleCapacityResolution | null>(null);
  const confirmationTriggerRef = useRef<HTMLElement | null>(null);
  const isReadOnlyRef = useRef(isReadOnly);
  isReadOnlyRef.current = isReadOnly;
  const approveRequest = useShopMutation(api.staffRegistration.mutations.approveRequest);
  const rejectRequest = useShopMutation(api.staffRegistration.mutations.rejectRequest);

  useEffect(() => {
    const openRequestIds = new Set(requests.map((request) => request._id));
    setProcessedRequestIds((current) => {
      const next = new Set([...current].filter((requestId) => openRequestIds.has(requestId)));
      return next.size === current.size ? current : next;
    });
    if (rejectTarget && !openRequestIds.has(rejectTarget._id)) {
      setRejectTarget(null);
      setConfirmationError(null);
    }
  }, [rejectTarget, requests]);

  useEffect(() => {
    if (!isReadOnly) return;
    setRejectTarget(null);
    setConfirmationError(null);
    setPeopleCapacityResolution(null);
    confirmationTriggerRef.current = null;
  }, [isReadOnly]);

  const handleApprove = async (request: StaffRegistrationRequest) => {
    if (isReadOnly || !resolveStaffRegistrationApprovalAvailability(request).canApprove) {
      throw new Error("この申請は現在承認できません。");
    }
    setPeopleCapacityResolution(null);
    try {
      await approveRequest({ requestId: request._id });
      setProcessedRequestIds((current) => new Set(current).add(request._id));
      showSuccessToast({
        title: "スタッフ登録申請を承認しました",
        description: "必要な案内通知の送信を受け付けました。\n募集中のシフトがある場合は、提出リンクも送信します。",
      });
    } catch (error) {
      const resolution = classifyPeopleCapacityError(getConvexErrorMessage(error));
      if (resolution && !isReadOnlyRef.current) setPeopleCapacityResolution(resolution);
      throw error;
    }
  };

  const restoreConfirmationTriggerFocus = () => {
    const trigger = confirmationTriggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
    });
  };

  const closeConfirmation = () => {
    setRejectTarget(null);
    setConfirmationError(null);
    restoreConfirmationTriggerFocus();
  };

  const { run: handleReject, isRunning: isRejecting } = useSingleFlight(async () => {
    if (isReadOnly || !rejectTarget) return;
    const target = rejectTarget;
    try {
      await rejectRequest({ requestId: target._id });
      setProcessedRequestIds((current) => new Set(current).add(target._id));
      setCompletedItemIds((current) => [...current, actionItemId(target._id)]);
      setRejectTarget(null);
      setConfirmationError(null);
      restoreConfirmationTriggerFocus();
      showSuccessToast({ title: "スタッフ登録申請を却下しました" });
    } catch {
      if (!isReadOnlyRef.current) {
        setConfirmationError("スタッフ登録申請を却下できませんでした。申請の状態を確認して、もう一度お試しください。");
      }
    }
  });

  const actionItems: readonly ActionInboxItem[] = visibleRequests.map((request) => {
    const approval = resolveStaffRegistrationApprovalAvailability(request);
    return buildStaffRegistrationActionInboxItem(
      {
        id: actionItemId(request._id),
        applicantName: request.name,
        shopName,
        createdAt: request.createdAt,
        canApprove: !isReadOnly && approval.canApprove,
        approveDisabledReason: approval.disabledReason,
        canReject: !isReadOnly,
      },
      {
        approve: () => handleApprove(request),
        reject: (context) => {
          confirmationTriggerRef.current = context?.triggerElement ?? null;
          setConfirmationError(null);
          setRejectTarget(request);
        },
      },
    );
  });

  const confirmation: ActionInboxConfirmation = rejectTarget
    ? {
        kind: "rejectRegistration",
        itemId: actionItemId(rejectTarget._id),
        applicantName: rejectTarget.name,
      }
    : null;
  const actionItemCount = visibleItemCount > 0 ? visibleItemCount : actionItems.length;
  const content = (
    <Stack gap={4}>
      {peopleCapacityResolution && (
        <PeopleCapacityResolutionAlert
          resolution={peopleCapacityResolution}
          retryActionLabel="申請を承認"
          onOpenBillingSettings={onOpenBillingSettings}
        />
      )}
      <Separator />
      <ActionInboxView
        items={actionItems}
        completedItemIds={completedItemIds}
        ariaLabel="スタッフ登録申請"
        hideEmpty
        itemVariant="list"
        onVisibleItemCountChange={setVisibleItemCount}
      />
      <ActionInboxConfirmationDialog
        confirmation={confirmation}
        errorMessage={confirmationError}
        isRunning={isRejecting}
        onClose={closeConfirmation}
        onConfirm={handleReject}
        finalFocusEl={() => confirmationTriggerRef.current}
      />
    </Stack>
  );

  return children({
    isInitialLoading: requestOverrides === undefined && queriedRequests === undefined,
    requests: visibleRequests,
    actionItemCount,
    content,
  });
}
