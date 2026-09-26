import {
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
  STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
} from "../notificationOutbox/shopManagerNotification";
import type { NotificationCategory } from "./dto";

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "recruitment",
  "reminder",
  "confirmation",
  "lineInvite",
  "legalConsent",
  "manager",
  "other",
];

/**
 * Outboxの`notificationContext`を問い合わせ調査用の種別へ分類する。
 * fallback emailを持たないLINE行はdedupeKey由来の`line:{kind}`になるため、その値も同じ種別に含める。
 * 一覧にないcontextは「その他」とし、画面では元のcontextを併記する。
 */
const CONTEXTS_BY_CATEGORY: Record<Exclude<NotificationCategory, "other">, readonly string[]> = {
  recruitment: [
    "notification.sendRecruitmentNotificationEmails",
    "notification.sendRecruitmentUpdateNotification",
    "notification.sendOpenRecruitmentNotificationEmailsForStaff",
    "notification.sendOpenRecruitmentNotificationEmailsForStaffEmailChange",
    "notification.sendOpenRecruitmentNotificationsForStaff",
    "notification.sendOpenRecruitmentNotificationLinesForStaff",
    "line:recruitment",
    "line:failureRetryRecruitment",
    "line:openRecruitment",
    "line:manualRecruitment",
  ],
  reminder: ["notification.sendReminderEmails"],
  confirmation: [
    "notification.sendConfirmationEmail",
    "notification.sendCurrentShiftConfirmationForStaff",
    "notification.sendReissueEmail",
    "line:confirmation",
    "line:reissue",
  ],
  lineInvite: ["line.sendInviteEmail"],
  legalConsent: ["legal.sendStaffConsentEmail", "line:legalConsent"],
  manager: [
    STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
    SHIFT_CONFIRMATION_REMINDER_CONTEXT,
    NOTIFICATION_FAILURE_REMINDER_CONTEXT,
    SHOP_ACTIVATION_REMINDER_CONTEXT,
    "line:staffRegistrationDailyDigest",
    "line:shiftConfirmationReminder",
    "line:notificationFailureReminder",
    "line:shopActivationReminder",
    "organizationInvitation.enqueueManagerInvitation",
    "organizationInvitation.linked",
    "organizationBilling.billingEmailChanged",
  ],
};

const CATEGORY_BY_CONTEXT = new Map<string, NotificationCategory>(
  Object.entries(CONTEXTS_BY_CATEGORY).flatMap(([category, contexts]) =>
    contexts.map((context) => [context, category as NotificationCategory] as const),
  ),
);

export function notificationCategory(context: string): NotificationCategory {
  return CATEGORY_BY_CONTEXT.get(context) ?? "other";
}
