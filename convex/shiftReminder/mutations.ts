import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { managerMutation } from "../_lib/functions";
import { SUBMIT_ACTION_GUARD_WINDOW_MS } from "../constants";

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
      throw new ConvexError("募集中のシフトだけ、催促を送れます");
    }

    const now = Date.now();
    if (recruitment.lastReminderSentAt && now - recruitment.lastReminderSentAt < SUBMIT_ACTION_GUARD_WINDOW_MS) {
      return null;
    }

    await ctx.db.patch(args.recruitmentId, {
      lastReminderSentAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notification.reminderActions.sendReminderEmails, {
      recruitmentId: args.recruitmentId,
    });
  },
});
