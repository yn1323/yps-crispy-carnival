import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { STRIPE_OPERATION_MAX_ATTEMPTS, STRIPE_OPERATION_RETENTION_MS } from "../constants";
import { hasLegacyBusinessBillingState } from "../organizationBilling/policy";
import { organizationStripeOperationStatusValidator, stripeWebhookEventStatusValidator } from "./validators";

const WEBHOOK_RECOVERY_BATCH_SIZE = 50;
const WEBHOOK_RECOVERY_SCAN_LIMIT_PER_STATUS = 200;
const WEBHOOK_RECEIVED_STALE_MS = 5 * 60_000;
const SAFE_OPERATION_RECOVERY_BATCH_SIZE = 50;
const SAFE_OPERATION_RECOVERY_SCAN_LIMIT_PER_KIND = 100;
const RETENTION_PRUNE_BATCH_SIZE = 100;
const SAFETY_FINALIZATION_EVIDENCE_RECHECK_MS = 24 * 60 * 60_000;
const PROBE_LIMIT_PER_STATUS = 100;
const PROBE_ORGANIZATION_LIMIT = 100;
const PROBE_SUBSCRIPTION_LIMIT = 500;
const PROBE_CUSTOMER_LIMIT = 500;
const PROBE_RELATIONSHIP_LIMIT = 100;
const M018_DUPLICATE_BILLING_STATES_CONFLICT = "billing_business_to_pro_ambiguous_billing_states";

const WEBHOOK_STATUSES = [
  "received",
  "processing",
  "retrying",
  "processed",
  "ignored",
  "failed",
  "actionRequired",
] as const;
const OPERATION_STATUSES = [
  "queued",
  "processing",
  "retrying",
  "succeeded",
  "failed",
  "actionRequired",
  "cancelled",
] as const;
const UNPROCESSED_WEBHOOK_STATUSES = ["received", "processing", "retrying"] as const;
const UNFINISHED_OPERATION_STATUSES = ["queued", "processing", "retrying"] as const;
const RECOVERABLE_SAFE_OPERATION_KINDS = [
  "reconcileSubscription",
  "cancelSubscription",
  "stopInvoiceCollection",
  "syncBillingEmail",
  "scheduleFree",
  "cancelFreeSchedule",
  "changePaidPlanNow",
  "schedulePaidPlanChange",
  "cancelScheduledPlanChange",
] as const satisfies readonly Doc<"organizationStripeOperations">["kind"][];
const TERMINAL_WEBHOOK_STATUSES = [
  "processed",
  "ignored",
  "failed",
  "actionRequired",
] as const satisfies readonly Doc<"stripeWebhookEvents">["status"][];
const TERMINAL_OPERATION_STATUSES = [
  "succeeded",
  "failed",
  "actionRequired",
  "cancelled",
] as const satisfies readonly Doc<"organizationStripeOperations">["status"][];
const observedStatusValidator = v.object({
  status: v.union(stripeWebhookEventStatusValidator, organizationStripeOperationStatusValidator),
  observedCount: v.number(),
  hasMore: v.boolean(),
  oldestObservedUpdatedAt: v.optional(v.number()),
});

const boundedCountValidator = v.object({
  observedCount: v.number(),
  hasMore: v.boolean(),
});

const legacyBusinessStateValidator = v.object({
  billingStateId: v.id("organizationBillingStates"),
  organizationId: v.id("organizations"),
  stateKind: v.string(),
});

