export type NotificationFailureKind = "recruitment" | "reminder" | "confirmation" | "other";

export type NotificationFailureResendKind = "recruitment" | "reminder" | "confirmation" | "reissue";

export type NotificationFailureLogicalKind = NotificationFailureResendKind;

const RECRUITMENT_CONTEXTS = new Set([
  "notification.sendRecruitmentNotificationEmails",
  "notification.sendOpenRecruitmentNotificationEmailsForStaff",
  "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
  "notification.sendOpenRecruitmentNotificationsForStaff",
  "notification.sendOpenRecruitmentNotificationLinesForStaff",
]);

const CONFIRMATION_CONTEXTS = new Set([
  "notification.sendConfirmationEmail",
  "notification.sendCurrentShiftConfirmationForStaff",
]);

export function describeNotificationFailureContext(context: string): {
  kind: NotificationFailureKind;
  label: string;
} {
  if (RECRUITMENT_CONTEXTS.has(context)) return { kind: "recruitment", label: "シフト募集通知" };
  if (context === "notification.sendReminderEmails") return { kind: "reminder", label: "催促用リンク" };
  if (CONFIRMATION_CONTEXTS.has(context) || context === "notification.sendReissueEmail") {
    return { kind: "confirmation", label: "確定シフト" };
  }
  return { kind: "other", label: "通知" };
}

/**
 * 種別が "other"（ラベル「通知」）の不達は、再通知できずマネージャーが対応しようがないため、
 * Dashboard 一覧・要対応有無・日次リマインダーのいずれにも出さない。
 */
export function isManagerActionableNotificationFailure(context: string): boolean {
  return describeNotificationFailureContext(context).kind !== "other";
}

/**
 * 種別「通知」(other) 以外（= 対応可能）の通知 context の列挙。
 * ページング前に Convex の `.filter()` で絞り込むために使う（other がページを埋めて
 * 対応可能な失敗がカーソルの後ろに押し出されるのを防ぐ）。
 */
export const ACTIONABLE_NOTIFICATION_FAILURE_CONTEXTS: readonly string[] = [
  ...RECRUITMENT_CONTEXTS,
  "notification.sendReminderEmails",
  ...CONFIRMATION_CONTEXTS,
  "notification.sendReissueEmail",
];

export function getNotificationFailureResendKind(context: string): NotificationFailureResendKind | null {
  if (RECRUITMENT_CONTEXTS.has(context)) return "recruitment";
  if (context === "notification.sendReminderEmails") return "reminder";
  if (CONFIRMATION_CONTEXTS.has(context)) return "confirmation";
  if (context === "notification.sendReissueEmail") return "reissue";
  return null;
}

export function getNotificationFailureLogicalKind(context: string): NotificationFailureLogicalKind | null {
  return getNotificationFailureResendKind(context);
}
