/** 対象店舗に所属する管理者だけへ送る通知 context。 */
export const STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT = "staffRegistration.sendOwnerDailyDigest";
export const SHIFT_CONFIRMATION_REMINDER_CONTEXT = "shiftConfirmationReminder.sendManagerConfirmationReminder";
export const NOTIFICATION_FAILURE_REMINDER_CONTEXT = "notificationOutbox.sendFailureReminderDigest";
export const SHOP_ACTIVATION_REMINDER_CONTEXT = "shopActivationReminder.sendReminder";

const SHOP_MANAGER_NOTIFICATION_CONTEXTS = new Set<string>([
  STAFF_REGISTRATION_OWNER_DIGEST_CONTEXT,
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
]);

/** 店舗所属を配送条件に含める管理者向け通知か。 */
export function isShopManagerNotificationContext(context: string): boolean {
  return SHOP_MANAGER_NOTIFICATION_CONTEXTS.has(context);
}
