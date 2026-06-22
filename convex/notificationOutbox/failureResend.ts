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
