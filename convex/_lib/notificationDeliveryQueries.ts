import { v } from "convex/values";
import { observedInternalQuery as internalQuery } from "./errorObservability";
import { isNotificationDeliverySuppressed } from "./notificationDelivery";

export const isNotificationDeliverySuppressedForShop = internalQuery({
  args: { shopId: v.id("shops") },
  returns: v.boolean(),
  handler: async () => isNotificationDeliverySuppressed(),
});
