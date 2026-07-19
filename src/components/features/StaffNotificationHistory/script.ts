import { formatDateTime } from "@/src/domains/shift/date";

export type StaffNotificationHistoryDisplayStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "delayed"
  | "failed"
  | "cancelled";

export type StaffNotificationHistoryItem = {
  _id: string;
  requestedAt: number;
  sentAt?: number;
  channel: "email" | "line";
  displayTitle: string;
  displayStatus: StaffNotificationHistoryDisplayStatus;
};

export type StaffNotificationHistoryStatusTone = "neutral" | "info" | "success" | "warning" | "danger";

type StaffNotificationHistoryPresentation = {
  dateTimeLabel: string;
  channelLabel: "メール" | "LINE";
  statusLabel: string;
  statusTone: StaffNotificationHistoryStatusTone;
};

const STATUS_PRESENTATION: Record<
  StaffNotificationHistoryDisplayStatus,
  Pick<StaffNotificationHistoryPresentation, "statusLabel" | "statusTone">
> = {
  queued: { statusLabel: "送信待ち", statusTone: "neutral" },
  sent: { statusLabel: "送信済み", statusTone: "info" },
  delivered: { statusLabel: "配信済み", statusTone: "success" },
  delayed: { statusLabel: "配信が遅れています", statusTone: "warning" },
  failed: { statusLabel: "送れませんでした", statusTone: "danger" },
  cancelled: { statusLabel: "キャンセル", statusTone: "neutral" },
};

export function getStaffNotificationHistoryPresentation(
  item: StaffNotificationHistoryItem,
): StaffNotificationHistoryPresentation {
  return {
    dateTimeLabel: formatDateTime(new Date(item.sentAt ?? item.requestedAt)),
    channelLabel: item.channel === "line" ? "LINE" : "メール",
    ...STATUS_PRESENTATION[item.displayStatus],
  };
}