/** 全pageを走査したときだけ、legacy Businessが0件であることを証明できる運用query。 */
export const verifyLegacyBusinessStates = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    legacyBusinessStates: v.array(legacyBusinessStateValidator),
    legacyBusinessCount: v.number(),
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("organizationBillingStates").paginate(args.paginationOpts);
    const legacyBusinessStates = result.page
      .filter((billing) => hasLegacyBusinessBillingState(billing.state))
      .map((billing) => ({
        billingStateId: billing._id,
        organizationId: billing.organizationId,
        stateKind: billing.state.kind,
      }));

    return {
      legacyBusinessStates,
      legacyBusinessCount: legacyBusinessStates.length,
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/**
 * 予約漏れまたは期限切れleaseのWebhookだけを再予約する。
 *
 * Stripeへの副作用を同じidempotency keyで安全に再開できる証拠がないため、
 * organizationStripeOperationsはここでは回収しない。
 */
export const recoverWebhookEvents = internalMutation({
  args: {},
  returns: v.object({
    scheduledCount: v.number(),
    scheduledByStatus: v.object({
      received: v.number(),
      processing: v.number(),
      retrying: v.number(),
    }),
    reachedBatchLimit: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [received, processing, retrying] = await Promise.all([
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "received"))
        .take(WEBHOOK_RECOVERY_SCAN_LIMIT_PER_STATUS),
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "processing"))
        .take(WEBHOOK_RECOVERY_SCAN_LIMIT_PER_STATUS),
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "retrying"))
        .take(WEBHOOK_RECOVERY_SCAN_LIMIT_PER_STATUS),
    ]);

    const candidates = [
      ...received
        .filter((event) => event.updatedAt <= now - WEBHOOK_RECEIVED_STALE_MS)
        .map((event) => ({
          event,
          readyAt: event.updatedAt + WEBHOOK_RECEIVED_STALE_MS,
          sourceStatus: "received" as const,
        })),
      ...processing
        .filter((event) => event.leaseExpiresAt === undefined || event.leaseExpiresAt <= now)
        .map((event) => ({
          event,
          readyAt: event.leaseExpiresAt ?? event.updatedAt,
          sourceStatus: "processing" as const,
        })),
      ...retrying
        .filter((event) => event.nextRunAt === undefined || event.nextRunAt <= now)
        .map((event) => ({
          event,
          readyAt: event.nextRunAt ?? event.updatedAt,
          sourceStatus: "retrying" as const,
        })),
    ]
      .sort((left, right) => left.readyAt - right.readyAt || left.event._creationTime - right.event._creationTime)
      .slice(0, WEBHOOK_RECOVERY_BATCH_SIZE);

    const scheduledByStatus = { received: 0, processing: 0, retrying: 0 };
    for (const { event, sourceStatus } of candidates) {
      scheduledByStatus[sourceStatus] += 1;
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.processWebhookEvent, {
        stripeEventId: event.stripeEventId,
      });
    }

    return {
      scheduledCount: candidates.length,
      scheduledByStatus,
      reachedBatchLimit: candidates.length === WEBHOOK_RECOVERY_BATCH_SIZE,
    };
  },
});

