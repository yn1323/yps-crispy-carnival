import { v } from "convex/values";
import { internalQuery } from "../_generated/server";
import { NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT } from "../constants";
import { isDryRunManagerEmail } from "./notificationDelivery";
import { loadShopManagerContacts } from "./shopManagerRecipients";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  handler: async (ctx, { shopId }) => {
    const shop = await ctx.db.get(shopId);
    if (!shop || shop.isDeleted) return false;

    // 一人でも実運用managerがいれば配送する。行順や最初のmanagerだけで抑止を決めない。
    const managers = await loadShopManagerContacts(ctx, shopId, NOTIFICATION_DRY_RUN_MANAGER_SCAN_LIMIT);
    // 判定対象を全件確認できない時にdry-runへ倒すと実運用managerの通知を黙って落とすため、通常配送にする。
    if (managers.candidateLimitExceeded) return false;

    return (
      managers.contacts.length > 0 &&
      managers.contacts.every((manager) =>
        isDryRunManagerEmail(manager.kind === "canonical" ? manager.person.email : manager.user.email),
      )
    );
  },
});
