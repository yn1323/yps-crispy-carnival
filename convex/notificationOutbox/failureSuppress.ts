/**
 * 一部の通知は補助的なもので、不達でも failureInbox（不達リカバリ UI）に載せない。
 * 通知の context 文字列で判定する。配送イベントログ（notificationDeliveryEvents）には従来どおり記録される。
 */

/** マネージャー向けシフト確定催促リマインダーの通知 context。 */
export const SHIFT_CONFIRMATION_REMINDER_CONTEXT = "shiftConfirmationReminder.sendManagerConfirmationReminder";
/** 通知不達の管理者向けリマインダー通知 context。 */
export const NOTIFICATION_FAILURE_REMINDER_CONTEXT = "notificationOutbox.sendFailureReminderDigest";
const NOTIFICATION_FAILURE_REMINDER_LINE_DEDUPE_CONTEXT = "line:notificationFailureReminder";

const SUPPRESS_FAILURE_INBOX_CONTEXTS = new Set<string>([
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  NOTIFICATION_FAILURE_REMINDER_LINE_DEDUPE_CONTEXT,
]);

/** この context の通知は failureInbox への登録をスキップするか。 */
export function shouldSuppressNotificationFailureInbox(context: string): boolean {
  return SUPPRESS_FAILURE_INBOX_CONTEXTS.has(context);
}
