import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import {
  STRIPE_OPERATION_MAX_ATTEMPTS,
  STRIPE_OPERATION_PROCESSING_LEASE_MS,
  STRIPE_OPERATION_RETENTION_MS,
  STRIPE_WEBHOOK_EVENT_RETENTION_MS,
} from "../constants";
import { STRIPE_WEBHOOK_API_VERSION } from "./config";
import {
  organizationStripeOperationKindValidator,
  organizationStripeOperationStatusValidator,
  organizationStripeSubscriptionStatusValidator,
  stripeWebhookEventTypeValidator,
  trialSubscriptionCreateSnapshotValidator,
} from "./validators";

const WEBHOOK_RETRY_BASE_MS = 30_000;
const WEBHOOK_RETRY_MAX_MS = 30 * 60_000;
const INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX = "price_inactive_subscription_pending_";
const INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE = "price_inactive_subscription_recovery_busy";
const INACTIVE_PRICE_RECOVERY_PROVIDER_RETRY_ERROR_CODE = "price_inactive_subscription_provider_retry";
const INACTIVE_PRICE_RECOVERY_WEBHOOK_RETRY_CODES = new Set([
  "price_inactive_subscription_pending",
  INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE,
  INACTIVE_PRICE_RECOVERY_PROVIDER_RETRY_ERROR_CODE,
]);
const PLAN_CHANGE_OPERATION_KINDS = [
  "previewPaidPlanChange",
  "changePaidPlanNow",
  "schedulePaidPlanChange",
  "cancelScheduledPlanChange",
  "scheduleFree",
  "cancelFreeSchedule",
] as const;
const PROVIDER_OPERATION_LOCKING_STATUSES = ["queued", "processing", "retrying", "actionRequired"] as const;

function hasInactivePriceRecoveryMarker(lastErrorCode?: string) {
  return (
    lastErrorCode?.startsWith(INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX) === true ||
    lastErrorCode === "price_inactive_subscription_not_found"
  );
}

function isInactivePriceRecoveryWebhookRetry(errorCode?: string) {
  return errorCode !== undefined && INACTIVE_PRICE_RECOVERY_WEBHOOK_RETRY_CODES.has(errorCode);
}

const operationResultValidator = v.object({
  operationId: v.id("organizationStripeOperations"),
  stripeIdempotencyKey: v.string(),
  status: organizationStripeOperationStatusValidator,
  stripeObjectId: v.optional(v.string()),
  providerGeneration: v.optional(v.number()),
  stripePriceIdSnapshot: v.optional(v.string()),
  sourcePlan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
  targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
  changeMode: v.optional(v.union(v.literal("checkout"), v.literal("immediate"), v.literal("periodEnd"))),
  stripeSubscriptionIdSnapshot: v.optional(v.string()),
  stripeSubscriptionItemIdSnapshot: v.optional(v.string()),
  sourceStripePriceIdSnapshot: v.optional(v.string()),
  targetStripePriceIdSnapshot: v.optional(v.string()),
  prorationDate: v.optional(v.number()),
  effectiveAt: v.optional(v.number()),
  leaseToken: v.optional(v.string()),
  created: v.boolean(),
  conflict: v.boolean(),
});

const inactivePriceTrialResolutionValidator = v.union(
  v.object({
    kind: v.literal("preserved"),
    providerGeneration: v.number(),
    billingConverged: v.boolean(),
    leaseToken: v.optional(v.string()),
  }),
  v.object({ kind: v.literal("cleanup"), operation: operationResultValidator }),
  v.object({ kind: v.literal("busy") }),
  v.object({ kind: v.literal("conflict") }),
);

type InvalidTrialSubscriptionCleanupArgs = {
  organizationId: Doc<"organizations">["_id"];
  sourceOperationId: Doc<"organizationStripeOperations">["_id"];
  sourceLeaseToken?: string;
  allowActiveSourceLease?: boolean;
  requestKey: string;
  stripeSubscriptionId: string;
  errorCode: string;
};

export const receiveWebhookEvent = internalMutation({
  args: {
    stripeEventId: v.string(),
    type: stripeWebhookEventTypeValidator,
    apiVersion: v.optional(v.string()),
    livemode: v.boolean(),
    expectedLivemode: v.boolean(),
    objectId: v.string(),
    objectCustomerId: v.optional(v.string()),
    eventCreatedAt: v.number(),
  },
  returns: v.object({ created: v.boolean(), processable: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (existing) {
      if (existing.livemode !== args.livemode) {
        throw new ConvexError("Stripe operation mode conflict");
      }
      return {
        created: false,
        processable: existing.status !== "actionRequired" && existing.status !== "failed",
      };
    }

    const now = Date.now();
    const configurationError =
      args.apiVersion !== STRIPE_WEBHOOK_API_VERSION
        ? "api_version_mismatch"
        : args.livemode !== args.expectedLivemode
          ? "livemode_mismatch"
          : null;
    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId: args.stripeEventId,
      type: args.type,
      ...(args.apiVersion ? { apiVersion: args.apiVersion } : {}),
      livemode: args.livemode,
      objectId: args.objectId,
      ...(args.objectCustomerId ? { objectCustomerId: args.objectCustomerId } : {}),
      eventCreatedAt: args.eventCreatedAt,
      status: configurationError ? "actionRequired" : "received",
      attemptCount: 0,
      ...(configurationError ? { lastErrorCode: configurationError } : {}),
      receivedAt: now,
      expiresAt: now + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      updatedAt: now,
    });

    if (!configurationError) {
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.processWebhookEvent, {
        stripeEventId: args.stripeEventId,
      });
    }
    return { created: true, processable: !configurationError };
  },
});

export const claimWebhookEvent = internalMutation({
  args: { stripeEventId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      stripeEventId: v.string(),
      type: stripeWebhookEventTypeValidator,
      objectId: v.string(),
      objectCustomerId: v.optional(v.string()),
      livemode: v.boolean(),
      eventCreatedAt: v.number(),
      attemptCount: v.number(),
      leaseToken: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (!event || ["processed", "ignored", "failed", "actionRequired"].includes(event.status)) return null;

    const now = Date.now();
    if (event.status === "processing" && (event.leaseExpiresAt ?? 0) > now) return null;
    if (event.nextRunAt !== undefined && event.nextRunAt > now) return null;
    if (
      event.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS &&
      !isInactivePriceRecoveryWebhookRetry(event.lastErrorCode)
    ) {
      await ctx.db.patch(event._id, {
        status: "actionRequired",
        lastErrorCode: "attempt_limit_exceeded",
        updatedAt: now,
      });
      return null;
    }

    const leaseToken = crypto.randomUUID();
    await ctx.db.patch(event._id, {
      status: "processing",
      attemptCount: event.attemptCount + 1,
      leaseToken,
      leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
      nextRunAt: undefined,
      updatedAt: now,
    });
    return {
      stripeEventId: event.stripeEventId,
      type: event.type,
      objectId: event.objectId,
      ...(event.objectCustomerId ? { objectCustomerId: event.objectCustomerId } : {}),
      livemode: event.livemode,
      eventCreatedAt: event.eventCreatedAt,
      attemptCount: event.attemptCount + 1,
      leaseToken,
    };
  },
});