/** 安定したStripe idempotency keyで再開できる有料プラン変更・取消・請求停止・再照合・請求先メール同期だけを回収する。 */
export const recoverSafeOperations = internalMutation({
  args: {},
  returns: v.object({
    scheduledCount: v.number(),
    scheduledByKind: v.object({
      reconcileSubscription: v.number(),
      cancelSubscription: v.number(),
      stopInvoiceCollection: v.number(),
      syncBillingEmail: v.number(),
      scheduleFree: v.number(),
      cancelFreeSchedule: v.number(),
      changePaidPlanNow: v.number(),
      schedulePaidPlanChange: v.number(),
      cancelScheduledPlanChange: v.number(),
    }),
    terminalizedWithoutDispatchCount: v.number(),
    reachedBatchLimit: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const candidateGroups = await Promise.all(
      RECOVERABLE_SAFE_OPERATION_KINDS.map(async (kind) => {
        const [processing, retrying] = await Promise.all([
          ctx.db
            .query("organizationStripeOperations")
            .withIndex("by_kind_and_status_and_leaseExpiresAt", (q) =>
              q.eq("kind", kind).eq("status", "processing").lte("leaseExpiresAt", now),
            )
            .take(SAFE_OPERATION_RECOVERY_SCAN_LIMIT_PER_KIND),
          ctx.db
            .query("organizationStripeOperations")
            .withIndex("by_kind_and_status_and_nextRunAt", (q) =>
              q.eq("kind", kind).eq("status", "retrying").lte("nextRunAt", now),
            )
            .take(SAFE_OPERATION_RECOVERY_SCAN_LIMIT_PER_KIND),
        ]);
        const queued =
          kind === "syncBillingEmail"
            ? []
            : await ctx.db
                .query("organizationStripeOperations")
                .withIndex("by_kind_and_status_and_nextRunAt", (q) => q.eq("kind", kind).eq("status", "queued"))
                .take(SAFE_OPERATION_RECOVERY_SCAN_LIMIT_PER_KIND);
        return [...queued, ...processing, ...retrying];
      }),
    );
    const candidates = candidateGroups
      .flat()
      .sort(
        (left, right) =>
          (left.nextRunAt ?? left.leaseExpiresAt ?? left.updatedAt) -
            (right.nextRunAt ?? right.leaseExpiresAt ?? right.updatedAt) || left._creationTime - right._creationTime,
      )
      .slice(0, SAFE_OPERATION_RECOVERY_BATCH_SIZE);

    const scheduledByKind = {
      reconcileSubscription: 0,
      cancelSubscription: 0,
      stopInvoiceCollection: 0,
      syncBillingEmail: 0,
      scheduleFree: 0,
      cancelFreeSchedule: 0,
      changePaidPlanNow: 0,
      schedulePaidPlanChange: 0,
      cancelScheduledPlanChange: 0,
    };
    let scheduledCount = 0;
    let terminalizedWithoutDispatchCount = 0;

    for (const operation of candidates) {
      if (
        operation.kind !== "reconcileSubscription" &&
        operation.kind !== "cancelSubscription" &&
        operation.kind !== "stopInvoiceCollection" &&
        operation.kind !== "syncBillingEmail" &&
        operation.kind !== "scheduleFree" &&
        operation.kind !== "cancelFreeSchedule" &&
        operation.kind !== "changePaidPlanNow" &&
        operation.kind !== "schedulePaidPlanChange" &&
        operation.kind !== "cancelScheduledPlanChange"
      ) {
        continue;
      }
      if (operation.attemptCount >= STRIPE_OPERATION_MAX_ATTEMPTS) {
        await terminalizeRecoveryCandidate(ctx, operation, now, "attempt_limit_exceeded");
        terminalizedWithoutDispatchCount += 1;
        continue;
      }
      const billingStates = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", operation.organizationId))
        .take(2);
      const billing = billingStates.length === 1 ? billingStates[0] : undefined;
      if (!billing) {
        await terminalizeRecoveryCandidate(ctx, operation, now, "billing_binding_invalid");
        terminalizedWithoutDispatchCount += 1;
        continue;
      }

      if (operation.status === "queued") {
        await ctx.db.patch(operation._id, {
          status: "retrying",
          nextRunAt: now,
          updatedAt: now,
        });
      }

      if (operation.kind === "syncBillingEmail") {
        await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.syncBillingEmail, {
          organizationId: operation.organizationId,
          requestId: operation.requestKey,
        });
      } else if (operation.kind === "scheduleFree" || operation.kind === "cancelFreeSchedule") {
        await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange, {
          organizationId: operation.organizationId,
          expectedBillingVersion: operation.expectedBillingVersion ?? billing.version,
          requestId: operation.requestKey,
          operationKind: operation.kind,
        });
      } else if (
        operation.kind === "changePaidPlanNow" ||
        operation.kind === "schedulePaidPlanChange" ||
        operation.kind === "cancelScheduledPlanChange"
      ) {
        await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, {
          operationId: operation._id,
        });
      } else {
        const actionArgs = {
          organizationId: operation.organizationId,
          expectedBillingVersion: billing.version,
          requestId: operation.requestKey,
        };
        if (operation.kind === "reconcileSubscription" && billing.state.kind === "initialPaymentPending") {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileInitialPaymentPending,
            actionArgs,
          );
        } else if (
          operation.kind === "reconcileSubscription" &&
          operation.recoveryPurpose === "scheduledFreeDeadline"
        ) {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileScheduledFreeDeadline,
            actionArgs,
          );
        } else if (
          operation.kind === "reconcileSubscription" &&
          operation.recoveryPurpose === "scheduledPaidPlanDeadline"
        ) {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline,
            actionArgs,
          );
        } else if (
          operation.kind === "cancelSubscription" &&
          operation.recoveryPurpose === "invalidTrialSubscriptionCancellation"
        ) {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileInvalidTrialSubscriptionCancellation,
            actionArgs,
          );
        } else if (
          operation.kind === "cancelSubscription" &&
          operation.recoveryPurpose === "trialContinuationCancellation"
        ) {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileTrialContinuationCancellation,
            actionArgs,
          );
        } else if (
          billing.state.kind === "grace" ||
          (billing.state.kind === "restricted" && billing.state.reason === "paymentGraceExpired")
        ) {
          await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.stopExpiredGraceCollection, actionArgs);
        } else if (operation.kind === "reconcileSubscription") {
          await ctx.scheduler.runAfter(
            0,
            internal.organizationStripe.actions.reconcileInitialPaymentPending,
            actionArgs,
          );
        } else {
          await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.stopExpiredGraceCollection, actionArgs);
        }
      }

      scheduledByKind[operation.kind] += 1;
      scheduledCount += 1;
    }

    return {
      scheduledCount,
      scheduledByKind,
      terminalizedWithoutDispatchCount,
      reachedBatchLimit: candidates.length === SAFE_OPERATION_RECOVERY_BATCH_SIZE,
    };
  },
});

