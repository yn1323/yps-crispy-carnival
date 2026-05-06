import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// LINE Quota を1日1回更新（JST 02:00 = UTC 17:00）
crons.daily("line-quota-refresh", { hourUTC: 17, minuteUTC: 0 }, internal.line.actions.refreshQuotaStatus);

export default crons;
