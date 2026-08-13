import { v } from "convex/values";

export const deletionCleanupScopeValidator = v.union(v.literal("shop"), v.literal("organization"));

export const deletionCleanupTargetValidator = v.union(
  v.object({
    scope: v.literal("shop"),
    shopId: v.id("shops"),
    organizationId: v.optional(v.id("organizations")),
  }),
  v.object({
    scope: v.literal("organization"),
    organizationId: v.id("organizations"),
  }),
);

export const deletionCleanupStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("retrying"),
  v.literal("actionRequired"),
  v.literal("completed"),
);
