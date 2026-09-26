import type { StaffTimelineEventDto, StaffTimelineEventType } from "@/api/analyticsTypes";
import { deliveryStatusLabel, notificationKindLabel } from "@/features/notifications/labels";

const STAFF_TIMELINE_LABELS: Record<StaffTimelineEventType, string> = {
  staff_created: "スタッフとして登録",
  registration_requested: "参加を申請",
  registration_reviewed: "参加申請を審査",
  legal_consent_link_issued: "規約同意リンクを発行",
  legal_consent_link_used: "規約同意リンクを使用",
  legal_consented: "規約に同意",
  submit_link_issued: "提出リンクを発行",
  view_link_issued: "確定シフトの閲覧リンクを発行",
  view_link_used: "確定シフトの閲覧リンクを初めて使用",
  session_started: "画面を開いた",
  first_submitted: "希望シフトを初めて提出",
  last_submitted: "希望シフトを最後に提出",
  line_link_issued: "LINE連携リンクを発行",
  line_link_used: "LINE連携リンクを使用",
  line_linked: "LINEを連携",
  line_unlinked: "LINE連携を解除",
  line_unfollowed: "LINEの友だち解除を確認",
  notification_requested: "通知を受付",
  feature_request_sent: "要望を送信",
};
const CONSENT_METHOD_LABELS: Record<string, string> = {
  staff_email_link: "メールのリンクから",
  line_link_notice: "LINEのお知らせから",
  shift_submit: "希望シフトの提出時",
  staff_registration: "参加申請時",
};
const DELIVERY_STATUSES = {
  not_supported: true,
  unknown: true,
  delivered: true,
  delayed: true,
  failed: true,
  bounced: true,
  suppressed: true,
} as const;
const SEND_STATUS_LABELS: Record<string, string> = {
  queued: "送信待ち",
  sent: "送信済み",
  failed: "送信失敗",
  cancelled: "取消",
};

export function staffTimelineLabel(type: StaffTimelineEventType) {
  return STAFF_TIMELINE_LABELS[type];
}
/** 出来事の補足。未知の分類値はそのまま出さず、表示しない。 */
export function staffTimelineNote(event: StaffTimelineEventDto): string | null {
  switch (event.type) {
    case "registration_reviewed":
      return event.status === "approved" ? "承認" : event.status === "rejected" ? "却下" : null;
    case "legal_consented":
    case "legal_consent_link_issued":
    case "legal_consent_link_used":
      return event.detail ? (CONSENT_METHOD_LABELS[event.detail] ?? null) : null;
    case "session_started":
      return event.detail === "view" ? "確定シフトの画面" : event.detail === "submit" ? "希望シフトの提出画面" : null;
    case "notification_requested": {
      const [scope, value = ""] = (event.status ?? "").split(".");
      const status =
        scope === "send"
          ? (SEND_STATUS_LABELS[value] ?? null)
          : scope === "delivery" && value in DELIVERY_STATUSES
            ? deliveryStatusLabel(value as keyof typeof DELIVERY_STATUSES)
            : null;
      return [notificationKindLabel(event.detail ?? ""), status].filter(Boolean).join("・");
    }
    default:
      return null;
  }
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "organization.created": "組織を作成",
  "organization.deleted": "組織を削除",
  "organization.name_changed": "組織名を変更",
  "organization.billing_email_changed": "請求先メールアドレスを変更",
  "organization.shop_added": "店舗を追加",
  "organization.shop_deleted": "店舗を削除",
  "organization.person_removed_from_shop": "店舗の所属から外す",
  "organization.person_shop_memberships_changed": "人物の所属店舗を変更",
  "organization.shop_staff_memberships_changed": "店舗のスタッフ所属を変更",
  "organization.person_removed": "人物を削除",
  "organization.person_reactivated": "人物を再追加",
  "organization.person_profile_updated": "プロフィールを変更",
  "organization.person_line_disconnected": "LINE連携を解除",
  "organization.account_email_synced": "アカウントのメールアドレスを反映",
  "organization.staff_added": "スタッフを追加",
  "organization.manager_role_removed": "管理者権限を解除",
  "organization.manager_invited": "管理者を招待",
  "organization.manager_invitation_resent": "管理者招待を再送",
  "organization.manager_invitation_revoked": "管理者招待を取消",
  "organization.manager_invitation_accepted": "管理者招待を承諾",
  "organization.manager_invitation_linked": "管理者招待をアカウントと連携",
  "organization.staff_registration_link_rotated": "参加用リンクを再発行",
  "organization.free_selection_changed": "Freeプランで使う店舗・管理者を変更",
  "organization.billing_state_changed": "契約状態が変化",
};
const BILLING_STATE_LABELS: Record<string, string> = {
  trial: "トライアル",
  "trial.standard": "トライアル（Standardを選択）",
  "trial.pro": "トライアル（Proを選択）",
  initialPaymentPending: "初回支払い待ち",
  pendingActivation: "有効化待ち",
  scheduledChange: "変更予定",
  paymentTerminationPending: "支払い失敗・停止処理中",
  free: "Free",
  standard: "Standard",
  pro: "Pro",
  complimentary: "無償",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
export function auditStateLabel(state: string) {
  return BILLING_STATE_LABELS[state] ?? state;
}
