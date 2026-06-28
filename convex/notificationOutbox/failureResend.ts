export type NotificationFailureKind = "recruitment" | "reminder" | "confirmation" | "lineInvite" | "other";

export type NotificationFailureResendKind = "recruitment" | "reminder" | "confirmation" | "reissue";

/** LINE連携案内メールの送信 context。再送時は新しいマジックリンク（連携トークン）を発行し直す。 */
export const LINE_INVITE_NOTIFICATION_CONTEXT = "line.sendInviteEmail";

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
  if (isLineInviteResendContext(context)) return { kind: "lineInvite", label: "LINE連携案内" };
  return { kind: "other", label: "通知" };
}

/**
 * LINE連携案内メールの不達かどうか。
 * 募集に紐づかない（recruitmentId を持たない）ため通常の再送種別とは別経路で扱い、
 * 再送時はスタッフIDから連携依頼メールを送り直す（=新しいマジックリンクを発行する）。
 */
export function isLineInviteResendContext(context: string): boolean {
  return context === LINE_INVITE_NOTIFICATION_CONTEXT;
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
  LINE_INVITE_NOTIFICATION_CONTEXT,
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
