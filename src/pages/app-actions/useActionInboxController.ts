import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  type ActionInboxConfirmation,
  type ActionInboxItem,
  buildActionInboxAction,
  buildNotificationFailureActionInboxItem,
  buildStaffRegistrationActionInboxItem,
} from "@/src/components/features/ActionInbox";
import { formatDateShort, formatDateTime } from "@/src/domains/shift/date";
import type { ActionInboxSourceItem } from "./useActionInboxData";

type PendingActionInboxConfirmation =
  | {
      kind: "rejectRegistration";
      item: Extract<ActionInboxSourceItem, { kind: "staffRegistration" }>;
      dialog: Extract<ActionInboxConfirmation, { kind: "rejectRegistration" }>;
    }
  | {
      kind: "resolveNotification";
      item: Extract<ActionInboxSourceItem, { kind: "notificationFailure" }>;
      dialog: Extract<ActionInboxConfirmation, { kind: "resolveNotification" }>;
    }
  | {
      kind: "revokeInvitation";
      item: Extract<ActionInboxSourceItem, { kind: "managerInvitation" }>;
      requestId: string;
      dialog: Extract<ActionInboxConfirmation, { kind: "revokeInvitation" }>;
    }
  | null;

export type ActionInboxCommands = {
  openShift: (item: Extract<ActionInboxSourceItem, { kind: "shift" }>) => void;
  approveRegistration: (item: Extract<ActionInboxSourceItem, { kind: "staffRegistration" }>) => Promise<void>;
  requestRejectRegistration: (item: Extract<ActionInboxSourceItem, { kind: "staffRegistration" }>) => void;
  resendNotification: (item: Extract<ActionInboxSourceItem, { kind: "notificationFailure" }>) => Promise<void>;
  requestResolveNotification: (item: Extract<ActionInboxSourceItem, { kind: "notificationFailure" }>) => void;
  resendInvitation: (item: Extract<ActionInboxSourceItem, { kind: "managerInvitation" }>) => Promise<void>;
  requestRevokeInvitation: (item: Extract<ActionInboxSourceItem, { kind: "managerInvitation" }>) => void;
};

export function useActionInboxController({
  organizationId,
  sourceItems,
  onRefresh,
}: {
  organizationId: Id<"organizations">;
  sourceItems: readonly ActionInboxSourceItem[];
  onRefresh: () => void;
}) {
  const navigate = useNavigate();
  const approveRequest = useMutation(api.staffRegistration.mutations.approveRequest);
  const rejectRequest = useMutation(api.staffRegistration.mutations.rejectRequest);
  const resendFailure = useMutation(api.notificationOutbox.mutations.resendFailure);
  const resolveFailure = useMutation(api.notificationOutbox.mutations.resolveFailure);
  const resendInvitation = useMutation(api.organizationInvitation.mutations.resendForOrganization);
  const revokeInvitation = useMutation(api.organizationInvitation.mutations.revokeForOrganization);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingActionInboxConfirmation>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [completedItemId, setCompletedItemId] = useState<string | null>(null);
  const requestIdsRef = useRef(new Map<string, string>());
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!pendingConfirmation) return;
    if (!sourceItems.some((item) => item.id === pendingConfirmation.item.id)) {
      setPendingConfirmation(null);
      setConfirmationError(null);
    }
  }, [pendingConfirmation, sourceItems]);

  const commands = useMemo<ActionInboxCommands>(
    () => ({
      openShift: (item) =>
        void navigate({
          to: "/shifts/$recruitmentId/board",
          params: { recruitmentId: item.recruitmentId },
          search: { org: organizationId },
        }),
      approveRegistration: async (item) => {
        await approveRequest({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          requestId: item.requestId,
        });
        onRefresh();
      },
      requestRejectRegistration: (item) => {
        setConfirmationError(null);
        setPendingConfirmation({
          kind: "rejectRegistration",
          item,
          dialog: {
            kind: "rejectRegistration",
            itemId: item.id,
            applicantName: item.applicantName,
          },
        });
      },
      resendNotification: async (item) => {
        const result = await resendFailure({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          failureId: item.failureId,
        });
        if (!result.scheduled) {
          throw new Error(
            result.reason === "rateLimited"
              ? "少し時間をおいてから、もう一度お試しください。"
              : "連絡先や募集の状態が変わったため、通知を再送できませんでした。",
          );
        }
        onRefresh();
      },
      requestResolveNotification: (item) => {
        setConfirmationError(null);
        setPendingConfirmation({
          kind: "resolveNotification",
          item,
          dialog: {
            kind: "resolveNotification",
            itemId: item.id,
            staffName: item.staffName,
            notificationKindLabel: item.notificationKindLabel,
          },
        });
      },
      resendInvitation: async (item) => {
        const key = `resend:${item.invitationId}`;
        const requestId = requestIdsRef.current.get(key) ?? crypto.randomUUID();
        requestIdsRef.current.set(key, requestId);
        await resendInvitation({ organizationId, invitationId: item.invitationId, requestId });
        requestIdsRef.current.delete(key);
        onRefresh();
      },
      requestRevokeInvitation: (item) => {
        setConfirmationError(null);
        setPendingConfirmation({
          kind: "revokeInvitation",
          item,
          requestId: crypto.randomUUID(),
          dialog: {
            kind: "revokeInvitation",
            itemId: item.id,
            inviteeName: item.inviteeName,
          },
        });
      },
    }),
    [approveRequest, navigate, onRefresh, organizationId, resendFailure, resendInvitation],
  );

  const items = useMemo(() => buildActionInboxItems(sourceItems, commands), [commands, sourceItems]);

  const confirm = async () => {
    if (!pendingConfirmation || confirmingRef.current) return;
    confirmingRef.current = true;
    setIsConfirming(true);
    setConfirmationError(null);
    try {
      const completedId = pendingConfirmation.item.id;
      if (pendingConfirmation.kind === "rejectRegistration") {
        const { item } = pendingConfirmation;
        await rejectRequest({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          requestId: item.requestId,
        });
      } else if (pendingConfirmation.kind === "resolveNotification") {
        const { item } = pendingConfirmation;
        await resolveFailure({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          failureId: item.failureId,
        });
      } else {
        await revokeInvitation({
          organizationId,
          invitationId: pendingConfirmation.item.invitationId,
          requestId: pendingConfirmation.requestId,
        });
      }
      setCompletedItemId(completedId);
      onRefresh();
      setPendingConfirmation(null);
    } catch (error) {
      setConfirmationError(resolveErrorMessage(error));
    } finally {
      confirmingRef.current = false;
      setIsConfirming(false);
    }
  };

  return {
    items,
    completedItemId,
    confirmation: pendingConfirmation?.dialog ?? null,
    confirmationError,
    isConfirming,
    closeConfirmation: () => {
      if (!isConfirming) {
        setPendingConfirmation(null);
        setConfirmationError(null);
      }
    },
    confirm,
  };
}

