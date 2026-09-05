import { v } from "convex/values";
import { buildShopDashboardUrl } from "../_lib/dashboardUrl";
import { formatDeadlineLabel, formatPeriodLabel, getDeadlineCutoff } from "../_lib/dateFormat";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { getRecruitmentEditVersion } from "../_lib/recruitmentEditing";
import { loadShopManagerRecipients } from "../_lib/shopManagerRecipients";
import { SHIFT_CONFIRMATION_REMINDER_MANAGER_LIMIT } from "../constants";

/**
 * シフト確定催促リマインダーの送信対象を取得する。
 * 募集が削除済み / 確定済み（status !== "open"）の場合は null を返し、発火時のガードとする。
 */
export const getManagerConfirmationReminderTarget = internalQuery({
  args: { recruitmentId: v.id("recruitments"), recruitmentVersionAtOrigin: v.optional(v.number()) },
  handler: async (ctx, { recruitmentId, recruitmentVersionAtOrigin }) => {
    const recruitment = await ctx.db.get(recruitmentId);
    if (!recruitment || recruitment.isDeleted || recruitment.status !== "open") return null;
    if (getRecruitmentEditVersion(recruitment) !== (recruitmentVersionAtOrigin ?? 0)) return null;
    if (Date.now() < getDeadlineCutoff(recruitment.deadline)) return null;

    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop || shop.isDeleted) return null;
    const organization = await ctx.db.get(shop.organizationId);
    if (!organization || organization.isDeleted) return null;

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
      dashboardUrl: buildShopDashboardUrl({
        organizationId: organization._id,
        shopId: recruitment.shopId,
      }),
      recipients,
    };
  },
});
