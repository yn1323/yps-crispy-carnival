import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// LINE Quota を1日1回更新（JST 02:00 = UTC 17:00）
crons.cron("line-quota-refresh", "0 17 * * *", internal.line.actions.refreshQuotaStatus);

// 通知outboxを1分ごとに回収する。enqueue側ではworker予約を読まず、cronを配送開始の主導線にする。
crons.interval("notification-outbox-drain", { minutes: 1 }, internal.notificationOutbox.actions.processPending, {});

// 通知配送イベントログを1日1回削除（JST 03:30 = UTC 18:30）
crons.cron(
  "notification-delivery-event-prune",
  "30 18 * * *",
  internal.notificationOutbox.mutations.pruneExpiredEvents,
);

// 通知不達Inboxを1日1回期限切れ化（JST 03:35 = UTC 18:35）
crons.cron("notification-failure-inbox-expire", "35 18 * * *", internal.notificationOutbox.mutations.expireOldFailures);

// スタッフ参加申請の見落とし防止通知（JST 17:00 = UTC 08:00）
crons.cron(
  "staff-registration-owner-daily-digest",
  "0 8 * * *",
  internal.staffRegistration.actions.sendOwnerDailyDigest,
);

export default crons;
