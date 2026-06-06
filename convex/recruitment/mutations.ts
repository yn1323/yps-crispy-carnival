import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { generateDateRange, todayJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { getSubmissionPattern } from "../_lib/submissionPattern";
import { RECRUITMENT_DUPLICATE_SCAN_LIMIT } from "../constants";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeShopClosedDates(dates: string[], periodStart: string, periodEnd: string): string[] {
  const uniqueDates = [...new Set(dates)].sort();
  const periodDateCount = generateDateRange(periodStart, periodEnd).length;

  for (const date of uniqueDates) {
    if (!ISO_DATE_PATTERN.test(date)) {
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
    const today = todayJST();

    if (args.deadline < today) {
      throw new ConvexError("締切日は今日以降にしてください");
    }
    if (args.periodStart <= today) {
      throw new ConvexError("開始日は明日以降にしてください");
    }
    if (args.periodEnd < args.periodStart) {
      throw new ConvexError("終了日は開始日以降にしてください");
    }
    if (args.deadline >= args.periodStart) {
      throw new ConvexError("締切日は開始日より前にしてください");
    }
    const shopClosedDates = normalizeShopClosedDates(args.shopClosedDates, args.periodStart, args.periodEnd);
    const existingRecruitments = await ctx.db
      .query("recruitments")
      .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ctx.shop._id).eq("isDeleted", false))
      .take(RECRUITMENT_DUPLICATE_SCAN_LIMIT);
    const duplicate = existingRecruitments.find(
      (candidate) =>
        candidate.periodStart === args.periodStart &&
        candidate.periodEnd === args.periodEnd &&
        candidate.deadline === args.deadline &&
        sameStringArray(candidate.shopClosedDates ?? [], shopClosedDates),
    );
    if (duplicate) return duplicate._id;

    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: ctx.shop._id,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      deadline: args.deadline,
      shopClosedDates,
      status: "open",
      isDeleted: false,
      // 作成時点の店舗シフト時間帯をスナップショットとして保存
      submissionPattern: getSubmissionPattern(ctx.shop.submissionPattern, {
        startTime: ctx.shop.shiftStartTime,
        endTime: ctx.shop.shiftEndTime,
      }),
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
      updatedAt: Date.now(),
    });

    // 募集作成はDB更新を先に完了させ、通知は action 側で LINE / email / dry-run を振り分ける。
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendRecruitmentNotificationEmails, {
      recruitmentId,
    });

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
