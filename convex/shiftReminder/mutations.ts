import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";

/**
 * 未提出スタッフへの催促メール送信
 * - 募集ステータスが "open" のときのみ実行可
 * - 頻度制限なし（連打はマネージャーの判断に委ねる）
 * - lastReminderSentAt は UI に「前回送信日時」を表示する用途で記録
 * - 実送信は internalAction にスケジュール
 */
export const sendReminderEmails = managerMutation({
  args: {
    recruitmentId: v.id("recruitments"),
  },
  handler: async (ctx, args) => {
    const recruitment = await ctx.db.get(args.recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.shopId !== ctx.shop._id) {
      throw new ConvexError("Not found");
    }

    if (recruitment.status !== "open") {
      throw new ConvexError("募集中のシフトだけ、提出のお願いを送れます");
    }

    await ctx.db.patch(args.recruitmentId, {
      lastReminderSentAt: Date.now(),
    });

    await ctx.scheduler.runAfter(0, internal.shiftReminder.actions.sendReminderEmails, {
      recruitmentId: args.recruitmentId,
    });
  },
});
