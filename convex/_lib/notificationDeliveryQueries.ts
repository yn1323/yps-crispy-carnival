import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { isDryRunOwnerEmail } from "./notificationDelivery";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return false;

    // shop.ownerId は Clerk の subject。通知 dry-run は店舗単位で抑止したいので、
    // 配信 action からは owner のメールを直接渡さず、ここでサーバー側に閉じて解決する。
    const owner = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", shop.ownerId))
      .first();

    return isDryRunOwnerEmail(owner?.email);
  },
});