async function terminalizeRecoveryCandidate(
  ctx: MutationCtx,
  operation: Doc<"organizationStripeOperations">,
  now: number,
  errorCode: "attempt_limit_exceeded" | "billing_binding_invalid",
) {
  await ctx.db.patch(operation._id, {
    status: "actionRequired",
    lastErrorCode: errorCode,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
    nextRunAt: undefined,
    completedAt: now,
    expiresAt: now + STRIPE_OPERATION_RETENTION_MS,
    updatedAt: now,
  });
}

async function hasUniqueTerminalSubscriptionEvidence(ctx: MutationCtx, operation: Doc<"organizationStripeOperations">) {
  if (!operation.stripeObjectId || operation.providerGeneration === undefined) return false;
  const stripeSubscriptionId = operation.stripeObjectId;
  const subscriptions = await ctx.db
    .query("organizationStripeSubscriptions")
    .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
      q.eq("livemode", operation.livemode).eq("stripeSubscriptionId", stripeSubscriptionId),
    )
    .take(2);
  if (subscriptions.length !== 1) return false;
  const subscription = subscriptions[0];
  return (
    subscription.organizationId === operation.organizationId &&
    subscription.providerGeneration === operation.providerGeneration &&
    (subscription.status === "canceled" || subscription.status === "incomplete_expired") &&
    subscription.terminalAt !== undefined
  );
}

async function protectOperationFromPrune(
  ctx: MutationCtx,
  operation: Doc<"organizationStripeOperations">,
  protectedOperationIds: Set<Id<"organizationStripeOperations">>,
  now: number,
) {
  if (protectedOperationIds.has(operation._id)) return;
  protectedOperationIds.add(operation._id);
  if (
    operation.expiresAt <= now &&
    TERMINAL_OPERATION_STATUSES.includes(operation.status as (typeof TERMINAL_OPERATION_STATUSES)[number])
  ) {
    await ctx.db.patch(operation._id, {
      expiresAt: now + SAFETY_FINALIZATION_EVIDENCE_RECHECK_MS,
      updatedAt: now,
    });
  }
}

