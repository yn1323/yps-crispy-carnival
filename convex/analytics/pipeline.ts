import { ConvexError, v } from "convex/values";
import {
  observedInternalMutation as internalMutation,
  observedInternalQuery as internalQuery,
} from "../_lib/errorObservability";

const RETIRED_MESSAGE = "Analytics legacy pipeline is retired; daily collection starts automatically";

function retiredScheduledCall(entrypoint: string) {
  console.info(JSON.stringify({ event: "analytics_legacy_call_ignored", entrypoint }));
  return null;
}

function retiredManualCall(): never {
  throw new ConvexError(RETIRED_MESSAGE);
}

// Freeze deployより前に予約された旧scheduled functionを安全に吸収する一時互換stub。
// jobIdは削除予定tableのId validatorへ依存させない。
export const processJob = internalMutation({
  args: { jobId: v.string(), leaseToken: v.string() },
  handler: async () => retiredScheduledCall("processJob"),
});

export const recoverJobs = internalMutation({
  args: {},
  handler: async () => retiredScheduledCall("recoverJobs"),
});

export const ensureProjectionJob = internalMutation({
  args: {},
  handler: async () => retiredScheduledCall("ensureProjectionJob"),
});

export const startDeferredDailyAggregation = internalMutation({
  args: { date: v.string(), generation: v.string() },
  handler: async () => retiredScheduledCall("startDeferredDailyAggregation"),
});

export const schedulePreviousDay = internalMutation({
  args: {},
  handler: async () => retiredScheduledCall("schedulePreviousDay"),
});

export const scheduleRetentionCleanup = internalMutation({
  args: {},
  handler: async () => retiredScheduledCall("scheduleRetentionCleanup"),
});

export const startBootstrap = internalMutation({
  args: { generation: v.string() },
  handler: async () => retiredManualCall(),
});

export const startDailyAggregation = internalMutation({
  args: { date: v.string(), generation: v.optional(v.string()) },
  handler: async () => retiredManualCall(),
});

export const startRetentionCleanup = internalMutation({
  args: { before: v.optional(v.number()), confirmed: v.literal(true) },
  handler: async () => retiredManualCall(),
});

export const startLegacyCleanup = internalMutation({
  args: { confirmed: v.literal(true) },
  handler: async () => retiredManualCall(),
});

export const activateGeneration = internalMutation({
  args: {
    generation: v.string(),
    expectedActiveGeneration: v.optional(v.string()),
    confirmed: v.literal(true),
  },
  handler: async () => retiredManualCall(),
});

export const abandonBuildingGeneration = internalMutation({
  args: { generation: v.string(), confirmed: v.literal(true) },
  handler: async () => retiredManualCall(),
});

export const startInactiveGenerationCleanup = internalMutation({
  args: { generation: v.string(), confirmed: v.literal(true) },
  handler: async () => retiredManualCall(),
});

export const retryFailedJob = internalMutation({
  args: { jobKey: v.string(), confirmed: v.literal(true) },
  handler: async () => retiredManualCall(),
});

export const checkGenerationInvariants = internalMutation({
  args: { generation: v.string() },
  handler: async () => retiredManualCall(),
});

export const getStatus = internalQuery({
  args: { generation: v.optional(v.string()) },
  handler: async () => ({ retired: true, message: RETIRED_MESSAGE }),
});
