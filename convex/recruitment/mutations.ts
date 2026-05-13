import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { todayJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";

export const createRecruitment = managerMutation({
  args: {
    periodStart: v.string(),
    periodEnd: v.string(),
    deadline: v.string(),
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

    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: ctx.shop._id,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      deadline: args.deadline,
      status: "open",
      isDeleted: false,
      // 作成時点の店舗シフト時間帯をスナップショットとして保存
      // 以降の店舗設定変更があっても、この募集の時間軸は固定される
      shiftStartTime: ctx.shop.shiftStartTime,
      shiftEndTime: ctx.shop.shiftEndTime,
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