export const finishWebhookEvent = internalMutation({
  args: {
    stripeEventId: v.string(),
    leaseToken: v.string(),
    result: v.union(
      v.object({
        kind: v.literal("processed"),
        organizationId: v.optional(v.id("organizations")),
        providerGeneration: v.optional(v.number()),
      }),
      v.object({ kind: v.literal("ignored"), errorCode: v.optional(v.string()) }),
      v.object({ kind: v.literal("retry"), errorCode: v.string() }),
      v.object({ kind: v.literal("failed"), errorCode: v.string() }),
      v.object({ kind: v.literal("actionRequired"), errorCode: v.string() }),
    ),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (event?.status !== "processing" || event.leaseToken !== args.leaseToken) {
      return { changed: false };
    }

    const now = Date.now();
    if (args.result.kind === "retry") {
      const retryErrorCode =
        args.result.errorCode === "stripe_temporary_error" && isInactivePriceRecoveryWebhookRetry(event.lastErrorCode)
          ? INACTIVE_PRICE_RECOVERY_PROVIDER_RETRY_ERROR_CODE
          : args.result.errorCode;
      const continueInactivePriceRecovery = isInactivePriceRecoveryWebhookRetry(retryErrorCode);
      const attemptLimitExceeded =
        event.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS && !continueInactivePriceRecovery;
      const retryDelay = Math.min(
        WEBHOOK_RETRY_BASE_MS * 2 ** Math.max(0, event.attemptCount - 1),
        WEBHOOK_RETRY_MAX_MS,
      );
      const nextRunAt = now + retryDelay;
      await ctx.db.patch(event._id, {
        status: attemptLimitExceeded ? "actionRequired" : "retrying",
        nextRunAt: attemptLimitExceeded ? undefined : nextRunAt,
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        lastErrorCode: attemptLimitExceeded ? "attempt_limit_exceeded" : retryErrorCode,
        updatedAt: now,
      });
      if (!attemptLimitExceeded) {
        await ctx.scheduler.runAt(nextRunAt, internal.organizationStripe.actions.processWebhookEvent, {
          stripeEventId: event.stripeEventId,
        });
      }
      return { changed: true };
    }

    const status = args.result.kind;
    await ctx.db.patch(event._id, {
      status,
      ...(args.result.kind === "processed" && args.result.organizationId
        ? { organizationId: args.result.organizationId }
        : {}),
      ...(args.result.kind === "processed" && args.result.providerGeneration !== undefined
        ? { providerGeneration: args.result.providerGeneration }
        : {}),
      ...(args.result.kind !== "processed" && args.result.errorCode
        ? { lastErrorCode: args.result.errorCode }
        : { lastErrorCode: undefined }),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      processedAt: now,
      updatedAt: now,
    });
    return { changed: true };
  },
});

