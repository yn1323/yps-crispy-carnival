import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT } from "../constants";
import { isDryRunManagerEmail } from "./notificationDelivery";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return false;

    // 一人でも実運用managerがいれば配送する。行順や最初のmanagerだけで抑止を決めない。
    const managerMemberships = await ctx.db
      .query("shopMembers")
      .withIndex("by_shopId_and_isDeleted", (q) => q.eq("shopId", shopId).eq("isDeleted", false))
      .filter((q) => q.eq(q.field("role"), "manager"))
      .take(NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT + 1);
    // 判定対象を全件確認できない時にdry-runへ倒すと実運用managerの通知を黙って落とすため、通常配送にする。
    if (managerMemberships.length > NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT) return false;
    const managers = (
      await Promise.all(managerMemberships.map(async (membership) => await ctx.db.get(membership.userId)))
    ).flatMap((manager) => (manager && !manager.isDeleted ? [manager] : []));

    return managers.length > 0 && managers.every((manager) => isDryRunManagerEmail(manager.email));
  },
});
