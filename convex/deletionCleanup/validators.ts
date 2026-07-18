import { v } from "convex/values";

export const deletionCleanupScopeValidator = v.union(v.literal("shop"), v.literal("organization"));

export const deletionCleanupStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("retrying"),
  v.literal("actionRequired"),
  v.literal("completed"),
);
