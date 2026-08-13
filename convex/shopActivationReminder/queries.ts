import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { buildShopDashboardUrl } from "../_lib/dashboardUrl";
import { loadShopManagerRecipientResolution } from "../_lib/shopManagerRecipients";
import { SHIFT_BOARD_STAFF_LIMIT, SHOP_ACTIVATION_REMINDER_MANAGER_LIMIT } from "../constants";
import { isShiftTargetStaff } from "../staff/service";

/**
 * 初回店舗登録後の本番募集リマインダー対象を、発火時点の状態で再判定する。
 * manager user に紐づかないシフト対象スタッフが1人でもいれば、すでに本番運用の準備が進んだものとして送らない。
 */
export const getReminderTarget = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return null;

    const [recipientResolution, activeStaffs] = await Promise.all([
      loadShopManagerRecipientResolution(ctx, shopId, SHOP_ACTIVATION_REMINDER_MANAGER_LIMIT),
      ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
        .take(SHIFT_BOARD_STAFF_LIMIT + 1),
    ]);
    if (recipientResolution.recipients.length === 0) return null;
    if (activeStaffs.length > SHIFT_BOARD_STAFF_LIMIT) return null;

    const hasStaffOtherThanManagers = activeStaffs.some(
      (staff) => isShiftTargetStaff(staff) && !recipientResolution.staffIds.has(staff._id),
    );
    if (hasStaffOtherThanManagers) return null;

    return {
      shopId,
      shopName: shop.name,
      dashboardUrl: buildShopDashboardUrl(shopId),
      recipients: recipientResolution.recipients,
    };
  },
});
