import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// LINE Quota を1日1回更新（JST 02:00 = UTC 17:00）
crons.cron("line-quota-refresh", "0 17 * * *", internal.line.actions.refreshQuotaStatus);

// スタッフ参加申請の見落とし防止通知（JST 17:00 = UTC 08:00）
crons.cron(
  "staff-registration-owner-daily-digest",
  "0 8 * * *",
  internal.staffRegistration.actions.sendOwnerDailyDigest,
);

export default crons;
