import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { generateDateRange, getReminderScheduledAt, todayJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { isValidIsoDateString } from "../_lib/validation";
import { RECRUITMENT_DUPLICATE_SCAN_LIMIT } from "../constants";
import { createRecruitmentSchema } from "./schemas";

const RECRUITMENT_DUPLICATE_ERROR_CODE = "RECRUITMENT_DUPLICATE";

function normalizeShopClosedDates(dates: string[], periodStart: string, periodEnd: string): string[] {
  const uniqueDates = [...new Set(dates)].sort();
  const periodDateCount = generateDateRange(periodStart, periodEnd).length;

  for (const date of uniqueDates) {
    if (!isValidIsoDateString(date)) {
      throw new ConvexError("定休日の日付形式が正しくありません");
    }
    if (date < periodStart || date > periodEnd) {
      throw new ConvexError("定休日は募集期間内の日付を選んでください");
    }
  }

  if (periodDateCount > 0 && uniqueDates.length >= periodDateCount) {
    throw new ConvexError("シフト期間のすべてを定休日にはできません");
  }

  return uniqueDates;
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export const createRecruitment = managerMutation({
  args: {
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
    shopClosedDates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const parsed = createRecruitmentSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const today = todayJST();

    if (input.deadline < today) {
      throw new ConvexError("締切日は今日以降にしてください");
    }
    if (input.periodStart <= today) {
      throw new ConvexError("開始日は明日以降にしてください");
    }
    if (input.periodEnd < input.periodStart) {
      throw new ConvexError("終了日は開始日以降にしてください");
    }
    if (input.deadline >= input.periodStart) {
      throw new ConvexError("締切日は開始日より前にしてください");
    }
    const shopClosedDates = normalizeShopClosedDates(input.shopClosedDates, input.periodStart, input.periodEnd);
    const existingRecruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
      .take(RECRUITMENT_DUPLICATE_SCAN_LIMIT);
    const duplicate = existingRecruitments.find(
      (candidate) =>
        candidate.periodStart === input.periodStart &&
        candidate.periodEnd === input.periodEnd &&
        candidate.deadline === input.deadline &&
        sameStringArray(candidate.shopClosedDates ?? [], shopClosedDates),
    );
    if (duplicate) throw new ConvexError(RECRUITMENT_DUPLICATE_ERROR_CODE);

    const now = Date.now();
    const reminderScheduledAt = getReminderScheduledAt(input.deadline);
    const shouldScheduleReminder = reminderScheduledAt > now;

    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: ctx.shop._id,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      deadline: input.deadline,
      shopClosedDates,
      status: "open",
      isDeleted: false,
      // 作成時点の店舗シフト時間帯をスナップショットとして保存
      submissionPattern: ctx.shop.submissionPattern,
      ...(shouldScheduleReminder ? { reminderScheduledAt } : {}),
    });
    const activeStaffs = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
      .collect();
    await ctx.db.insert("recruitmentStats", {
      recruitmentId,
      shopId: ctx.shop._id,
      submittedCount: 0,
      activeStaffCountSnapshot: activeStaffs.length,
      updatedAt: now,
    });

    // 募集作成はDB更新を先に完了させ、通知は action 側で LINE / email / dry-run を振り分ける。
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId,
    });
    if (shouldScheduleReminder) {
      await ctx.scheduler.runAt(reminderScheduledAt, internal.notification.reminderActions.sendReminderEmails, {
        recruitmentId,
      });
    }

    return recruitmentId;
  },
});

export const deleteRecruitment = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.shopId !== ctx.shop._id || recruitment.isDeleted) {
      throw new ConvexError("Not found");
    }

    // 周辺データは監査・集計のため残し、募集を失効させることで提出/閲覧/通知導線から外す。
    await ctx.db.patch(args.recruitmentId, { isDeleted: true });
    return null;
  },
});
