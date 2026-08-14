import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ActionInboxAction, ActionInboxItem } from "@/src/components/features/ActionInbox";
import { formatDateShort, formatDateTime } from "@/src/domains/shift/date";
import type { ActionInboxSourceItem } from "./useActionInboxData";

export type ActionInboxConfirmation =
  | {
      kind: "rejectRegistration";
      item: Extract<ActionInboxSourceItem, { kind: "staffRegistration" }>;
    }
  | {
      kind: "resolveNotification";
      item: Extract<ActionInboxSourceItem, { kind: "notificationFailure" }>;
    }
  | {
      kind: "revokeInvitation";
      item: Extract<ActionInboxSourceItem, { kind: "managerInvitation" }>;
      requestId: string;
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
  const [confirmation, setConfirmation] = useState<ActionInboxConfirmation>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [completedItemId, setCompletedItemId] = useState<string | null>(null);
  const requestIdsRef = useRef(new Map<string, string>());
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!confirmation) return;
    if (!sourceItems.some((item) => item.id === confirmation.item.id)) {
      setConfirmation(null);
      setConfirmationError(null);
    }
  }, [confirmation, sourceItems]);

  const commands = useMemo<ActionInboxCommands>(
    () => ({
      openShift: (item) =>
        void navigate({
          to: "/app/shifts/$recruitmentId/board",
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
        setConfirmation({ kind: "rejectRegistration", item });
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
        setConfirmation({ kind: "resolveNotification", item });
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
        setConfirmation({ kind: "revokeInvitation", item, requestId: crypto.randomUUID() });
      },
    }),
    [approveRequest, navigate, onRefresh, organizationId, resendFailure, resendInvitation],
  );

  const items = useMemo(() => buildActionInboxItems(sourceItems, commands), [commands, sourceItems]);

  const confirm = async () => {
    if (!confirmation || confirmingRef.current) return;
    confirmingRef.current = true;
    setIsConfirming(true);
    setConfirmationError(null);
    try {
      const completedId = confirmation.item.id;
      if (confirmation.kind === "rejectRegistration") {
        const { item } = confirmation;
        await rejectRequest({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          requestId: item.requestId,
        });
      } else if (confirmation.kind === "resolveNotification") {
        const { item } = confirmation;
        await resolveFailure({
          shopId: item.scope.kind === "shop" ? item.scope.shopId : undefined,
          expectedOrganizationId: organizationId,
          failureId: item.failureId,
        });
      } else {
        await revokeInvitation({
          organizationId,
          invitationId: confirmation.item.invitationId,
          requestId: confirmation.requestId,
        });
      }
      setCompletedItemId(completedId);
      onRefresh();
      setConfirmation(null);
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
    confirmation,
    confirmationError,
    isConfirming,
    closeConfirmation: () => {
      if (!isConfirming) {
        setConfirmation(null);
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
        statusLabel: "締切済み",
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
          { label: `締切 ${formatDateShort(item.deadline)}`, icon: "clock" },
        ],
        actions: [{ label: "シフトを組む", emphasis: "primary", onClick: () => commands.openShift(item) }],
      };
    }

    if (item.kind === "staffRegistration") {
      return {
        id: item.id,
        category: "staff",
        statusLabel: "承認待ち",
        title: `${item.applicantName}さんからスタッフ登録申請があります`,
        metadata: [
          { label: item.shopName, icon: "shop" },
          { label: `申請 ${formatDateTime(new Date(item.createdAt))}`, icon: "clock" },
        ],
        actions: [
          actionOrDisabled({
            enabled: item.canReject,
            label: "却下する",
            emphasis: "danger",
            disabledReason: "閲覧のみ、または契約制限中のため却下できません。",
            onClick: () => commands.requestRejectRegistration(item),
          }),
          actionOrDisabled({
            enabled: item.canApprove,
            label: "承認する",
            emphasis: "primary",
            disabledReason: "閲覧のみ、または契約制限中のため承認できません。",
            onClick: () => commands.approveRegistration(item),
            removesItemOnSuccess: true,
            successMessage: `${item.applicantName}さんのスタッフ登録申請を承認しました。`,
            failureMessage: "スタッフ登録申請を承認できませんでした。申請と利用人数を確認してください。",
          }),
        ],
      };
    }

    if (item.kind === "notificationFailure") {
      return {
        id: item.id,
        category: "notification",
        statusLabel: "送信失敗",
        title: `${item.staffName}さんへ${item.notificationKindLabel}を送れませんでした`,
        metadata: [
          { label: item.shopName, icon: "shop" },
          ...(item.channel
            ? [
                {
                  label: item.channel === "email" ? "メール" : "LINE",
                  ...(item.channel === "email" ? { icon: "mail" as const } : {}),
                },
              ]
            : []),
          { label: formatDateTime(new Date(item.lastFailedAt)), icon: "clock" },
        ],
        actions: [
          actionOrDisabled({
            enabled: item.canResolve,
            label: "再送せず破棄する",
            emphasis: "danger",
            disabledReason: "閲覧のみ、または契約制限中のため変更できません。",
            onClick: () => commands.requestResolveNotification(item),
          }),
          actionOrDisabled({
            enabled: item.canRetry,
            label: "再送する",
            emphasis: "primary",
            disabledReason: "連絡先または対象の状態を確認してください。",
            onClick: () => commands.resendNotification(item),
            removesItemOnSuccess: true,
            successMessage: `${item.staffName}さんへの${item.notificationKindLabel}の再送を受け付けました。`,
            failureMessage: `${item.notificationKindLabel}を再送できませんでした。`,
          }),
        ],
      };
    }

    return {
      id: item.id,
      category: "management",
      statusLabel: item.status === "sendFailed" ? "招待エラー" : item.status === "limitReached" ? "上限超過" : "要確認",
      title: `${item.inviteeName}さんへの管理者招待を確認してください`,
      metadata: [
        { label: item.invitedEmail, icon: "mail" },
        { label: formatDateTime(new Date(item.occurredAt)), icon: "clock" },
      ],
      actions: [
        actionOrDisabled({
          enabled: item.canRevoke,
          label: "取り消す",
          emphasis: "danger",
          disabledReason: "閲覧のみ、または契約制限中のため取り消せません。",
          onClick: () => commands.requestRevokeInvitation(item),
        }),
        actionOrDisabled({
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

function actionOrDisabled(args: {
  enabled: boolean;
  label: string;
  emphasis?: "primary" | "secondary" | "danger";
  disabledReason: string;
  onClick: () => void | Promise<void>;
  removesItemOnSuccess?: true;
  successMessage?: string;
  failureMessage?: string;
}): ActionInboxAction {
  if (!args.enabled) {
    return {
      label: args.label,
      emphasis: args.emphasis,
      disabled: true,
      disabledReason: args.disabledReason,
    };
  }
  if (args.removesItemOnSuccess) {
    return {
      label: args.label,
      emphasis: args.emphasis,
      onClick: args.onClick,
      removesItemOnSuccess: true,
      successMessage: args.successMessage ?? `${args.label}を受け付けました。`,
      ...(args.failureMessage ? { failureMessage: args.failureMessage } : {}),
    };
  }
  return { label: args.label, emphasis: args.emphasis, onClick: args.onClick };
}

function resolveErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "操作を完了できませんでした。もう一度お試しください。";
}