/** 保持期限を過ぎたterminal行のうち、provider終端証拠として保持すべきoperationを除いて100件ずつ削除する。 */
export const pruneExpiredTerminalRecords = internalMutation({
  args: {},
  returns: v.object({
    deletedWebhookEvents: v.number(),
    deletedOperations: v.number(),
    totalDeleted: v.number(),
    reachedBatchLimit: v.boolean(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const [webhookGroups, operationGroups] = await Promise.all([
      Promise.all(
        TERMINAL_WEBHOOK_STATUSES.map(
          async (status) =>
            await ctx.db
              .query("stripeWebhookEvents")
              .withIndex("by_status_and_expiresAt", (q) => q.eq("status", status).lte("expiresAt", now))
              .take(RETENTION_PRUNE_BATCH_SIZE),
        ),
      ),
      Promise.all(
        TERMINAL_OPERATION_STATUSES.map(
          async (status) =>
            await ctx.db
              .query("organizationStripeOperations")
              .withIndex("by_status_and_expiresAt", (q) => q.eq("status", status).lte("expiresAt", now))
              .take(RETENTION_PRUNE_BATCH_SIZE),
        ),
      ),
    ]);

    const candidates: Array<
      | { kind: "webhook"; record: Doc<"stripeWebhookEvents"> }
      | { kind: "operation"; record: Doc<"organizationStripeOperations"> }
    > = [
      ...webhookGroups.flatMap((records) => records.map((record) => ({ kind: "webhook" as const, record }))),
      ...operationGroups.flatMap((records) => records.map((record) => ({ kind: "operation" as const, record }))),
    ];
    const safetyEvidenceOperations = operationGroups
      .flat()
      .filter(
        (operation) =>
          operation.status === "succeeded" &&
          operation.providerGeneration !== undefined &&
          (operation.kind === "cancelSubscription" || operation.kind === "stopInvoiceCollection"),
      );
    const evidenceOrganizationIds = [...new Set(safetyEvidenceOperations.map((operation) => operation.organizationId))];
    const latestSubscriptions = await Promise.all(
      evidenceOrganizationIds.map(async (organizationId) => ({
        organizationId,
        subscription: await ctx.db
          .query("organizationStripeSubscriptions")
          .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
          .order("desc")
          .first(),
      })),
    );
    const latestSubscriptionByOrganization = new Map(
      latestSubscriptions.map(({ organizationId, subscription }) => [organizationId, subscription]),
    );
    const protectedOperationIds = new Set<Id<"organizationStripeOperations">>();
    for (const operation of safetyEvidenceOperations) {
      const latestSubscription = latestSubscriptionByOrganization.get(operation.organizationId);
      if (
        latestSubscription?.terminalAt === undefined ||
        latestSubscription.providerGeneration !== operation.providerGeneration
      ) {
        continue;
      }
      protectedOperationIds.add(operation._id);
      await ctx.db.patch(operation._id, {
        expiresAt: now + SAFETY_FINALIZATION_EVIDENCE_RECHECK_MS,
        updatedAt: now,
      });
    }

    const expiredTerminalOperations = operationGroups.flat();
    const invalidTrialCleanupOperations = expiredTerminalOperations.filter(
      (operation) => operation.recoveryPurpose === "invalidTrialSubscriptionCancellation",
    );
    for (const cleanup of invalidTrialCleanupOperations) {
      if (await hasUniqueTerminalSubscriptionEvidence(ctx, cleanup)) continue;
      await protectOperationFromPrune(ctx, cleanup, protectedOperationIds, now);
      if (!cleanup.sourceOperationId) continue;
      const source = await ctx.db.get(cleanup.sourceOperationId);
      if (source?.kind === "createTrialSubscription" && source.organizationId === cleanup.organizationId) {
        await protectOperationFromPrune(ctx, source, protectedOperationIds, now);
      }
    }

    // create成功の有無が不明な要対応行は、provider終端snapshotが得られるまで削除しない。
    const uncertainTrialCreationOperations = expiredTerminalOperations.filter(
      (operation) => operation.kind === "createTrialSubscription" && operation.status === "actionRequired",
    );
    for (const source of uncertainTrialCreationOperations) {
      if (await hasUniqueTerminalSubscriptionEvidence(ctx, source)) continue;
      await protectOperationFromPrune(ctx, source, protectedOperationIds, now);
    }

    const deletableCandidates = candidates.filter(
      (candidate) => candidate.kind !== "operation" || !protectedOperationIds.has(candidate.record._id),
    );
    deletableCandidates.sort(
      (left, right) =>
        left.record.expiresAt - right.record.expiresAt || left.record._creationTime - right.record._creationTime,
    );

    let deletedWebhookEvents = 0;
    let deletedOperations = 0;
    const batch = deletableCandidates.slice(0, RETENTION_PRUNE_BATCH_SIZE);
    for (const candidate of batch) {
      if (candidate.kind === "webhook") {
        await ctx.db.delete(candidate.record._id);
        deletedWebhookEvents += 1;
      } else {
        await ctx.db.delete(candidate.record._id);
        deletedOperations += 1;
      }
    }

    const reachedBatchLimit =
      batch.length === RETENTION_PRUNE_BATCH_SIZE ||
      [...webhookGroups, ...operationGroups].some((records) => records.length === RETENTION_PRUNE_BATCH_SIZE);
    if (reachedBatchLimit) {
      await ctx.scheduler.runAfter(0, internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {});
    }

    return {
      deletedWebhookEvents,
      deletedOperations,
      totalDeleted: batch.length,
      reachedBatchLimit,
    };
  },
});

/**
 * 件数は全件走査せずobservedCount/hasMoreで返す。
 * P0相当の無償プランmappingも観測だけに留め、自動修復・自動削除しない。
 */
export const getProbe = internalQuery({
  args: {},
  returns: v.object({
    webhookStatuses: v.array(observedStatusValidator),
    operationStatuses: v.array(observedStatusValidator),
    oldestObservedUnprocessedWebhookReceivedAt: v.optional(v.number()),
    latestObservedProcessedWebhookAt: v.optional(v.number()),
    operationActionRequired: v.object({
      observedCount: v.number(),
      hasMore: v.boolean(),
      unfinishedObservedCount: v.number(),
      persistedActionRequiredObservedCount: v.number(),
    }),
    safetyOperations: v.object({
      unfinishedCancelSubscription: boundedCountValidator,
      unfinishedStopInvoiceCollection: boundedCountValidator,
      priceRotationBlocking: v.object({
        trialSetupCheckout: boundedCountValidator,
        createTrialSubscription: boundedCountValidator,
        immediatePaidCheckout: boundedCountValidator,
      }),
      reconcileSubscriptionActionRequired: boundedCountValidator,
    }),
    anomalies: v.object({
      complimentaryStripeMappingP0: boundedCountValidator,
      activePaidWithoutCurrentSubscription: boundedCountValidator,
      activeFreeWithCurrentSubscription: boundedCountValidator,
      organizationsWithMultipleNonterminalSubscriptions: boundedCountValidator,
      organizationsWithMultipleStripeCustomers: boundedCountValidator,
      subscriptionsWithoutMatchingLocalCustomer: boundedCountValidator,
      stripeCustomersWithoutBillingState: boundedCountValidator,
      unresolvedM018MigrationConflicts: boundedCountValidator,
    }),
  }),
  handler: async (ctx) => {
    const webhookSamples = new Map<
      Doc<"stripeWebhookEvents">["status"],
      { records: Doc<"stripeWebhookEvents">[]; hasMore: boolean }
    >();
    const webhookStatuses = [];
    for (const status of WEBHOOK_STATUSES) {
      const records = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status))
        .take(PROBE_LIMIT_PER_STATUS + 1);
      const sampled = records.slice(0, PROBE_LIMIT_PER_STATUS);
      const hasMore = records.length > PROBE_LIMIT_PER_STATUS;
      webhookSamples.set(status, { records: sampled, hasMore });
      webhookStatuses.push(statusObservation(status, sampled, hasMore));
    }

    const operationSamples = new Map<
      Doc<"organizationStripeOperations">["status"],
      { records: Doc<"organizationStripeOperations">[]; hasMore: boolean }
    >();
    const operationStatuses = [];
    for (const status of OPERATION_STATUSES) {
      const records = await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", status))
        .take(PROBE_LIMIT_PER_STATUS + 1);
      const sampled = records.slice(0, PROBE_LIMIT_PER_STATUS);
      const hasMore = records.length > PROBE_LIMIT_PER_STATUS;
      operationSamples.set(status, { records: sampled, hasMore });
      operationStatuses.push(statusObservation(status, sampled, hasMore));
    }

    const unprocessedWebhooks = UNPROCESSED_WEBHOOK_STATUSES.flatMap(
      (status) => webhookSamples.get(status)?.records ?? [],
    );
    const oldestObservedUnprocessedWebhookReceivedAt = minimumDefined(
      unprocessedWebhooks.map((event) => event.receivedAt),
    );
    const latestProcessedWebhook = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_status_and_processedAt", (q) => q.eq("status", "processed"))
      .order("desc")
      .first();
    const latestObservedProcessedWebhookAt = latestProcessedWebhook?.processedAt;

    const unfinishedObservedCount = UNFINISHED_OPERATION_STATUSES.reduce(
      (count, status) => count + (operationSamples.get(status)?.records.length ?? 0),
      0,
    );
    const persistedActionRequiredObservedCount = operationSamples.get("actionRequired")?.records.length ?? 0;
    const operationActionRequired = {
      observedCount: unfinishedObservedCount + persistedActionRequiredObservedCount,
      hasMore: [...UNFINISHED_OPERATION_STATUSES, "actionRequired" as const].some(
        (status) => operationSamples.get(status)?.hasMore ?? false,
      ),
      unfinishedObservedCount,
      persistedActionRequiredObservedCount,
    };

    return {
      webhookStatuses,
      operationStatuses,
      ...(oldestObservedUnprocessedWebhookReceivedAt !== undefined
        ? { oldestObservedUnprocessedWebhookReceivedAt }
        : {}),
      ...(latestObservedProcessedWebhookAt !== undefined ? { latestObservedProcessedWebhookAt } : {}),
      operationActionRequired,
      safetyOperations: await probeSafetyOperations(ctx),
      anomalies: await probeRelationshipAnomalies(ctx),
    };
  },
});

