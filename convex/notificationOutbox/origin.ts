import type { GenericDatabaseReader } from "convex/server";
import { v } from "convex/values";
import type { DataModel, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { getOrganizationBillingState } from "../organization/service";

type DbCtx = {
  db: GenericDatabaseReader<DataModel>;
};

export const businessNotificationOriginArgs = {
  organizationBillingVersionAtOrigin: v.optional(v.number()),
};

export type BusinessNotificationOrigin = {
  organizationBillingVersionAtOrigin?: number;
};

export async function getBusinessNotificationOrigin(
  ctx: DbCtx,
  scope: {
    organizationId?: Id<"organizations">;
    shopId?: Id<"shops">;
  },
): Promise<BusinessNotificationOrigin> {
  const shop = !scope.organizationId && scope.shopId ? await ctx.db.get(scope.shopId) : null;
  const organizationId = scope.organizationId ?? shop?.organizationId;
  if (!organizationId) return {};

  const billingState = await getOrganizationBillingState(ctx, organizationId);
  return billingState ? { organizationBillingVersionAtOrigin: billingState.version } : {};
}

export function businessNotificationOriginFrom(input: BusinessNotificationOrigin): BusinessNotificationOrigin {
  return input.organizationBillingVersionAtOrigin === undefined
    ? {}
    : { organizationBillingVersionAtOrigin: input.organizationBillingVersionAtOrigin };
}

export const captureCurrentBusinessNotificationOrigin = internalQuery({
  args: {
    organizationId: v.optional(v.id("organizations")),
    shopId: v.optional(v.id("shops")),
  },
  returns: v.object(businessNotificationOriginArgs),
  handler: async (ctx, scope) => await getBusinessNotificationOrigin(ctx, scope),
});
