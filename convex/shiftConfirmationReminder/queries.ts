import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { APP_URL } from "../_lib/config";
import { formatDeadlineLabel, formatPeriodLabel } from "../_lib/dateFormat";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { SHIFT_CONFIRMATION_REMINDER_MANAGER_LIMIT } from "../constants";

/**
 * シフト確定催促リマインダーの送信対象を取得する。
 * 募集が削除済み / 確定済み（status !== "open"）の場合は null を返し、発火時のガードとする。
 */
export const getManagerConfirmationReminderTarget = internalQuery({
  args: { recruitmentId: v.id("recruitments") },
  handler: async (ctx, { recruitmentId }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;

    const recipients = await loadShopManagerRecipients(
      ctx,
      recruitment.shopId,
      SHIFT_CONFIRMATION_REMINDER_MANAGER_LIMIT,
    );
    if (recipients.length === 0) return null;

    return {
      shopId: recruitment.shopId,
      shopName: shop.name,
      periodLabel: formatPeriodLabel(recruitment.periodStart, recruitment.periodEnd),
      deadlineLabel: formatDeadlineLabel(recruitment.deadline),
      dashboardUrl: `${APP_URL}/dashboard`,
      recipients,
    };
  },
});