function statusObservation<T extends { status: string; updatedAt: number }>(
  status: T["status"],
  records: T[],
  hasMore: boolean,
) {
  const oldestObservedUpdatedAt = minimumDefined(records.map((record) => record.updatedAt));
  return {
    status,
    observedCount: records.length,
    hasMore,
    ...(oldestObservedUpdatedAt !== undefined ? { oldestObservedUpdatedAt } : {}),
  };
}

async function probeSafetyOperations(ctx: QueryCtx) {
  const [
    unfinishedCancelSubscription,
    unfinishedStopInvoiceCollection,
    trialSetupCheckout,
    createTrialSubscription,
    legacyImmediateProCheckout,
    immediatePaidCheckout,
    reconcileSubscriptionActionRequired,
  ] = await Promise.all([
    observeOperations(ctx, "cancelSubscription", UNFINISHED_OPERATION_STATUSES),
    observeOperations(ctx, "stopInvoiceCollection", UNFINISHED_OPERATION_STATUSES),
    observePriceRotationBlockingOperations(ctx, "trialSetupCheckout"),
    observePriceRotationBlockingOperations(ctx, "createTrialSubscription"),
    observePriceRotationBlockingOperations(ctx, "immediateProCheckout"),
    observePriceRotationBlockingOperations(ctx, "immediatePaidCheckout"),
    observeOperations(ctx, "reconcileSubscription", ["actionRequired"]),
  ]);

  return {
    unfinishedCancelSubscription,
    unfinishedStopInvoiceCollection,
    priceRotationBlocking: {
      trialSetupCheckout,
      createTrialSubscription,
      immediatePaidCheckout: combineBoundedCounts(legacyImmediateProCheckout, immediatePaidCheckout),
    },
    reconcileSubscriptionActionRequired,
  };
}

