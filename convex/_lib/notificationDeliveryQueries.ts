import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { isDryRunManagerEmail } from "./notificationDelivery";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return false;

    // 通知 dry-run は店舗単位で抑止したいので、配信 action からは manager のメールを直接渡さない。
    const managerMembership = await ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .filter((q) => q.eq(q.field("role"), "manager"))
      .first();
    const manager = managerMembership ? await ctx.db.get(managerMembership.userId) : null;

    return isDryRunManagerEmail(manager?.email);
  },
});