export const beginOperation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    kind: organizationStripeOperationKindValidator,
    requestKey: v.string(),
    livemode: v.boolean(),
    expectedBillingVersion: v.optional(v.number()),
    providerGeneration: v.optional(v.number()),
    recoveryPurpose: v.optional(
      v.union(
        v.literal("trialContinuationCancellation"),
        v.literal("scheduledFreeDeadline"),
        v.literal("scheduledPaidPlanDeadline"),
      ),
    ),
    stripePriceIdSnapshot: v.optional(v.string()),
    sourcePlan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
    targetPlan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("business"))),
    changeMode: v.optional(v.union(v.literal("checkout"), v.literal("immediate"), v.literal("periodEnd"))),
    stripeSubscriptionIdSnapshot: v.optional(v.string()),
    stripeSubscriptionItemIdSnapshot: v.optional(v.string()),
    sourceStripePriceIdSnapshot: v.optional(v.string()),
    targetStripePriceIdSnapshot: v.optional(v.string()),
    prorationDate: v.optional(v.number()),
    effectiveAt: v.optional(v.number()),
    trialSubscriptionCreateSnapshot: v.optional(trialSubscriptionCreateSnapshotValidator),
  },
  returns: operationResultValidator,
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(args.requestKey)) {
      throw new ConvexError("Invalid request ID");
    }
    if (
      (args.recoveryPurpose === "trialContinuationCancellation" && args.kind !== "cancelSubscription") ||
      ((args.recoveryPurpose === "scheduledFreeDeadline" || args.recoveryPurpose === "scheduledPaidPlanDeadline") &&
        args.kind !== "reconcileSubscription")
    ) {
      throw new ConvexError("Invalid recovery purpose");
    }
    const hasTrialCreateSnapshot = args.trialSubscriptionCreateSnapshot !== undefined;
    if ((args.kind === "createTrialSubscription") !== hasTrialCreateSnapshot) {
      throw new ConvexError("Invalid trial subscription create snapshot");
    }
    if (
      args.trialSubscriptionCreateSnapshot &&
      (!args.trialSubscriptionCreateSnapshot.stripeCustomerId.startsWith("cus_") ||
        !args.trialSubscriptionCreateSnapshot.stripePaymentMethodId.startsWith("pm_") ||
        (args.trialSubscriptionCreateSnapshot.trialEndsAt !== undefined &&
          !Number.isSafeInteger(args.trialSubscriptionCreateSnapshot.trialEndsAt)))
    ) {
      throw new ConvexError("Invalid trial subscription create snapshot");
    }
    await requireStripeEligibleOrganization(ctx, args.organizationId);
    if (args.trialSubscriptionCreateSnapshot) {
      const customer = await ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique();
      if (
        !customer ||
        customer.stripeCustomerId !== args.trialSubscriptionCreateSnapshot.stripeCustomerId ||
        customer.livemode !== args.livemode
      ) {
        throw new ConvexError("Invalid trial subscription customer snapshot");
      }
    }

    const existing = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", args.kind).eq("requestKey", args.requestKey),
      )
      .unique();
    if (args.recoveryPurpose === "trialContinuationCancellation") {
      if (args.providerGeneration === undefined) {
        throw new ConvexError("Invalid recovery purpose");
      }
      const competing = await findTrialContinuationCancellationGenerationOwner(
        ctx,
        args.organizationId,
        args.providerGeneration,
        existing?._id,
      );
      if (competing) return operationResult(competing, false, true);
    }
    if (existing) {
      const immutableIntentMismatch =
        existing.livemode !== args.livemode ||
        existing.providerGeneration !== args.providerGeneration ||
        existing.recoveryPurpose !== args.recoveryPurpose ||
        existing.stripePriceIdSnapshot !== args.stripePriceIdSnapshot ||
        existing.sourcePlan !== args.sourcePlan ||
        existing.targetPlan !== args.targetPlan ||
        existing.changeMode !== args.changeMode ||
        existing.stripeSubscriptionIdSnapshot !== args.stripeSubscriptionIdSnapshot ||
        existing.stripeSubscriptionItemIdSnapshot !== args.stripeSubscriptionItemIdSnapshot ||
        existing.sourceStripePriceIdSnapshot !== args.sourceStripePriceIdSnapshot ||
        existing.targetStripePriceIdSnapshot !== args.targetStripePriceIdSnapshot ||
        existing.prorationDate !== args.prorationDate ||
        existing.effectiveAt !== args.effectiveAt ||
        !sameTrialSubscriptionCreateSnapshot(
          existing.trialSubscriptionCreateSnapshot,
          args.trialSubscriptionCreateSnapshot,
        );
      if (immutableIntentMismatch) return operationResult(existing, false, true);

      if (isPlanChangeOperationKind(args.kind)) {
        const sameRequestOperations = (
          await Promise.all(
            PLAN_CHANGE_OPERATION_KINDS.map(
              async (kind) =>
                await ctx.db
                  .query("organizationStripeOperations")
                  .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
                    q.eq("organizationId", args.organizationId).eq("kind", kind).eq("requestKey", args.requestKey),
                  )
                  .take(2),
            ),
          )
        )
          .flat()
          .filter((operation) => operation._id !== existing._id);
        if (args.kind === "changePaidPlanNow") {
          const previews = sameRequestOperations.filter((operation) => operation.kind === "previewPaidPlanChange");
          const other = sameRequestOperations.find((operation) => operation.kind !== "previewPaidPlanChange");
          if (
            other ||
            previews.length !== 1 ||
            previews[0].status !== "succeeded" ||
            !samePaidPlanChangeIntent(previews[0], args)
          ) {
            return operationResult(other ?? previews[0] ?? existing, false, true);
          }
        } else if (sameRequestOperations.length > 0) {
          return operationResult(sameRequestOperations[0], false, true);
        }

        const generationOperations = (
          await Promise.all(
            PLAN_CHANGE_OPERATION_KINDS.flatMap((kind) =>
              PROVIDER_OPERATION_LOCKING_STATUSES.map(
                async (status) =>
                  await ctx.db
                    .query("organizationStripeOperations")
                    .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
                      q
                        .eq("organizationId", args.organizationId)
                        .eq("providerGeneration", args.providerGeneration)
                        .eq("kind", kind)
                        .eq("status", status),
                    )
                    .take(2),
              ),
            ),
          )
        )
          .flat()
          .filter((operation) => operation._id !== existing._id);
        if (generationOperations.length > 0) {
          return operationResult(generationOperations[0], false, true);
        }
      }

      const now = Date.now();
      const canReclaim =
        !(args.kind === "createTrialSubscription" && hasInactivePriceRecoveryMarker(existing.lastErrorCode)) &&
        (existing.status === "retrying" ||
          (existing.status === "processing" && (existing.leaseExpiresAt ?? 0) <= now)) &&
        existing.attemptCount < STRIPE_OPERATION_MAX_ATTEMPTS;
      if (!canReclaim) return operationResult(existing, false, false);

      await ctx.db.patch(existing._id, {
        status: "processing",
        attemptCount: existing.attemptCount + 1,
        leaseToken: crypto.randomUUID(),
        leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
        nextRunAt: undefined,
        updatedAt: now,
      });
      const reclaimed = await ctx.db.get(existing._id);
      if (!reclaimed) throw new ConvexError("Operation could not be reclaimed");
      return operationResult(reclaimed, true, false);
    }

    if (isPlanChangeOperationKind(args.kind)) {
      const sameRequestOperations = (
        await Promise.all(
          PLAN_CHANGE_OPERATION_KINDS.map(
            async (kind) =>
              await ctx.db
                .query("organizationStripeOperations")
                .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
                  q.eq("organizationId", args.organizationId).eq("kind", kind).eq("requestKey", args.requestKey),
                )
                .take(2),
          ),
        )
      ).flat();
      if (args.kind === "changePaidPlanNow") {
        const previews = sameRequestOperations.filter((operation) => operation.kind === "previewPaidPlanChange");
        const other = sameRequestOperations.find((operation) => operation.kind !== "previewPaidPlanChange");
        if (
          other ||
          previews.length !== 1 ||
          previews[0].status !== "succeeded" ||
          !samePaidPlanChangeIntent(previews[0], args)
        ) {
          if (other || previews[0]) return operationResult(other ?? previews[0], false, true);
          throw new ConvexError("A successful paid plan preview is required");
        }
      } else if (sameRequestOperations.length > 0) {
        return operationResult(sameRequestOperations[0], false, true);
      }

      const generationOperations = (
        await Promise.all(
          PLAN_CHANGE_OPERATION_KINDS.flatMap((kind) =>
            PROVIDER_OPERATION_LOCKING_STATUSES.map(
              async (status) =>
                await ctx.db
                  .query("organizationStripeOperations")
                  .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
                    q
                      .eq("organizationId", args.organizationId)
                      .eq("providerGeneration", args.providerGeneration)
                      .eq("kind", kind)
                      .eq("status", status),
                  )
                  .take(2),
            ),
          ),
        )
      ).flat();
      const generationConflict = generationOperations[0];
      if (generationConflict) {
        return operationResult(generationConflict, false, true);
      }
    }

    if (
      args.kind === "trialSetupCheckout" ||
      args.kind === "immediateProCheckout" ||
      args.kind === "immediatePaidCheckout" ||
      args.kind === "createTrialSubscription"
    ) {
      const competingKinds =
        args.kind === "createTrialSubscription"
          ? (["createTrialSubscription"] as const)
          : (["trialSetupCheckout", "immediateProCheckout", "immediatePaidCheckout"] as const);
      const blockingStatuses = ["queued", "processing", "retrying", "succeeded", "actionRequired"] as const;
      const generationOperations = (
        await Promise.all(
          competingKinds.flatMap((kind) =>
            blockingStatuses.map(
              async (status) =>
                await ctx.db
                  .query("organizationStripeOperations")
                  .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
                    q
                      .eq("organizationId", args.organizationId)
                      .eq("providerGeneration", args.providerGeneration)
                      .eq("kind", kind)
                      .eq("status", status),
                  )
                  .take(2),
            ),
          ),
        )
      ).flat();
      const competing = generationOperations[0];
      if (competing) {
        // Checkoutの形が違うoperationを再利用すると、Webhook契約とStripe側の契約形が不一致になる。
        if (generationOperations.length > 1 || competing.kind !== args.kind) {
          return operationResult(competing, false, true);
        }
        const now = Date.now();
        const reclaimable =
          !(args.kind === "createTrialSubscription" && hasInactivePriceRecoveryMarker(competing.lastErrorCode)) &&
          competing.attemptCount < STRIPE_OPERATION_MAX_ATTEMPTS &&
          (competing.status === "retrying" ||
            (competing.status === "processing" && (competing.leaseExpiresAt ?? 0) <= now));
        if (reclaimable) {
          await ctx.db.patch(competing._id, {
            status: "processing",
            attemptCount: competing.attemptCount + 1,
            leaseToken: crypto.randomUUID(),
            leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
            nextRunAt: undefined,
            updatedAt: now,
          });
          const reclaimed = await ctx.db.get(competing._id);
          if (!reclaimed) throw new ConvexError("Operation could not be reclaimed");
          return operationResult(reclaimed, true, false);
        }
        return operationResult(competing, false, true);
      }
    }

    const now = Date.now();
    const idempotencyScope =
      args.kind === "createTrialSubscription" && args.providerGeneration !== undefined
        ? `generation-${args.providerGeneration}`
        : args.requestKey;
    const stripeIdempotencyKey = `shiftori:${args.livemode ? "live" : "test"}:${args.kind}:${args.organizationId}:${idempotencyScope}`;
    const operationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: args.organizationId,
      kind: args.kind,
      requestKey: args.requestKey,
      stripeIdempotencyKey,
      livemode: args.livemode,
      ...(args.expectedBillingVersion !== undefined ? { expectedBillingVersion: args.expectedBillingVersion } : {}),
      ...(args.providerGeneration !== undefined ? { providerGeneration: args.providerGeneration } : {}),
      ...(args.recoveryPurpose ? { recoveryPurpose: args.recoveryPurpose } : {}),
      ...(args.stripePriceIdSnapshot ? { stripePriceIdSnapshot: args.stripePriceIdSnapshot } : {}),
      ...(args.sourcePlan ? { sourcePlan: args.sourcePlan } : {}),
      ...(args.targetPlan ? { targetPlan: args.targetPlan } : {}),
      ...(args.changeMode ? { changeMode: args.changeMode } : {}),
      ...(args.stripeSubscriptionIdSnapshot ? { stripeSubscriptionIdSnapshot: args.stripeSubscriptionIdSnapshot } : {}),
      ...(args.stripeSubscriptionItemIdSnapshot
        ? { stripeSubscriptionItemIdSnapshot: args.stripeSubscriptionItemIdSnapshot }
        : {}),
      ...(args.sourceStripePriceIdSnapshot ? { sourceStripePriceIdSnapshot: args.sourceStripePriceIdSnapshot } : {}),
      ...(args.targetStripePriceIdSnapshot ? { targetStripePriceIdSnapshot: args.targetStripePriceIdSnapshot } : {}),
      ...(args.prorationDate !== undefined ? { prorationDate: args.prorationDate } : {}),
      ...(args.effectiveAt !== undefined ? { effectiveAt: args.effectiveAt } : {}),
      ...(args.trialSubscriptionCreateSnapshot
        ? { trialSubscriptionCreateSnapshot: args.trialSubscriptionCreateSnapshot }
        : {}),
      status: "processing",
      attemptCount: 1,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      createdAt: now,
      updatedAt: now,
    });
    const operation = await ctx.db.get(operationId);
    if (!operation) throw new ConvexError("Operation could not be created");
    return operationResult(operation, true, false);
  },
});

