import type { NotificationCategory, NotificationOutboxStatus, NotificationSearchRowDto } from "@/api/analyticsTypes";

export const NOTIFICATION_STATUS_LABELS: Record<NotificationOutboxStatus, string> = {
  pending: "送信待ち",
  processing: "送信中",
  sent: "送信済み",
  failed: "送信失敗",
  cancelled: "取消",
};
export const NOTIFICATION_STATUS_COLORS: Record<NotificationOutboxStatus, string> = {
  pending: "orange",
  processing: "orange",
  sent: "green",
  failed: "red",
  cancelled: "gray",
};
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  recruitment: "シフト募集・変更",
  reminder: "提出の催促",
  confirmation: "確定シフト・URL再発行",
  lineInvite: "LINE連携案内",
  legalConsent: "規約同意の案内",
  manager: "管理者向け",
  other: "その他",
};
const CANCEL_REASON_LABELS: Record<string, string> = {
  organization_billing_changed: "契約の変更",
  organization_usage_limit_exceeded: "利用上限の超過",
  organization_inactive: "組織が無効",
  shop_deleted: "店舗の削除",
  recruitment_inactive: "募集が無効",
  notification_superseded: "新しい通知に置き換え",
  recipient_inactive: "宛先が無効",
  invitation_inactive: "招待が無効",
  unsupported_channel: "未対応の送信方法",
  invalid_scope: "対象の不整合",
};
const ERROR_CODE_LABELS: Record<string, string> = {
  line_rate_limited: "LINEの送信制限",
  line_provider_unavailable: "LINE側で送信できない状態",
  line_recipient_rejected: "LINEが宛先を受け付けない",
  line_quota_exceeded: "LINEの送信枠超過",
  line_quota_fallback_enqueued: "LINEの送信枠超過のためメールで代替",
  email_rate_limited: "メールの送信制限",
  email_provider_unavailable: "メール送信サービスで送信できない状態",
  email_recipient_rejected: "メールの宛先を受け付けない",
  email_delivery_delayed: "メールの配送遅延",
  email_delivery_failed: "メールの配送失敗",
  email_delivery_bounced: "メールの宛先不明",
  email_delivery_suppressed: "メールの配送停止リスト",
  notification_enqueue_failed: "送信予約の失敗",
  notification_preparation_failed: "送信準備の失敗",
  notification_worker_failed: "送信処理の失敗",
  notification_delivery_failed: "送信の失敗",
};
const DELIVERY_STATUS_LABELS: Record<NonNullable<NotificationSearchRowDto["deliveryStatus"]>, string> = {
  not_supported: "到達は確認できません",
  unknown: "到達未確認",
  delivered: "到達確認済み",
  delayed: "配送が遅延",
  failed: "到達失敗",
  bounced: "宛先不明",
  suppressed: "配送停止リスト",
};
const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  "shift.recruitment": "シフト募集",
  "shift.confirmation": "シフト確定",
  "line.invite": "LINE連携案内",
  "shift.reminder": "提出リマインダー",
  "shift.reissue": "シフトURL再発行",
  "legal.consent": "規約同意の案内",
};

export function cancelReasonLabel(reason: string) {
  return CANCEL_REASON_LABELS[reason] ?? reason;
}
export function errorCodeLabel(code: string) {
  return ERROR_CODE_LABELS[code] ?? code;
}
export function deliveryStatusLabel(status: NonNullable<NotificationSearchRowDto["deliveryStatus"]>) {
  return DELIVERY_STATUS_LABELS[status];
}
/** 通知履歴の種別。未知の値は種別名を推測せず「通知」とする。 */
export function notificationKindLabel(kind: string) {
  return NOTIFICATION_KIND_LABELS[kind] ?? "通知";
}
export function channelLabel(channel: "email" | "line") {
  return channel === "line" ? "LINE" : "メール";
}
