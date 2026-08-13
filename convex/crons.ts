import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { scheduleAnalyticsMaintenanceRef, scheduleDailyAnalyticsRef } from "./analytics/refs";

const crons = cronJobs();

// LINE Quota を1日1回更新（JST 02:00 = UTC 17:00）
crons.cron("line-quota-refresh", "0 17 * * *", internal.line.actions.refreshQuotaStatus);

// 通知outboxを1分ごとに回収する。enqueue側ではworker予約を読まず、cronを配送開始の主導線にする。
crons.interval("notification-outbox-drain", { minutes: 1 }, internal.notificationOutbox.actions.processPending, {});

// fanout actionの予約漏れと期限切れleaseを1分ごとに回収する。
crons.interval(
  "notification-fanout-recover",
  { minutes: 1 },
  internal.notification.mutations.recoverNotificationFanoutOperations,
  {},
);

// LINE友だち状態fanoutの予約漏れと期限切れleaseを回収する。
crons.interval(
  "line-friendship-fanout-recover",
  { minutes: 1 },
  internal.line.mutations.recoverFriendshipFanoutJobs,
  {},
);

// 削除cleanupの予約漏れと期限切れleaseを回収する。各jobはbounded mutationで一batchずつ進む。
crons.interval("deletion-cleanup-recover", { minutes: 1 }, internal.deletionCleanup.mutations.recover, {});

// アカウント削除jobの予約漏れ・期限切れleaseを1分ごとに回収する。
crons.interval("account-deletion-recover", { minutes: 1 }, internal.accountDeletion.mutations.recover, {});

// 発行時の期限予約がない既存sessionや予約漏れを期限順のbounded batchで回収する。
crons.interval("staff-session-expiry-recover", { minutes: 1 }, internal.staffAuth.mutations.recoverExpiredSessions, {});

// Stripe Webhookの予約漏れ・期限切れleaseを1分ごとに回収する。
crons.interval(
  "organization-stripe-webhook-recover",
  { minutes: 1 },
  internal.organizationStripe.maintenance.recoverWebhookEvents,
  {},
);

// 取消・請求停止・再照合のうち、安定idempotency keyを持つ期限切れoperationだけを回収する。
crons.interval(
  "organization-stripe-safe-operation-recover",
  { minutes: 1 },
  internal.organizationStripe.maintenance.recoverSafeOperations,
  {},
);

// 完了したアカウント削除jobを90日後に削除（JST 03:40 = UTC 18:40）。
crons.cron("account-deletion-prune", "40 18 * * *", internal.accountDeletion.mutations.pruneCompleted, {});

// Stripeのterminal Webhook/operationを保持期限後に削除（JST 03:45 = UTC 18:45）。
crons.cron(
  "organization-stripe-retention-prune",
  "45 18 * * *",
  internal.organizationStripe.maintenance.pruneExpiredTerminalRecords,
  {},
);

// LINE message Webhookの重複排除receiptを30日後に削除（JST 03:50 = UTC 18:50）。
crons.cron(
  "line-webhook-message-receipt-prune",
  "50 18 * * *",
  internal.line.mutations.pruneExpiredWebhookMessageReceipts,
  {},
);

// 完了・supersededのLINE友だち状態fanout jobを保持期限後に削除する。
crons.cron("line-friendship-fanout-prune", "55 18 * * *", internal.line.mutations.pruneFriendshipFanoutJobs, {});

// 通知配送イベントログを1日1回削除（JST 03:30 = UTC 18:30）
crons.cron(
  "notification-delivery-event-prune",
  "30 18 * * *",
  internal.notificationOutbox.mutations.pruneExpiredEvents,
);

// 通知不達Inboxを1日1回期限切れ化（JST 03:35 = UTC 18:35）
crons.cron("notification-failure-inbox-expire", "35 18 * * *", internal.notificationOutbox.mutations.expireOldFailures);

// terminal通知の宛先・本文・capability URL・生errorを1日1回redact（JST 03:40 = UTC 18:40）
crons.cron(
  "notification-outbox-terminal-redact",
  "40 18 * * *",
  internal.notificationOutbox.mutations.redactExpiredTerminalData,
);

// Analyticsは常時projectionせず、JST 03:00に終了済みの前日だけを集計する。
crons.cron("analytics-nightly-daily", "0 18 * * *", scheduleDailyAnalyticsRef, {});

// 日次と重ならないJST 月曜04:00（UTC 日曜19:00）にredaction、retention、参照整合性監査を行う。
crons.cron("analytics-weekly-maintenance", "0 19 * * 0", scheduleAnalyticsMaintenanceRef, {});

// スタッフ参加申請の見落とし防止通知（JST 17:00 = UTC 08:00）
crons.cron(
  "staff-registration-owner-daily-digest",
  "0 8 * * *",
  internal.staffRegistration.actions.sendOwnerDailyDigest,
  {},
);

// 通知失敗の再通知リマインダー（JST 17:00 = UTC 08:00）
crons.cron(
  "notification-failure-reminder-digest",
  "0 8 * * *",
  internal.notificationOutbox.failureReminderActions.sendFailureReminderDigest,
  {},
);

export default crons;