/** Price停止後のprovider既存object再照合だけをclaimし、Subscription作成は再実行しない。 */
export const claimInactivePriceTrialSubscriptionRecovery = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    operationId: v.id("organizationStripeOperations"),
    requestKey: v.string(),
    stripeIdempotencyKey: v.string(),
    livemode: v.boolean(),
    providerGeneration: v.number(),
    stripePriceIdSnapshot: v.string(),
    allowTerminalNotFoundRecheck: v.optional(v.boolean()),
    webhookLeaseToken: v.optional(v.string()),
  },
  returns: operationResultValidator,
  handler: async (ctx, args) => {
    await requireStripeEligibleOrganization(ctx, args.organizationId);
    const operation = await ctx.db.get(args.operationId);
    if (!operation) throw new ConvexError("Trial subscription operation not found");
    const immutableIntentMismatch =
      operation.kind !== "createTrialSubscription" ||
      operation.organizationId !== args.organizationId ||
      operation.requestKey !== args.requestKey ||
      operation.stripeIdempotencyKey !== args.stripeIdempotencyKey ||
      operation.livemode !== args.livemode ||
      operation.providerGeneration !== args.providerGeneration ||
      operation.stripePriceIdSnapshot !== args.stripePriceIdSnapshot ||
      !operation.trialSubscriptionCreateSnapshot;
    if (immutableIntentMismatch) return operationResult(operation, false, true);
    const now = Date.now();
    if (
      !(await markInactivePriceRecoveryWebhook(
        ctx,
        {
          stripeEventId: operation.requestKey,
          webhookLeaseToken: args.webhookLeaseToken,
          livemode: operation.livemode,
        },
        now,
      ))
    ) {
      return operationResult(operation, false, true);
    }
    if (operation.stripeObjectId) return operationResult(operation, false, false);

    const reclaimable =
      operation.status === "retrying" ||
      (operation.status === "actionRequired" &&
        (operation.lastErrorCode !== "price_inactive_subscription_not_found" ||
          args.allowTerminalNotFoundRecheck === true)) ||
      (operation.status === "processing" && (operation.leaseExpiresAt ?? 0) <= now);
    if (!reclaimable) return operationResult(operation, false, false);

    await ctx.db.patch(operation._id, {
      status: "processing",
      attemptCount: operation.attemptCount + 1,
      lastErrorCode: hasInactivePriceRecoveryMarker(operation.lastErrorCode)
        ? operation.lastErrorCode
        : `${INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX}0`,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
      nextRunAt: undefined,
      completedAt: undefined,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    const claimed = await ctx.db.get(operation._id);
    if (!claimed) throw new ConvexError("Operation could not be claimed");
    return operationResult(claimed, true, false);
  },
});

/** Stripe createの応答直後にobject IDを固定し、後続処理のhard crashでも回収対象を失わない。 */
export const bindTrialCreationSubscription = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    stripeSubscriptionId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      operation?.kind !== "createTrialSubscription" ||
      operation.organizationId !== args.organizationId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken ||
      (operation.stripeObjectId !== undefined && operation.stripeObjectId !== args.stripeSubscriptionId)
    ) {
      return { changed: false };
    }
    if (operation.stripeObjectId === args.stripeSubscriptionId) return { changed: true };
    await ctx.db.patch(operation._id, { stripeObjectId: args.stripeSubscriptionId, updatedAt: Date.now() });
    return { changed: true };
  },
});

/** Subscription Schedule作成直後のIDを、operation leaseの所有下で固定する。 */
export const bindPlanChangeProviderObject = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    stripeObjectId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      (operation?.kind !== "schedulePaidPlanChange" && operation?.kind !== "cancelScheduledPlanChange") ||
      operation.organizationId !== args.organizationId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken ||
      !args.stripeObjectId.startsWith("sub_sched_") ||
      (operation.stripeObjectId !== undefined && operation.stripeObjectId !== args.stripeObjectId)
    ) {
      return { changed: false };
    }
    if (operation.stripeObjectId === args.stripeObjectId) return { changed: true };
    await ctx.db.patch(operation._id, { stripeObjectId: args.stripeObjectId, updatedAt: Date.now() });
    return { changed: true };
  },
});

/**
 * 無効なTrial Subscriptionの作成元をactionRequiredにし、専用cancel operationを同一transactionで確保する。
 */
export const beginInvalidTrialSubscriptionCleanup = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceOperationId: v.id("organizationStripeOperations"),
    sourceLeaseToken: v.optional(v.string()),
    requestKey: v.string(),
    stripeSubscriptionId: v.string(),
    errorCode: v.string(),
  },
  returns: operationResultValidator,
  handler: async (ctx, args) => await beginInvalidTrialSubscriptionCleanupCore(ctx, args),
});

/**
 * Price停止と通常同期の競合を同一transactionで解決する。
 * 既に確保済みのcleanup intentを優先し、確保前に同期済みなら既存契約を保持する。
 */
export const resolveInactivePriceTrialSubscription = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    sourceOperationId: v.id("organizationStripeOperations"),
    sourceLeaseToken: v.optional(v.string()),
    allowActiveSourceLease: v.optional(v.boolean()),
    requestKey: v.string(),
    stripeSubscriptionId: v.string(),
    errorCode: v.string(),
    webhookLeaseToken: v.optional(v.string()),
  },
  returns: inactivePriceTrialResolutionValidator,
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(args.requestKey) || !args.stripeSubscriptionId.startsWith("sub_")) {
      throw new ConvexError("Invalid cleanup intent");
    }
    await requireStripeEligibleOrganization(ctx, args.organizationId);
    const source = await ctx.db.get(args.sourceOperationId);
    if (
      source?.kind !== "createTrialSubscription" ||
      source.organizationId !== args.organizationId ||
      source.stripeObjectId !== args.stripeSubscriptionId ||
      source.providerGeneration === undefined ||
      !source.stripePriceIdSnapshot ||
      !source.trialSubscriptionCreateSnapshot ||
      !source.trialSubscriptionCreateSnapshot.stripePaymentMethodId.startsWith("pm_")
    ) {
      return { kind: "conflict" as const };
    }

    const now = Date.now();
    if (
      !(await markInactivePriceRecoveryWebhook(
        ctx,
        {
          stripeEventId: source.requestKey,
          webhookLeaseToken: args.webhookLeaseToken,
          livemode: source.livemode,
        },
        now,
      ))
    ) {
      return { kind: "conflict" as const };
    }

    const existingCleanup = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", "cancelSubscription").eq("requestKey", args.requestKey),
      )
      .unique();
    if (existingCleanup) {
      return {
        kind: "cleanup" as const,
        operation: await beginInvalidTrialSubscriptionCleanupCore(ctx, args),
      };
    }

    if (
      (source.status === "processing" &&
        (source.leaseToken !== args.sourceLeaseToken ||
          ((source.leaseExpiresAt ?? 0) > now && !args.allowActiveSourceLease))) ||
      (source.status !== "processing" && source.status !== "retrying" && source.status !== "succeeded")
    ) {
      return source.status === "processing" ? { kind: "busy" as const } : { kind: "conflict" as const };
    }

    const mappings = await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
        q.eq("livemode", source.livemode).eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .take(2);
    const mapping = mappings[0];
    if (mapping) {
      const snapshot = source.trialSubscriptionCreateSnapshot;
      const exactMapping =
        mappings.length === 1 &&
        mapping.organizationId === source.organizationId &&
        mapping.stripeCustomerId === snapshot.stripeCustomerId &&
        mapping.stripePriceId === source.stripePriceIdSnapshot &&
        mapping.providerGeneration === source.providerGeneration;
      if (!exactMapping) return { kind: "conflict" as const };

      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique();
      // TODO[narrow]: 旧trialSetupCheckoutのtargetPlan欠損0と旧scheduler drainを確認後にfallbackを削除する。
      const targetPlan = source.targetPlan ?? "pro";
      const trialConverged =
        mapping.status === "trialing" &&
        mapping.terminalAt === undefined &&
        snapshot.trialEndsAt !== undefined &&
        mapping.trialEndsAt === snapshot.trialEndsAt &&
        billing?.state.kind === "trial" &&
        billing.state.selectedPaidPlan === targetPlan &&
        billing.state.trialEndsAt === snapshot.trialEndsAt;
      const activePaidPlanConverged =
        mapping.status === "active" &&
        mapping.terminalAt === undefined &&
        billing?.state.kind === "active" &&
        billing.state.plan === targetPlan;
      const billingConverged = trialConverged || activePaidPlanConverged;
      if (billingConverged && source.status !== "succeeded") {
        await ctx.db.patch(source._id, {
          status: "succeeded",
          lastErrorCode: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          nextRunAt: undefined,
          completedAt: now,
          expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
          updatedAt: now,
        });
      }
      if (billingConverged) {
        return {
          kind: "preserved" as const,
          providerGeneration: source.providerGeneration,
          billingConverged: true,
        };
      }

      const leaseToken =
        source.status === "processing" && (source.leaseExpiresAt ?? 0) > now ? source.leaseToken : crypto.randomUUID();
      if (!leaseToken) return { kind: "busy" as const };
      if (leaseToken !== source.leaseToken) {
        await ctx.db.patch(source._id, {
          status: "processing",
          attemptCount: source.attemptCount + 1,
          leaseToken,
          leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
          nextRunAt: undefined,
          completedAt: undefined,
          expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
          updatedAt: now,
        });
      }
      return {
        kind: "preserved" as const,
        providerGeneration: source.providerGeneration,
        billingConverged: false,
        leaseToken,
      };
    }

    return {
      kind: "cleanup" as const,
      operation: await beginInvalidTrialSubscriptionCleanupCore(ctx, args),
    };
  },
});

