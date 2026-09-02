/**
 * 一部の通知は補助的なもので、不達でも failureInbox（不達リカバリ UI）に載せない。
 * 通知の context 文字列で判定する。配送イベントログ（notificationDeliveryEvents）には従来どおり記録される。
 */

import {
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
} from "./shopManagerNotification";

export {
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
} from "./shopManagerNotification";

const NOTIFICATION_FAILURE_REMINDER_LINE_DEDUPE_CONTEXT = "line:notificationFailureReminder";

const SUPPRESS_FAILURE_INBOX_CONTEXTS = new Set<string>([
  SHIFT_CONFIRMATION_REMINDER_CONTEXT,
  NOTIFICATION_FAILURE_REMINDER_CONTEXT,
  NOTIFICATION_FAILURE_REMINDER_LINE_DEDUPE_CONTEXT,
  SHOP_ACTIVATION_REMINDER_CONTEXT,
]);

/** この context の通知は failureInbox への登録をスキップするか。 */
export function shouldSuppressNotificationFailureInbox(context: string): boolean {
  return SUPPRESS_FAILURE_INBOX_CONTEXTS.has(context);
}
