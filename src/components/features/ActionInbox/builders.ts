import { formatDateTime } from "@/src/domains/shift/date";
import type {
  ActionInboxAction,
  ActionInboxActionContext,
  NotificationActionInboxItem,
  StaffActionInboxItem,
} from "./types";

export type StaffRegistrationActionInboxData = {
  id: string;
  applicantName: string;
  shopName: string;
  createdAt: number;
  canApprove: boolean;
  approveDisabledReason?: string | null;
  canReject: boolean;
};

export type StaffRegistrationActionInboxCommands = {
  approve: () => void | Promise<void>;
  reject: (context?: ActionInboxActionContext) => void | Promise<void>;
};

export function buildStaffRegistrationActionInboxItem(
  data: StaffRegistrationActionInboxData,
  commands: StaffRegistrationActionInboxCommands,
): StaffActionInboxItem {
  return {
    id: data.id,
    category: "staff",
    statusLabel: "承認待ち",
    title: `${data.applicantName}さんからスタッフ登録申請があります`,
    metadata: [
      { label: data.shopName, icon: "shop" },
      { label: `申請 ${formatDateTime(new Date(data.createdAt))}`, icon: "clock" },
    ],
    actions: [
      actionOrDisabled({
        enabled: data.canReject,
        label: "却下する",
        emphasis: "danger",
        disabledReason: "閲覧のみ、または契約制限中のため却下できません。",
        onClick: commands.reject,
      }),
      actionOrDisabled({
        enabled: data.canApprove,
        label: "承認する",
        emphasis: "primary",
        disabledReason: data.approveDisabledReason ?? "この申請は現在承認できません。",
        onClick: commands.approve,
        removesItemOnSuccess: true,
        successMessage: `${data.applicantName}さんのスタッフ登録申請を承認しました。`,
        failureMessage: "スタッフ登録申請を承認できませんでした。申請の状態を確認して、もう一度お試しください。",
      }),
    ],
  };
}

export type NotificationFailureActionInboxData = {
  id: string;
  staffName: string;
  shopName: string;
  notificationKindLabel: string;
  channel?: "email" | "line";
  lastFailedAt: number;
  canRetry: boolean;
  canResolve: boolean;
};

export type NotificationFailureActionInboxCommands = {
  retry: () => void | Promise<void>;
  resolve: (context?: ActionInboxActionContext) => void | Promise<void>;
};

export function buildNotificationFailureActionInboxItem(
  data: NotificationFailureActionInboxData,
  commands: NotificationFailureActionInboxCommands,
): NotificationActionInboxItem {
  return {
    id: data.id,
    category: "notification",
    statusLabel: "送信失敗",
    title: `${data.staffName}さんへ${data.notificationKindLabel}を送れませんでした`,
    metadata: [
      { label: data.shopName, icon: "shop" },
      ...(data.channel
        ? [
            {
              label: data.channel === "email" ? "メール" : "LINE",
              ...(data.channel === "email" ? { icon: "mail" as const } : {}),
            },
          ]
        : []),
      { label: formatDateTime(new Date(data.lastFailedAt)), icon: "clock" },
    ],
    actions: [
      actionOrDisabled({
        enabled: data.canResolve,
        label: "再送せず破棄する",
        emphasis: "danger",
        disabledReason: "閲覧のみ、または契約制限中のため変更できません。",
        onClick: commands.resolve,
      }),
      actionOrDisabled({
        enabled: data.canRetry,
        label: "再送する",
        emphasis: "primary",
        disabledReason: "連絡先または対象の状態を確認してください。",
        onClick: commands.retry,
        removesItemOnSuccess: true,
        successMessage: `${data.staffName}さんへの${data.notificationKindLabel}の再送を受け付けました。`,
        failureMessage: `${data.notificationKindLabel}を再送できませんでした。`,
      }),
    ],
  };
}

function actionOrDisabled(args: {
  enabled: boolean;
  label: string;
  emphasis?: "primary" | "secondary" | "danger";
  disabledReason: string;
  onClick: (context?: ActionInboxActionContext) => void | Promise<void>;
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