async function markInactivePriceRecoveryWebhook(
  ctx: MutationCtx,
  args: { stripeEventId: string; webhookLeaseToken?: string; livemode: boolean },
  now: number,
) {
  if (!args.webhookLeaseToken) return true;
  const event = await ctx.db
    .query("stripeWebhookEvents")
    .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
    .unique();
  if (
    event?.type !== "checkout.session.completed" ||
    event.status !== "processing" ||
    event.leaseToken !== args.webhookLeaseToken ||
    event.livemode !== args.livemode
  ) {
    return false;
  }
  await ctx.db.patch(event._id, {
    lastErrorCode: INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE,
    updatedAt: now,
  });
  return true;
}

async function beginInvalidTrialSubscriptionCleanupCore(ctx: MutationCtx, args: InvalidTrialSubscriptionCleanupArgs) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(args.requestKey) || !args.stripeSubscriptionId.startsWith("sub_")) {
    throw new ConvexError("Invalid cleanup intent");
  }
  await requireStripeEligibleOrganization(ctx, args.organizationId);
  const source = await ctx.db.get(args.sourceOperationId);
  const sourceCanBeRejected =
    source?.kind === "createTrialSubscription" &&
    source.organizationId === args.organizationId &&
    source.stripeObjectId === args.stripeSubscriptionId &&
    source.providerGeneration !== undefined &&
    source.stripePriceIdSnapshot !== undefined &&
    (source.status === "succeeded" ||
      source.status === "actionRequired" ||
      source.status === "retrying" ||
      (source.status === "processing" && source.leaseToken === args.sourceLeaseToken));
  if (!sourceCanBeRejected) throw new ConvexError("Invalid trial creation operation");

  const now = Date.now();
  const existing = await ctx.db
    .query("organizationStripeOperations")
    .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
      q.eq("organizationId", args.organizationId).eq("kind", "cancelSubscription").eq("requestKey", args.requestKey),
    )
    .unique();
  const rejectSource = async () => {
    if (source.status === "actionRequired" && source.lastErrorCode === args.errorCode) return;
    await ctx.db.patch(source._id, {
      status: "actionRequired",
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
  };
  if (existing) {
    const immutableIntentMismatch =
      existing.livemode !== source.livemode ||
      existing.providerGeneration !== source.providerGeneration ||
      existing.recoveryPurpose !== "invalidTrialSubscriptionCancellation" ||
      existing.sourceOperationId !== source._id ||
      existing.stripePriceIdSnapshot !== source.stripePriceIdSnapshot ||
      existing.stripeObjectId !== args.stripeSubscriptionId;
    if (immutableIntentMismatch) return operationResult(existing, false, true);
    await rejectSource();
    const canReclaim =
      (existing.status === "retrying" || (existing.status === "processing" && (existing.leaseExpiresAt ?? 0) <= now)) &&
      existing.attemptCount < STRIPE_OPERATION_MAX_ATTEMPTS;
    if (!canReclaim) return operationResult(existing, false, false);
    await ctx.db.patch(existing._id, {
      status: "processing",
      attemptCount: existing.attemptCount + 1,
      leaseToken: crypto.randomUUID(),
      leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
      nextRunAt: undefined,
      updatedAt: now,
    });
    const reclaimed = await ctx.db.get(existing._id);
    if (!reclaimed) throw new ConvexError("Operation could not be reclaimed");
    return operationResult(reclaimed, true, false);
  }

  const operationId = await ctx.db.insert("organizationStripeOperations", {
    organizationId: args.organizationId,
    kind: "cancelSubscription",
    requestKey: args.requestKey,
    stripeIdempotencyKey: `shiftori:${source.livemode ? "live" : "test"}:cancelSubscription:${args.organizationId}:${args.requestKey}`,
    livemode: source.livemode,
    ...(source.expectedBillingVersion !== undefined ? { expectedBillingVersion: source.expectedBillingVersion } : {}),
    providerGeneration: source.providerGeneration,
    recoveryPurpose: "invalidTrialSubscriptionCancellation",
    sourceOperationId: source._id,
    stripePriceIdSnapshot: source.stripePriceIdSnapshot,
    stripeObjectId: args.stripeSubscriptionId,
    status: "processing",
    attemptCount: 1,
    leaseToken: crypto.randomUUID(),
    leaseExpiresAt: now + STRIPE_OPERATION_PROCESSING_LEASE_MS,
    expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
    createdAt: now,
    updatedAt: now,
  });
  await rejectSource();
  const operation = await ctx.db.get(operationId);
  if (!operation) throw new ConvexError("Operation could not be created");
  return operationResult(operation, true, false);
}

/** cleanup intentのDB束縛が壊れている場合は、推測してproviderを操作せず運用確認へ送る。 */
export const terminalizeInvalidTrialCleanupBindingFailure = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    requestKey: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", "cancelSubscription").eq("requestKey", args.requestKey),
      )
      .unique();
    const now = Date.now();
    if (
      operation?.recoveryPurpose !== "invalidTrialSubscriptionCancellation" ||
      (operation.status !== "queued" &&
        operation.status !== "retrying" &&
        !(operation.status === "processing" && (operation.leaseExpiresAt ?? 0) <= now))
    ) {
      return { changed: false };
    }
    await ctx.db.patch(operation._id, {
      status: "actionRequired",
      lastErrorCode: "invalid_trial_cleanup_binding_invalid",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    return { changed: true };
  },
});

export const finishOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    status: v.union(
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("retrying"),
      v.literal("actionRequired"),
      v.literal("cancelled"),
    ),
    stripeObjectId: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation?.status !== "processing" || operation.leaseToken !== args.leaseToken) {
      return { changed: false };
    }
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: args.status,
      ...(args.stripeObjectId ? { stripeObjectId: args.stripeObjectId } : {}),
      ...(args.errorCode ? { lastErrorCode: args.errorCode } : { lastErrorCode: undefined }),
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      ...(args.status === "succeeded" ||
      args.status === "failed" ||
      args.status === "actionRequired" ||
      args.status === "cancelled"
        ? { completedAt: now, expiresAt: now + STRIPE_OPERATION_RETENTION_MS }
        : {}),
      updatedAt: now,
    });
    return { changed: true };
  },
});

export const retryExpiredGraceSafetyOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
    errorCode: v.string(),
    // TODO[narrow]: 全deploymentで旧scheduled argsがdrainし、対象operationの回復処理が収束した後にrequired化する。
    action: v.optional(
      v.union(
        v.literal("expiredGrace"),
        v.literal("initialPayment"),
        v.literal("trialContinuation"),
        v.literal("invalidTrialSubscription"),
        v.literal("scheduledFree"),
        v.literal("scheduledPaid"),
        v.literal("cancelAtPeriodEnd"),
      ),
    ),
    operationKind: v.optional(v.union(v.literal("scheduleFree"), v.literal("cancelFreeSchedule"))),
  },
  returns: v.object({ scheduled: v.boolean(), actionRequired: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      !operation ||
      operation.organizationId !== args.organizationId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken ||
      operation.requestKey !== args.requestId ||
      (args.action === "invalidTrialSubscription" &&
        (operation.kind !== "cancelSubscription" ||
          operation.recoveryPurpose !== "invalidTrialSubscriptionCancellation")) ||
      (args.action === "cancelAtPeriodEnd" && operation.kind !== args.operationKind) ||
      (args.action !== "cancelAtPeriodEnd" && args.operationKind !== undefined)
    ) {
      return { scheduled: false, actionRequired: false };
    }
    const now = Date.now();
    if (operation.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS) {
      await ctx.db.patch(operation._id, {
        status: "actionRequired",
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: now,
        expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
        updatedAt: now,
      });
      return { scheduled: false, actionRequired: true };
    }
    const delayMs = Math.min(30_000 * 2 ** Math.max(0, operation.attemptCount - 1), 30 * 60_000);
    const nextRunAt = now + delayMs;
    await ctx.db.patch(operation._id, {
      status: "retrying",
      nextRunAt,
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAt(
      nextRunAt,
      args.action === "initialPayment"
        ? internal.organizationStripe.actions.reconcileInitialPaymentPending
        : args.action === "trialContinuation"
          ? internal.organizationStripe.actions.reconcileTrialContinuationCancellation
          : args.action === "invalidTrialSubscription"
            ? internal.organizationStripe.actions.reconcileInvalidTrialSubscriptionCancellation
            : args.action === "scheduledFree"
              ? internal.organizationStripe.actions.reconcileScheduledFreeDeadline
              : args.action === "scheduledPaid"
                ? internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline
                : args.action === "cancelAtPeriodEnd"
                  ? internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange
                  : internal.organizationStripe.actions.stopExpiredGraceCollection,
      {
        organizationId: args.organizationId,
        expectedBillingVersion: args.expectedBillingVersion,
        requestId: args.requestId,
        ...(args.action === "cancelAtPeriodEnd" && args.operationKind ? { operationKind: args.operationKind } : {}),
      },
    );
    return { scheduled: true, actionRequired: false };
  },
});

export const retryBillingEmailSyncOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    requestId: v.string(),
    errorCode: v.string(),
  },
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      operation?.kind !== "syncBillingEmail" ||
      operation.organizationId !== args.organizationId ||
      operation.requestKey !== args.requestId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken
    )
      return { scheduled: false };
    const now = Date.now();
    if (operation.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS) {
      await ctx.db.patch(operation._id, {
        status: "actionRequired",
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: now,
        updatedAt: now,
      });
      return { scheduled: false };
    }
    const delayMs = Math.min(30_000 * 2 ** Math.max(0, operation.attemptCount - 1), 30 * 60_000);
    const nextRunAt = now + delayMs;
    await ctx.db.patch(operation._id, {
      status: "retrying",
      nextRunAt,
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAt(nextRunAt, internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: args.organizationId,
      requestId: args.requestId,
    });
    return { scheduled: true };
  },
});

/** 保存済みintentと同じidempotency keyで、有料プラン変更だけをdurableに再開する。 */
export const retryPaidPlanChangeOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    requestId: v.string(),
    errorCode: v.string(),
  },
  returns: v.object({ scheduled: v.boolean(), actionRequired: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      !operation ||
      (operation.kind !== "changePaidPlanNow" &&
        operation.kind !== "schedulePaidPlanChange" &&
        operation.kind !== "cancelScheduledPlanChange") ||
      operation.organizationId !== args.organizationId ||
      operation.requestKey !== args.requestId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken
    ) {
      return { scheduled: false, actionRequired: false };
    }
    const now = Date.now();
    if (operation.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS) {
      await ctx.db.patch(operation._id, {
        status: "actionRequired",
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        nextRunAt: undefined,
        completedAt: now,
        expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
        updatedAt: now,
      });
      return { scheduled: false, actionRequired: true };
    }
    const delayMs = Math.min(30_000 * 2 ** Math.max(0, operation.attemptCount - 1), 30 * 60_000);
    const nextRunAt = now + delayMs;
    await ctx.db.patch(operation._id, {
      status: "retrying",
      nextRunAt,
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      updatedAt: now,
    });
    await ctx.scheduler.runAt(nextRunAt, internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, {
      operationId: operation._id,
    });
    return { scheduled: true, actionRequired: false };
  },
});

/** 回収に必要な所有関係またはsnapshotが壊れたプラン変更を、silent retry loopへ残さない。 */
export const terminalizeInvalidPaidPlanChangeRecovery = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    errorCode: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    const now = Date.now();
    if (
      !operation ||
      (operation.kind !== "changePaidPlanNow" &&
        operation.kind !== "schedulePaidPlanChange" &&
        operation.kind !== "cancelScheduledPlanChange" &&
        operation.kind !== "scheduleFree" &&
        operation.kind !== "cancelFreeSchedule") ||
      (operation.status !== "retrying" &&
        !(operation.status === "processing" && (operation.leaseExpiresAt ?? 0) <= now))
    ) {
      return { changed: false };
    }
    await ctx.db.patch(operation._id, {
      status: "actionRequired",
      lastErrorCode: args.errorCode,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    return { changed: true };
  },
});

/** 新しい請求先メール世代へ進んだ後に、古い未完了の同期operationを残さない。 */
export const cancelSupersededBillingEmailSyncOperation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    requestId: v.string(),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(args.requestId)) return { changed: false };
    const operation = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", "syncBillingEmail").eq("requestKey", args.requestId),
      )
      .unique();
    const now = Date.now();
    const canCancel =
      operation &&
      (operation.status === "queued" ||
        operation.status === "retrying" ||
        operation.status === "actionRequired" ||
        (operation.status === "processing" && (operation.leaseExpiresAt ?? 0) <= now));
    if (!canCancel) return { changed: false };
    await ctx.db.patch(operation._id, {
      status: "cancelled",
      lastErrorCode: "superseded",
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    return { changed: true };
  },
});

/**
 * Customer更新の成功と、更新中に進んだlocal世代の補正予約を同じtransactionで確定する。
 * provider write後にActionが落ちても、同じoperationのretryまたはここで予約したrepairが最終値へ収束させる。
 */