async function observePriceRotationBlockingOperations(
  ctx: QueryCtx,
  kind: "trialSetupCheckout" | "createTrialSubscription" | "immediateProCheckout" | "immediatePaidCheckout",
) {
  const statuses = [...UNFINISHED_OPERATION_STATUSES, "succeeded", "actionRequired"] as const;
  const samples = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_kind_and_status", (q) => q.eq("kind", kind).eq("status", status))
        .take(PROBE_LIMIT_PER_STATUS + 1),
    ),
  );
  let observedCount = 0;
  for (const operations of samples) {
    for (const operation of operations.slice(0, PROBE_LIMIT_PER_STATUS)) {
      if (UNFINISHED_OPERATION_STATUSES.includes(operation.status as (typeof UNFINISHED_OPERATION_STATUSES)[number])) {
        observedCount += 1;
        continue;
      }
      if (operation.providerGeneration === undefined) {
        observedCount += 1;
        continue;
      }
      const subscriptions = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q
            .eq("organizationId", operation.organizationId)
            .eq("providerGeneration", operation.providerGeneration as number),
        )
        .take(2);
      // succeeded/actionRequired is safe to drain only after one local provider snapshot
      // proves the generation exists (including a provider-confirmed terminal snapshot).
      if (subscriptions.length !== 1) observedCount += 1;
    }
  }
  return {
    observedCount,
    hasMore: samples.some((records) => records.length > PROBE_LIMIT_PER_STATUS),
  };
}

async function observeOperations(
  ctx: QueryCtx,
  kind: Doc<"organizationStripeOperations">["kind"],
  statuses: readonly Doc<"organizationStripeOperations">["status"][],
) {
  const samples = await Promise.all(
    statuses.map((status) =>
      ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_kind_and_status", (q) => q.eq("kind", kind).eq("status", status))
        .take(PROBE_LIMIT_PER_STATUS + 1),
    ),
  );

  return {
    observedCount: samples.reduce((count, records) => count + Math.min(records.length, PROBE_LIMIT_PER_STATUS), 0),
    hasMore: samples.some((records) => records.length > PROBE_LIMIT_PER_STATUS),
  };
}

function combineBoundedCounts(...counts: Array<{ observedCount: number; hasMore: boolean }>) {
  return {
    observedCount: counts.reduce((total, count) => total + count.observedCount, 0),
    hasMore: counts.some((count) => count.hasMore),
  };
}

