import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { Id } from "../_generated/dataModel";
import type { ShopManagerRecipient } from "../_lib/shopManagerRecipients";

export type ShopActivationReminderTarget = {
  shopId: Id<"shops">;
  shopName: string;
  dashboardUrl: string;
  recipients: ShopManagerRecipient[];
};

export const getReminderTargetRef = makeFunctionReference<
  "query",
  { shopId: Id<"shops"> },
  ShopActivationReminderTarget | null
>("shopActivationReminder/queries:getReminderTarget") as unknown as FunctionReference<
  "query",
  "internal",
  { shopId: Id<"shops"> },
  ShopActivationReminderTarget | null
>;

export const sendReminderRef = makeFunctionReference<"action", { shopId: Id<"shops"> }, void>(
  "shopActivationReminder/actions:sendReminder",
) as unknown as FunctionReference<"action", "internal", { shopId: Id<"shops"> }, void>;