export const completeBillingEmailSyncOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    leaseToken: v.string(),
    organizationId: v.id("organizations"),
    sentBillingEmailSyncKey: v.optional(v.string()),
    sentBillingEmailFingerprint: v.string(),
    sentOrganizationUpdatedAt: v.number(),
    sentStripeCustomerId: v.string(),
    sentProviderGeneration: v.number(),
  },
  returns: v.object({ changed: v.boolean(), repairRequestId: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      operation?.kind !== "syncBillingEmail" ||
      operation.organizationId !== args.organizationId ||
      operation.status !== "processing" ||
      operation.leaseToken !== args.leaseToken
    ) {
      return { changed: false };
    }

    const [organization, billingState, customer, latestSubscription] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
      ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", args.organizationId))
        .order("desc")
        .first(),
    ]);
    const providerGeneration = latestSubscription?.providerGeneration ?? 0;
    const currentBillingEmailFingerprint = organization?.billingEmail
      ? await sha256Hex(organization.billingEmail)
      : undefined;
    const localRevisionAdvanced =
      organization !== null &&
      (organization.billingEmailSyncKey !== args.sentBillingEmailSyncKey ||
        currentBillingEmailFingerprint !== args.sentBillingEmailFingerprint ||
        (organization.billingEmailSyncKey === undefined &&
          args.sentBillingEmailSyncKey === undefined &&
          organization.updatedAt !== args.sentOrganizationUpdatedAt));
    const providerTargetAdvanced =
      customer !== null &&
      (customer.stripeCustomerId !== args.sentStripeCustomerId ||
        customer.livemode !== operation.livemode ||
        providerGeneration !== args.sentProviderGeneration);
    const needsRepair =
      organization !== null &&
      !organization.isDeleted &&
      Boolean(organization.billingEmail) &&
      billingState !== null &&
      billingState.state.kind !== "complimentary" &&
      customer !== null &&
      (localRevisionAdvanced || providerTargetAdvanced);
    let repairRequestId: string | undefined;
    if (needsRepair && organization) {
      repairRequestId = await toAuditRequestKey(
        `${operation._id}:${organization.billingEmailSyncKey ?? organization.updatedAt}`,
      );
    }
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: "succeeded",
      stripeObjectId: args.sentStripeCustomerId,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      nextRunAt: undefined,
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    if (repairRequestId) {
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.syncBillingEmail, {
        organizationId: args.organizationId,
        requestId: repairRequestId,
        repairRequestId,
      });
    }
    return { changed: true, ...(repairRequestId ? { repairRequestId } : {}) };
  },
});

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Stripe側でexpiredを確認したCheckoutだけをsingle-flight対象から解放する。 */
export const releaseExpiredCheckoutOperation = internalMutation({
  args: {
    operationId: v.id("organizationStripeOperations"),
    stripeSessionId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (
      operation?.status !== "succeeded" ||
      operation.stripeObjectId !== args.stripeSessionId ||
      (operation.kind !== "trialSetupCheckout" &&
        operation.kind !== "immediateProCheckout" &&
        operation.kind !== "immediatePaidCheckout")
    ) {
      return { changed: false };
    }
    const now = Date.now();
    await ctx.db.patch(operation._id, {
      status: "cancelled",
      lastErrorCode: args.reason ?? "checkout_session_expired",
      completedAt: now,
      expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
      updatedAt: now,
    });
    return { changed: true };
  },
});

/** 別Webhookで目的状態へ収束済みなら、旧versionの安全operationを未完了のまま残さない。 */
export const settleResolvedSafetyOperations = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    requestKey: v.string(),
  },
  returns: v.object({ changedCount: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    let changedCount = 0;
    for (const kind of [
      "reconcileSubscription",
      "cancelSubscription",
      "stopInvoiceCollection",
      "scheduleFree",
      "cancelFreeSchedule",
    ] as const) {
      const operation = await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
          q.eq("organizationId", args.organizationId).eq("kind", kind).eq("requestKey", args.requestKey),
        )
        .unique();
      if (
        !operation ||
        (operation.status !== "queued" &&
          operation.status !== "retrying" &&
          !(operation.status === "processing" && (operation.leaseExpiresAt ?? 0) <= now))
      ) {
        continue;
      }
      await ctx.db.patch(operation._id, {
        status: "cancelled",
        lastErrorCode: "billing_already_converged",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        nextRunAt: undefined,
        completedAt: now,
        expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
        updatedAt: now,
      });
      changedCount += 1;
    }
    return { changedCount };
  },
});

export const saveCustomerMapping = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    livemode: v.boolean(),
  },
  returns: v.object({ customerId: v.id("organizationStripeCustomers"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await requireStripeEligibleOrganization(ctx, args.organizationId);
    const [byOrganization, byStripeCustomer] = await Promise.all([
      ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
      ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_livemode_and_stripeCustomerId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeCustomerId", args.stripeCustomerId),
        )
        .unique(),
    ]);
    if (byOrganization || byStripeCustomer) {
      if (
        !byOrganization ||
        !byStripeCustomer ||
        byOrganization._id !== byStripeCustomer._id ||
        byOrganization.livemode !== args.livemode
      ) {
        throw new ConvexError("Stripe customer mapping conflict");
      }
      return { customerId: byOrganization._id, created: false };
    }
    const now = Date.now();
    const customerId = await ctx.db.insert("organizationStripeCustomers", {
      organizationId: args.organizationId,
      stripeCustomerId: args.stripeCustomerId,
      livemode: args.livemode,
      createdAt: now,
      updatedAt: now,
    });
    return { customerId, created: true };
  },
});

export const saveSubscriptionSnapshot = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.optional(v.string()),
    stripePriceId: v.string(),
    plan: v.optional(v.union(v.literal("pro"), v.literal("business"))),
    livemode: v.boolean(),
    status: organizationStripeSubscriptionStatusValidator,
    providerGeneration: v.number(),
    trialEndsAt: v.optional(v.number()),
    currentPeriodStartsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    billingCycleAnchor: v.optional(v.number()),
    stripeSubscriptionScheduleId: v.optional(v.string()),
    clearStripeSubscriptionScheduleId: v.optional(v.boolean()),
    cancelAtPeriodEnd: v.boolean(),
    latestInvoiceId: v.optional(v.string()),
    eventCreatedAt: v.optional(v.number()),
    stripeEventId: v.optional(v.string()),
    syncedAt: v.number(),
    trialCreationOperationId: v.optional(v.id("organizationStripeOperations")),
    trialCreationOperationLeaseToken: v.optional(v.string()),
  },
  returns: v.object({ changed: v.boolean(), stale: v.boolean() }),
  handler: async (ctx, args) => {
    await requireStripeEligibleOrganization(ctx, args.organizationId);
    if (args.trialCreationOperationLeaseToken && !args.trialCreationOperationId) {
      throw new ConvexError("Invalid trial subscription operation guard");
    }
    if (args.trialCreationOperationId) {
      const operation = await ctx.db.get(args.trialCreationOperationId);
      const ownsSnapshot =
        operation?.kind === "createTrialSubscription" &&
        operation.organizationId === args.organizationId &&
        operation.livemode === args.livemode &&
        operation.providerGeneration === args.providerGeneration &&
        operation.stripePriceIdSnapshot === args.stripePriceId &&
        operation.stripeObjectId === args.stripeSubscriptionId &&
        operation.trialSubscriptionCreateSnapshot?.stripeCustomerId === args.stripeCustomerId &&
        (operation.status === "succeeded" ||
          (operation.status === "processing" && operation.leaseToken === args.trialCreationOperationLeaseToken));
      if (!ownsSnapshot) throw new ConvexError("Trial subscription operation no longer owns snapshot");
    }
    const customer = await ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .unique();
    if (!customer || customer.stripeCustomerId !== args.stripeCustomerId || customer.livemode !== args.livemode) {
      throw new ConvexError("Stripe customer mapping conflict");
    }
    const [existing, generationRows, latest] = await Promise.all([
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeSubscriptionId", args.stripeSubscriptionId),
        )
        .unique(),
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", args.organizationId).eq("providerGeneration", args.providerGeneration),
        )
        .take(2),
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", args.organizationId))
        .order("desc")
        .first(),
    ]);
    if (existing && existing.organizationId !== args.organizationId) {
      throw new ConvexError("Stripe subscription mapping conflict");
    }
    if (generationRows.length > 1) throw new ConvexError("Stripe subscription generation conflict");
    const byGeneration = generationRows[0];
    if (byGeneration && byGeneration.stripeSubscriptionId !== args.stripeSubscriptionId) {
      throw new ConvexError("Stripe subscription generation conflict");
    }
    if (existing && existing.providerGeneration !== args.providerGeneration) {
      throw new ConvexError("Stripe subscription generation conflict");
    }
    if (!existing && !byGeneration) {
      const expectedGeneration = latest ? latest.providerGeneration + 1 : 1;
      if ((latest && !latest.terminalAt) || args.providerGeneration !== expectedGeneration) {
        throw new ConvexError("Stripe subscription generation conflict");
      }
    }
    // Stripe Event ID is opaque and cannot break ties between events created in the same second.
    // A terminal snapshot was just refetched from Stripe, so it must converge locally even when
    // the triggering event itself is older than the last processed event.
    const providerTerminal = ["incomplete_expired", "canceled"].includes(args.status);
    if (
      existing &&
      !providerTerminal &&
      args.eventCreatedAt !== undefined &&
      existing.lastStripeEventCreatedAt !== undefined &&
      args.eventCreatedAt < existing.lastStripeEventCreatedAt
    ) {
      return { changed: false, stale: true };
    }

    const now = Date.now();
    // `unpaid` is recoverable after a late payment. Only provider-confirmed terminal
    // states close a generation; a newer non-terminal snapshot clears stale terminalAt.
    const existingProviderTerminal = existing !== null && ["incomplete_expired", "canceled"].includes(existing.status);
    const terminalAt = providerTerminal
      ? (existing?.terminalAt ?? now)
      : existingProviderTerminal
        ? existing.terminalAt
        : undefined;
    const value = {
      organizationId: args.organizationId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      ...(args.stripeSubscriptionItemId ? { stripeSubscriptionItemId: args.stripeSubscriptionItemId } : {}),
      stripePriceId: args.stripePriceId,
      ...(args.plan ? { plan: args.plan } : {}),
      livemode: args.livemode,
      status: args.status,
      providerGeneration: args.providerGeneration,
      ...(args.trialEndsAt !== undefined ? { trialEndsAt: args.trialEndsAt } : {}),
      ...(args.currentPeriodStartsAt !== undefined ? { currentPeriodStartsAt: args.currentPeriodStartsAt } : {}),
      ...(args.currentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: args.currentPeriodEndsAt } : {}),
      ...(args.billingCycleAnchor !== undefined ? { billingCycleAnchor: args.billingCycleAnchor } : {}),
      ...(args.clearStripeSubscriptionScheduleId
        ? { stripeSubscriptionScheduleId: undefined }
        : args.stripeSubscriptionScheduleId
          ? { stripeSubscriptionScheduleId: args.stripeSubscriptionScheduleId }
          : {}),
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      ...(args.latestInvoiceId ? { latestInvoiceId: args.latestInvoiceId } : {}),
      ...(args.eventCreatedAt !== undefined ? { lastStripeEventCreatedAt: args.eventCreatedAt } : {}),
      ...(args.stripeEventId ? { lastStripeEventId: args.stripeEventId } : {}),
      ...(existing ? { terminalAt } : terminalAt !== undefined ? { terminalAt } : {}),
      syncedAt: args.syncedAt,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("organizationStripeSubscriptions", { ...value, createdAt: now });
    }
    return { changed: true, stale: false };
  },
});

