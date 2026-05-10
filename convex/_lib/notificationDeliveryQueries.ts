import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { isDryRunOwnerEmail } from "./notificationDelivery";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return false;

    // 通知 dry-run は店舗単位で抑止したいので、配信 action からは owner のメールを直接渡さない。
    const ownerMembership = await ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .filter((q) => q.eq(q.field("role"), "owner"))
      .first();
    const owner = ownerMembership ? await ctx.db.get(ownerMembership.userId) : null;

    return isDryRunOwnerEmail(owner?.email);
  },
});