export function buildActionInboxItems(
  sourceItems: readonly ActionInboxSourceItem[],
  commands: ActionInboxCommands,
): ActionInboxItem[] {
  return sourceItems.map((item): ActionInboxItem => {
    if (item.kind === "shift") {
      return {
        id: item.id,
        category: "shift",
        statusLabel: "提出期限超過",
        title: "シフトを組んでスタッフに共有しましょう",
        metadata: [
          { label: item.shopName, icon: "shop" },
          { label: `${formatDateShort(item.periodStart)}〜${formatDateShort(item.periodEnd)}`, icon: "calendar" },
          {
            label: item.totalStaffCountHasOverflow
              ? `提出 ${item.responseCount}人 / 対象 ${item.totalStaffCount}人以上`
              : `提出 ${item.responseCount}/${item.totalStaffCount}人`,
            icon: "people",
          },
          { label: `提出期限 ${formatDateShort(item.deadline)}`, icon: "clock" },
        ],
        actions: [{ label: "シフトを組む", emphasis: "primary", onClick: () => commands.openShift(item) }],
      };
    }

    if (item.kind === "staffRegistration") {
      return buildStaffRegistrationActionInboxItem(item, {
        reject: () => commands.requestRejectRegistration(item),
        approve: () => commands.approveRegistration(item),
      });
    }

    if (item.kind === "notificationFailure") {
      return buildNotificationFailureActionInboxItem(item, {
        resolve: () => commands.requestResolveNotification(item),
        retry: () => commands.resendNotification(item),
      });
    }

    return {
      id: item.id,
      category: "management",
      statusLabel: item.status === "sendFailed" ? "招待エラー" : item.status === "limitReached" ? "上限超過" : "要確認",
      title:
        item.status === "sendFailed"
          ? `${item.inviteeName}さんへの管理者招待が送れませんでした`
          : `${item.inviteeName}さんへの管理者招待を確認してください`,
      metadata: [
        { label: item.invitedEmail, icon: "mail" },
        { label: formatDateTime(new Date(item.occurredAt)), icon: "clock" },
      ],
      actions: [
        buildActionInboxAction({
          enabled: item.canRevoke,
          label: "取り消す",
          emphasis: "danger",
          disabledReason: "現在のアカウントまたは契約状態では取り消せません。",
          onClick: () => commands.requestRevokeInvitation(item),
        }),
        buildActionInboxAction({
          enabled: item.canResend,
          label: "再送する",
          emphasis: "primary",
          disabledReason: "管理者数、招待先、または契約状態を確認してください。",
          onClick: () => commands.resendInvitation(item),
          removesItemOnSuccess: true,
          successMessage: `${item.inviteeName}さんへの管理者招待の再送を受け付けました。`,
          failureMessage: "管理者招待を再送できませんでした。",
        }),
      ],
    };
  });
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作を完了できませんでした。もう一度お試しください。";
}