function operationResult(operation: Doc<"organizationStripeOperations">, created: boolean, conflict: boolean) {
  return {
    operationId: operation._id,
    stripeIdempotencyKey: operation.stripeIdempotencyKey,
    status: operation.status,
    ...(operation.stripeObjectId ? { stripeObjectId: operation.stripeObjectId } : {}),
    ...(operation.providerGeneration !== undefined ? { providerGeneration: operation.providerGeneration } : {}),
    ...(operation.stripePriceIdSnapshot ? { stripePriceIdSnapshot: operation.stripePriceIdSnapshot } : {}),
    ...(operation.sourcePlan ? { sourcePlan: operation.sourcePlan } : {}),
    ...(operation.targetPlan ? { targetPlan: operation.targetPlan } : {}),
    ...(operation.changeMode ? { changeMode: operation.changeMode } : {}),
    ...(operation.stripeSubscriptionIdSnapshot
      ? { stripeSubscriptionIdSnapshot: operation.stripeSubscriptionIdSnapshot }
      : {}),
    ...(operation.stripeSubscriptionItemIdSnapshot
      ? { stripeSubscriptionItemIdSnapshot: operation.stripeSubscriptionItemIdSnapshot }
      : {}),
    ...(operation.sourceStripePriceIdSnapshot
      ? { sourceStripePriceIdSnapshot: operation.sourceStripePriceIdSnapshot }
      : {}),
    ...(operation.targetStripePriceIdSnapshot
      ? { targetStripePriceIdSnapshot: operation.targetStripePriceIdSnapshot }
      : {}),
    ...(operation.prorationDate !== undefined ? { prorationDate: operation.prorationDate } : {}),
    ...(operation.effectiveAt !== undefined ? { effectiveAt: operation.effectiveAt } : {}),
    ...(operation.leaseToken ? { leaseToken: operation.leaseToken } : {}),
    created,
    conflict,
  };
}

function isPlanChangeOperationKind(
  kind: Doc<"organizationStripeOperations">["kind"],
): kind is (typeof PLAN_CHANGE_OPERATION_KINDS)[number] {
  return PLAN_CHANGE_OPERATION_KINDS.includes(kind as (typeof PLAN_CHANGE_OPERATION_KINDS)[number]);
}

async function findTrialContinuationCancellationGenerationOwner(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Doc<"organizations">["_id"],
  providerGeneration: number,
  excludeOperationId?: Doc<"organizationStripeOperations">["_id"],
) {
  const operations = (
    await Promise.all(
      PROVIDER_OPERATION_LOCKING_STATUSES.map(
        async (status) =>
          await ctx.db
            .query("organizationStripeOperations")
            .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("providerGeneration", providerGeneration)
                .eq("kind", "cancelSubscription")
                .eq("status", status),
            )
            .take(2),
      ),
    )
  ).flat();
  return operations.find((operation) => operation._id !== excludeOperationId);
}

/** 見積もりから実適用へ進む同一intentだけは、同じrequestIdを引き継げる。 */
function samePaidPlanChangeIntent(
  operation: Doc<"organizationStripeOperations">,
  args: {
    livemode: boolean;
    expectedBillingVersion?: number;
    providerGeneration?: number;
    sourcePlan?: "pro" | "business";
    targetPlan?: "free" | "pro" | "business";
    changeMode?: "checkout" | "immediate" | "periodEnd";
    stripeSubscriptionIdSnapshot?: string;
    stripeSubscriptionItemIdSnapshot?: string;
    sourceStripePriceIdSnapshot?: string;
    targetStripePriceIdSnapshot?: string;
    prorationDate?: number;
  },
) {
  return (
    operation.livemode === args.livemode &&
    operation.expectedBillingVersion === args.expectedBillingVersion &&
    operation.providerGeneration === args.providerGeneration &&
    operation.sourcePlan === args.sourcePlan &&
    operation.targetPlan === args.targetPlan &&
    operation.changeMode === args.changeMode &&
    operation.stripeSubscriptionIdSnapshot === args.stripeSubscriptionIdSnapshot &&
    operation.stripeSubscriptionItemIdSnapshot === args.stripeSubscriptionItemIdSnapshot &&
    operation.sourceStripePriceIdSnapshot === args.sourceStripePriceIdSnapshot &&
    operation.targetStripePriceIdSnapshot === args.targetStripePriceIdSnapshot &&
    operation.prorationDate === args.prorationDate
  );
}

function sameTrialSubscriptionCreateSnapshot(
  left: Doc<"organizationStripeOperations">["trialSubscriptionCreateSnapshot"],
  right: Doc<"organizationStripeOperations">["trialSubscriptionCreateSnapshot"],
) {
  if (!left || !right) return left === right;
  return (
    left.stripeCustomerId === right.stripeCustomerId &&
    left.stripePaymentMethodId === right.stripePaymentMethodId &&
    left.trialEndsAt === right.trialEndsAt
  );
}

async function requireStripeEligibleOrganization(
  ctx: Pick<MutationCtx, "db">,
  organizationId: Doc<"organizations">["_id"],
) {
  const [organization, billingState] = await Promise.all([
    ctx.db.get(organizationId),
    ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
  ]);
  if (!organization || organization.isDeleted || !billingState) throw new ConvexError("Not found");
  if (billingState.state.kind === "complimentary") {
    throw new ConvexError("支払い不要プランではStripeを利用しません。");
  }
  return { organization, billingState };
}