async function probeRelationshipAnomalies(ctx: QueryCtx) {
  const billingStates = await ctx.db.query("organizationBillingStates").take(PROBE_ORGANIZATION_LIMIT + 1);
  const sampled = billingStates.slice(0, PROBE_ORGANIZATION_LIMIT);
  const hasMoreBillingStates = billingStates.length > PROBE_ORGANIZATION_LIMIT;
  const subscriptions = await ctx.db.query("organizationStripeSubscriptions").take(PROBE_SUBSCRIPTION_LIMIT + 1);
  const hasMoreSubscriptions = subscriptions.length > PROBE_SUBSCRIPTION_LIMIT;
  const subscriptionRelationshipSample = subscriptions.slice(0, PROBE_RELATIONSHIP_LIMIT);
  const hasMoreSubscriptionRelationships = subscriptions.length > PROBE_RELATIONSHIP_LIMIT;
  const customers = await ctx.db.query("organizationStripeCustomers").take(PROBE_CUSTOMER_LIMIT + 1);
  const customerSample = customers.slice(0, PROBE_CUSTOMER_LIMIT);
  const hasMoreCustomers = customers.length > PROBE_CUSTOMER_LIMIT;
  const customerRelationshipSample = customers.slice(0, PROBE_RELATIONSHIP_LIMIT);
  const hasMoreCustomerRelationships = customers.length > PROBE_RELATIONSHIP_LIMIT;
  const unresolvedM018MigrationConflicts = await ctx.db
    .query("organizationMigrationConflicts")
    .withIndex("by_code_and_resolvedAt", (q) =>
      q.eq("code", M018_DUPLICATE_BILLING_STATES_CONFLICT).eq("resolvedAt", undefined),
    )
    .take(PROBE_LIMIT_PER_STATUS + 1);
  const nonterminalSubscriptionsByOrganization = new Map<Id<"organizations">, number>();
  for (const subscription of subscriptions.slice(0, PROBE_SUBSCRIPTION_LIMIT)) {
    if (subscription.terminalAt !== undefined) continue;
    nonterminalSubscriptionsByOrganization.set(
      subscription.organizationId,
      Math.min(2, (nonterminalSubscriptionsByOrganization.get(subscription.organizationId) ?? 0) + 1),
    );
  }

  const customersByOrganization = new Map<Id<"organizations">, number>();
  for (const customer of customerSample) {
    customersByOrganization.set(
      customer.organizationId,
      Math.min(2, (customersByOrganization.get(customer.organizationId) ?? 0) + 1),
    );
  }

  let subscriptionsWithoutMatchingLocalCustomer = 0;
  for (const subscription of subscriptionRelationshipSample) {
    const matchingCustomer = await ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_livemode_and_stripeCustomerId", (q) =>
        q.eq("livemode", subscription.livemode).eq("stripeCustomerId", subscription.stripeCustomerId),
      )
      .filter((q) => q.eq(q.field("organizationId"), subscription.organizationId))
      .first();
    if (!matchingCustomer) subscriptionsWithoutMatchingLocalCustomer += 1;
  }

  let stripeCustomersWithoutBillingState = 0;
  for (const customer of customerRelationshipSample) {
    const billingState = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", customer.organizationId))
      .first();
    if (!billingState) stripeCustomersWithoutBillingState += 1;
  }

  let complimentaryStripeMappingP0 = 0;
  let activePaidWithoutCurrentSubscription = 0;
  let activeFreeWithCurrentSubscription = 0;

  for (const billing of sampled) {
    const currentSubscriptions = await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", billing.organizationId))
      .order("desc")
      .take(1);

    if (billing.state.kind === "complimentary") {
      const customer = await ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", billing.organizationId))
        .first();
      if (customer || currentSubscriptions.length > 0) complimentaryStripeMappingP0 += 1;
    }

    if (billing.state.kind === "active" && billing.state.plan !== "free") {
      const currentSubscription = currentSubscriptions[0];
      if (!currentSubscription || currentSubscription.terminalAt !== undefined) {
        activePaidWithoutCurrentSubscription += 1;
      }
    }
    if (
      billing.state.kind === "active" &&
      billing.state.plan === "free" &&
      currentSubscriptions[0] !== undefined &&
      currentSubscriptions[0].terminalAt === undefined
    ) {
      activeFreeWithCurrentSubscription += 1;
    }
  }

  return {
    complimentaryStripeMappingP0: {
      observedCount: complimentaryStripeMappingP0,
      hasMore: hasMoreBillingStates,
    },
    activePaidWithoutCurrentSubscription: {
      observedCount: activePaidWithoutCurrentSubscription,
      hasMore: hasMoreBillingStates,
    },
    activeFreeWithCurrentSubscription: {
      observedCount: activeFreeWithCurrentSubscription,
      hasMore: hasMoreBillingStates,
    },
    organizationsWithMultipleNonterminalSubscriptions: {
      observedCount: [...nonterminalSubscriptionsByOrganization.values()].filter((count) => count > 1).length,
      hasMore: hasMoreSubscriptions,
    },
    organizationsWithMultipleStripeCustomers: {
      observedCount: [...customersByOrganization.values()].filter((count) => count > 1).length,
      hasMore: hasMoreCustomers,
    },
    subscriptionsWithoutMatchingLocalCustomer: {
      observedCount: subscriptionsWithoutMatchingLocalCustomer,
      hasMore: hasMoreSubscriptionRelationships,
    },
    stripeCustomersWithoutBillingState: {
      observedCount: stripeCustomersWithoutBillingState,
      hasMore: hasMoreCustomerRelationships,
    },
    unresolvedM018MigrationConflicts: {
      observedCount: Math.min(unresolvedM018MigrationConflicts.length, PROBE_LIMIT_PER_STATUS),
      hasMore: unresolvedM018MigrationConflicts.length > PROBE_LIMIT_PER_STATUS,
    },
  };
}

function minimumDefined(values: Array<number | undefined>) {
  let minimum: number | undefined;
  for (const value of values) {
    if (value !== undefined && (minimum === undefined || value < minimum)) minimum = value;
  }
  return minimum;
}
