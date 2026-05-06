import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// LINE Quota を1日1回更新（JST 02:00 = UTC 17:00）
crons.cron("line-quota-refresh", "0 17 * * *", internal.line.actions.refreshQuotaStatus);

export default crons;
