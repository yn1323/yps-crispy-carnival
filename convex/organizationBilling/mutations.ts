import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { authenticatedMutation } from "../_lib/functions";
import { normalizeEmail } from "../_lib/validation";
import { type AnalyticsSourceEventPayload, analyticsPlanForBillingState } from "../analytics/sourceEvents";
import {
  type OrganizationReadActor,
  requireOrganizationActorForShop,
  requireOrganizationReadActor,
} from "../organization/access";
import { recordOrganizationAuditEvent } from "../organization/audit";
import {
  type CanonicalOrganizationBillingStateDocument,
  getOrganizationBillingState,
  getOrganizationUsageSnapshot,
  toOrganizationActualUsage,
} from "../organization/service";
import { collectIssuedInvitationsByOrganization } from "../organizationInvitation/lifecycle";
import { scheduleOrganizationBillingStateDeadline } from "./deadline";
import {
  type CanonicalOrganizationBillingState,
  canonicalizeOrganizationPaidPlan,
  createPaymentGraceState,
  decideScheduledTransition,
  evaluateOrganizationUsageLimits,
  isVerifiedBillingTransitionAllowed,
  type OrganizationBillingState,
  type OrganizationPaidPlan,
} from "./policy";

const transitionResultValidator = v.object({
  changed: v.boolean(),
  stateKind: v.optional(v.string()),
});

const INITIAL_PAYMENT_RECONCILE_DELAY_MS = 15 * 60 * 1000;

type AnalyticsPlanPayload = Extract<AnalyticsSourceEventPayload, { kind: "plan" }>;
type AnalyticsBillingStatusDelta = AnalyticsPlanPayload["statusDeltas"][number];

function billingAnalyticsEvent(
  state: OrganizationBillingState,
  billingVersion: number,
  effectiveAt: number,
  statusDeltas: AnalyticsBillingStatusDelta[],
) {
  const plan = analyticsPlanForBillingState(state);
  if (!plan) return undefined;
  return {
    eventType: "plan.changed" as const,
    payload: {
      kind: "plan" as const,
      plan,
      billingVersion,
      effectiveAt,
      statusDeltas,
    },
  };
}

function previousPlan(state: CanonicalOrganizationBillingState): "free" | OrganizationPaidPlan | undefined {
  switch (state.kind) {
    case "active":
      return state.plan;
    case "complimentary":
      return "pro";
    case "scheduledChange":
      return state.currentPlan;
    case "initialPaymentPending":
    case "pendingActivation":
    case "grace":
      return state.plan;
    case "trial":
      return undefined;
  }
}

async function revokePendingManagerInvitations(ctx: MutationCtx, organizationId: Id<"organizations">, now: number) {
  const invitations = await collectIssuedInvitationsByOrganization(ctx, organizationId);
  for (const invitation of invitations) {
    await ctx.db.patch(invitation._id, {
      status: "revoked",
      revokedAt: now,
      reservedSeat: false,
      version: invitation.version + 1,
      updatedAt: now,
    });
  }
}

async function applyFreePlanAfterEntitlementEnd(
  ctx: MutationCtx,
  args: {
    billingState: CanonicalOrganizationBillingStateDocument;
    now: number;
    correlationId: string;
  },
) {
  const { billingState, now } = args;
  const existingAudit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .first();
  if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

  const usage = await getOrganizationUsageSnapshot(ctx, billingState.organizationId);
  const usageLimitStatus = evaluateOrganizationUsageLimits({
    plan: "free",
    usage: toOrganizationActualUsage(usage),
  });
  const usageLimitExceeded = usageLimitStatus.kind === "overLimit";
  const nextState: CanonicalOrganizationBillingState = { kind: "active", planIdVersion: 2, plan: "free" };
  const nextVersion = billingState.version + 1;
  await ctx.db.patch(billingState._id, {
    state: nextState,
    freeManagerPersonId: undefined,
    freeShopId: undefined,
    ...(usageLimitExceeded
      ? {
          businessNotificationCutoffAt: now,
          businessNotificationCutoffVersion: nextVersion,
        }
      : {}),
    version: nextVersion,
    updatedAt: now,
  });
  await revokePendingManagerInvitations(ctx, billingState.organizationId, now);
  if (usageLimitExceeded) {
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
      organizationId: billingState.organizationId,
      cutoffAt: now,
      cutoffVersion: nextVersion,
    });
  }
  const analyticsEvent = billingAnalyticsEvent(nextState, nextVersion, now, []);
  await recordOrganizationAuditEvent(ctx, {
    organizationId: billingState.organizationId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingState._id,
    fromState: billingState.state.kind,
    toState: "free",
    correlationId: args.correlationId,
    occurredAt: now,
    ...(analyticsEvent ? { analyticsEvent } : {}),
  });
  return { changed: true, stateKind: "free", billingVersion: nextVersion, usageLimitExceeded };
}

async function isOrganizationOverPlanLimits(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  plan: "free" | OrganizationPaidPlan,
) {
  const usage = await getOrganizationUsageSnapshot(ctx, organizationId);
  return (
    evaluateOrganizationUsageLimits({
      plan,
      usage: toOrganizationActualUsage(usage),
    }).kind === "overLimit"
  );
}

async function resolveVerifiedPaidPlanApplication(args: {
  targetPlan: OrganizationPaidPlan;
}): Promise<CanonicalOrganizationBillingState> {
  return { kind: "active", planIdVersion: 2, plan: args.targetPlan };
}

function resolvePendingActivationFailure(
  billingState: CanonicalOrganizationBillingStateDocument,
): CanonicalOrganizationBillingState {
  if (billingState.state.kind !== "pendingActivation") {
    throw new ConvexError("現在の契約状態では、この変更を適用できません");
  }
  if (billingState.state.fallback === "standard" || billingState.state.fallback === "pro") {
    return { kind: "active", planIdVersion: 2, plan: billingState.state.fallback };
  }
  return { kind: "active", planIdVersion: 2, plan: "free" };
}

/** Stores the paid-plan choice while the organization remains in its trial. */
export const selectTrialPaidPlan = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
    planIdVersion: v.optional(v.literal(2)),
    plan: v.optional(v.union(v.literal("standard"), v.literal("pro"), v.literal("business"))),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const [organization, billingState] = await Promise.all([
      ctx.db.get(args.organizationId),
      getOrganizationBillingState(ctx, args.organizationId),
    ]);
    if (!organization || organization.isDeleted) return { changed: false };
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "trial") {
      throw new ConvexError("現在の契約状態ではトライアル継続プランを選択できません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    const selectedPaidPlan = canonicalizeOrganizationPaidPlan(args.plan ?? "pro", args.planIdVersion);
    if (existingAudit || billingState.state.selectedPaidPlan === selectedPaidPlan) {
      return { changed: false, stateKind: "trial" };
    }

    const now = Date.now();
    const nextVersion = billingState.version + 1;
    const nextState: CanonicalOrganizationBillingState = { ...billingState.state, selectedPaidPlan };
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "trial",
      toState: `trial.${selectedPaidPlan}`,
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: "trial" };
  },
});

/** Clears a verified paid-plan choice without ending the trial. */
export const clearTrialPaidPlan = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "trial" || !billingState.state.selectedPaidPlan) {
      throw new ConvexError("現在の契約状態ではトライアル継続プランを取り消せません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: "trial" };

    const now = Date.now();
    const nextVersion = billingState.version + 1;
    const nextState: CanonicalOrganizationBillingState = {
      kind: "trial",
      planIdVersion: 2,
      trialEndsAt: billingState.state.trialEndsAt,
    };
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: `trial.${billingState.state.selectedPaidPlan}`,
      toState: "trial",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: "trial" };
  },
});

/** Trial終了と取消が競合した初回請求待ちを、現在のFree条件へ安全に収束させる。 */
export const resolveInitialPaymentCancellation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    if (billingState.state.kind !== "initialPaymentPending") {
      return { changed: false, stateKind: billingState.state.kind };
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

/** Applies a provider-side cancellation that did not originate from a verified local plan change. */
export const applyUnexpectedCancellation = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    const previousPaidPlan = previousPlan(billingState.state);
    const canApply =
      (billingState.state.kind === "active" && billingState.state.plan !== "free") ||
      billingState.state.kind === "grace" ||
      billingState.state.kind === "scheduledChange";
    if (!canApply || (previousPaidPlan !== "standard" && previousPaidPlan !== "pro")) {
      throw new ConvexError("現在の契約状態では予期しない解約を適用できません");
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

async function transitionTrialToInitialPaymentPending(
  ctx: MutationCtx,
  args: {
    billingState: CanonicalOrganizationBillingStateDocument;
    trialEndsAt: number;
    now: number;
    correlationId: string;
  },
): Promise<CanonicalOrganizationBillingStateDocument> {
  const { billingState } = args;
  if (
    billingState.state.kind !== "trial" ||
    !billingState.state.selectedPaidPlan ||
    billingState.state.trialEndsAt !== args.trialEndsAt ||
    args.now < args.trialEndsAt
  ) {
    throw new ConvexError("現在は、トライアルの初回請求を開始できる状態ではありません");
  }

  const nextState = {
    kind: "initialPaymentPending" as const,
    planIdVersion: 2 as const,
    plan: billingState.state.selectedPaidPlan,
    startedAt: args.now,
  };
  const nextVersion = billingState.version + 1;
  await ctx.db.patch(billingState._id, {
    state: nextState,
    version: nextVersion,
    updatedAt: args.now,
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: billingState.organizationId,
    action: "organization.billing_state_changed",
    targetKind: "billing",
    targetId: billingState._id,
    fromState: "trial",
    toState: "initialPaymentPending",
    correlationId: args.correlationId,
    occurredAt: args.now,
  });
  await ctx.scheduler.runAfter(
    INITIAL_PAYMENT_RECONCILE_DELAY_MS,
    internal.organizationStripe.actions.reconcileInitialPaymentPending,
    {
      organizationId: billingState.organizationId,
      expectedBillingVersion: nextVersion,
      requestId: `initial-payment-reconcile-${nextVersion}`,
    },
  );
  return {
    ...billingState,
    state: nextState,
    version: nextVersion,
    updatedAt: args.now,
  };
}

/**
 * Atomically converges the trial deadline and the first invoice result.
 * A deadline job may have already performed only the initial-pending step.
 */
export const applyTrialInitialInvoiceResult = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    trialEndsAt: v.number(),
    result: v.union(v.literal("paid"), v.literal("failed")),
    firstFailureAt: v.optional(v.number()),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    let billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || Date.now() < args.trialEndsAt) return { changed: false };

    if (billingState.state.kind === "trial") {
      if (billingState.version !== args.expectedVersion) return { changed: false, stateKind: "trial" };
      billingState = await transitionTrialToInitialPaymentPending(ctx, {
        billingState,
        trialEndsAt: args.trialEndsAt,
        now: Date.now(),
        correlationId: `${args.correlationId}:initial-payment-pending`,
      });
    } else if (
      billingState.state.kind !== "initialPaymentPending" ||
      billingState.state.startedAt < args.trialEndsAt ||
      (billingState.version !== args.expectedVersion && billingState.version !== args.expectedVersion + 1)
    ) {
      return { changed: false, stateKind: billingState.state.kind };
    }

    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };
    if (args.result === "failed" && args.firstFailureAt === undefined) {
      throw new ConvexError("初回請求失敗時刻を確認できません");
    }
    if (billingState.state.kind !== "initialPaymentPending") {
      return { changed: false, stateKind: billingState.state.kind };
    }

    const now = Date.now();
    const targetPlan = billingState.state.plan;
    const nextState: CanonicalOrganizationBillingState =
      args.result === "paid"
        ? { kind: "active", planIdVersion: 2, plan: targetPlan }
        : createPaymentGraceState("standard", args.firstFailureAt as number, targetPlan);
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "initialPaymentPending",
      toState: args.result === "paid" ? targetPlan : "grace",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : "grace" };
  },
});

export const processDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState) return { changed: false };
    const decision = decideScheduledTransition({
      state: billingState.state,
      currentVersion: billingState.version,
      expectedVersion: args.expectedVersion,
      expectedDeadlineAt: args.expectedDeadlineAt,
      now: Date.now(),
    });
    if (!decision.shouldApply) return { changed: false, stateKind: billingState.state.kind };
    const now = Date.now();
    const correlationId = `${billingState._id}:deadline:${billingState.version}`;

    if (billingState.state.kind === "trial") {
      if (billingState.state.selectedPaidPlan) {
        await transitionTrialToInitialPaymentPending(ctx, {
          billingState,
          trialEndsAt: billingState.state.trialEndsAt,
          now,
          correlationId,
        });
        return { changed: true, stateKind: "initialPaymentPending" };
      }
      const result = await applyFreePlanAfterEntitlementEnd(ctx, {
        billingState,
        now,
        correlationId,
      });
      return { changed: result.changed, stateKind: result.stateKind };
    }

    if (billingState.state.kind === "grace") {
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.stopExpiredGraceCollection, {
        organizationId: billingState.organizationId,
        expectedBillingVersion: billingState.version,
        requestId: `grace-stop-${billingState.version}`,
      });
      return { changed: false, stateKind: "grace" };
    }

    if (billingState.state.kind === "scheduledChange") {
      if (billingState.state.targetPlan === "free") {
        await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
          organizationId: billingState.organizationId,
          expectedBillingVersion: billingState.version,
          requestId: `scheduled-free-${billingState.version}`,
        });
        return { changed: false, stateKind: "scheduledChange" };
      }
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline, {
        organizationId: billingState.organizationId,
        expectedBillingVersion: billingState.version,
        requestId: `scheduled-paid-${billingState.version}`,
      });
      return { changed: false, stateKind: "scheduledChange" };
    }

    return { changed: false, stateKind: billingState.state.kind };
  },
});

/** Stripeで期間末解約を確認した場合だけ、互換Free移行または解約を確定する。 */
export const confirmScheduledFreeDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "scheduledChange" ||
      billingState.state.targetPlan !== "free" ||
      billingState.state.effectiveAt !== args.expectedDeadlineAt ||
      Date.now() < args.expectedDeadlineAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, stateKind: result.stateKind };
  },
});

/** Stripe Scheduleのphase移行と請求結果を再取得できた場合だけPro→Standardを確定する。 */
export const confirmScheduledPaidPlanDeadline = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedDeadlineAt: v.number(),
    result: v.union(v.literal("paid"), v.literal("failed")),
    firstFailureAt: v.optional(v.number()),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "scheduledChange" ||
      billingState.state.currentPlan !== "pro" ||
      billingState.state.targetPlan !== "standard" ||
      billingState.state.effectiveAt !== args.expectedDeadlineAt ||
      Date.now() < args.expectedDeadlineAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    if (args.result === "failed" && args.firstFailureAt === undefined) {
      throw new ConvexError("請求失敗時刻を確認できません");
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

    const now = Date.now();
    const nextState =
      args.result === "paid"
        ? await resolveVerifiedPaidPlanApplication({
            targetPlan: "standard",
          })
        : createPaymentGraceState("pro", args.firstFailureAt as number, "standard");
    if (!isVerifiedBillingTransitionAllowed(billingState.state, nextState)) {
      throw new ConvexError("現在の契約状態では、この変更を適用できません");
    }
    const usageLimitExceeded =
      nextState.kind === "active"
        ? await isOrganizationOverPlanLimits(ctx, args.organizationId, nextState.plan)
        : false;
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      ...(nextState.kind === "active"
        ? {
            freeManagerPersonId: undefined,
            freeShopId: undefined,
          }
        : {}),
      ...(usageLimitExceeded
        ? {
            businessNotificationCutoffAt: now,
            businessNotificationCutoffVersion: nextVersion,
          }
        : {}),
      version: nextVersion,
      updatedAt: now,
    });
    if (usageLimitExceeded) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: args.organizationId,
        cutoffAt: now,
        cutoffVersion: nextVersion,
      });
    }
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "scheduledChange",
      toState: nextState.kind === "active" ? nextState.plan : nextState.kind,
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : nextState.kind };
  },
});

export const expireVerifiedPaymentGrace = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    expectedEndsAt: v.number(),
    cancelOperationId: v.id("organizationStripeOperations"),
    stopInvoiceCollectionOperationId: v.id("organizationStripeOperations"),
    correlationId: v.string(),
  },
  returns: v.object({ changed: v.boolean(), billingVersion: v.optional(v.number()) }),
  handler: async (ctx, args) => {
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "grace" ||
      billingState.state.endsAt !== args.expectedEndsAt ||
      Date.now() < args.expectedEndsAt
    ) {
      return { changed: false };
    }
    const [cancelOperation, stopInvoiceCollectionOperation] = await Promise.all([
      ctx.db.get(args.cancelOperationId),
      ctx.db.get(args.stopInvoiceCollectionOperationId),
    ]);
    const hasVerifiedCollectionStop =
      cancelOperation?.organizationId === args.organizationId &&
      cancelOperation.kind === "cancelSubscription" &&
      cancelOperation.status === "succeeded" &&
      cancelOperation.expectedBillingVersion === args.expectedVersion &&
      stopInvoiceCollectionOperation?.organizationId === args.organizationId &&
      stopInvoiceCollectionOperation.kind === "stopInvoiceCollection" &&
      stopInvoiceCollectionOperation.status === "succeeded" &&
      stopInvoiceCollectionOperation.expectedBillingVersion === args.expectedVersion &&
      stopInvoiceCollectionOperation.requestKey === cancelOperation.requestKey &&
      stopInvoiceCollectionOperation.livemode === cancelOperation.livemode &&
      stopInvoiceCollectionOperation.providerGeneration === cancelOperation.providerGeneration;
    if (!hasVerifiedCollectionStop) {
      throw new ConvexError("支払い猶予終了後の回収停止を確認できません");
    }

    const result = await applyFreePlanAfterEntitlementEnd(ctx, {
      billingState,
      now: Date.now(),
      correlationId: args.correlationId,
    });
    return { changed: result.changed, billingVersion: result.billingVersion };
  },
});

const verifiedBillingPaidPlanValidator = v.union(v.literal("standard"), v.literal("pro"), v.literal("business"));

const verifiedBillingStateRequestValidator = v.union(
  v.object({ kind: v.literal("initialPaymentPending"), plan: verifiedBillingPaidPlanValidator }),
  v.object({
    kind: v.literal("pendingActivation"),
    plan: verifiedBillingPaidPlanValidator,
    fallback: v.union(v.literal("free"), v.literal("standard"), v.literal("pro"), v.literal("business")),
  }),
  v.object({ kind: v.literal("active"), plan: verifiedBillingPaidPlanValidator }),
  v.object({ kind: v.literal("paymentFailed") }),
  v.object({ kind: v.literal("scheduledChangeCanceled") }),
  v.object({
    kind: v.literal("grace"),
    plan: verifiedBillingPaidPlanValidator,
    targetPlan: v.optional(verifiedBillingPaidPlanValidator),
    firstFailureAt: v.number(),
  }),
  v.object({
    kind: v.literal("scheduledChange"),
    currentPlan: verifiedBillingPaidPlanValidator,
    targetPlan: v.union(v.literal("free"), verifiedBillingPaidPlanValidator),
    effectiveAt: v.number(),
    restrictAtPeriodEnd: v.optional(v.literal(true)),
  }),
);

type VerifiedBillingStateRequest = Infer<typeof verifiedBillingStateRequestValidator>;

type CanonicalVerifiedBillingStateRequest =
  | { kind: "initialPaymentPending"; plan: OrganizationPaidPlan }
  | {
      kind: "pendingActivation";
      plan: OrganizationPaidPlan;
      fallback: "free" | OrganizationPaidPlan;
    }
  | { kind: "active"; plan: OrganizationPaidPlan }
  | { kind: "paymentFailed" }
  | { kind: "scheduledChangeCanceled" }
  | {
      kind: "grace";
      plan: OrganizationPaidPlan;
      targetPlan?: OrganizationPaidPlan;
      firstFailureAt: number;
    }
  | {
      kind: "scheduledChange";
      currentPlan: "standard";
      targetPlan: "free";
      effectiveAt: number;
      restrictAtPeriodEnd?: true;
    }
  | {
      kind: "scheduledChange";
      currentPlan: "pro";
      targetPlan: "standard" | "free";
      effectiveAt: number;
      restrictAtPeriodEnd?: true;
    };

function canonicalizeVerifiedBillingStateRequest(
  state: VerifiedBillingStateRequest,
  planIdVersion?: 2,
): CanonicalVerifiedBillingStateRequest {
  switch (state.kind) {
    case "initialPaymentPending":
    case "active":
      return { ...state, plan: canonicalizeOrganizationPaidPlan(state.plan, planIdVersion) };
    case "pendingActivation": {
      const fallback =
        state.fallback === "free" ? state.fallback : canonicalizeOrganizationPaidPlan(state.fallback, planIdVersion);
      return { ...state, plan: canonicalizeOrganizationPaidPlan(state.plan, planIdVersion), fallback };
    }
    case "grace": {
      const { plan, targetPlan, ...rest } = state;
      return {
        ...rest,
        plan: canonicalizeOrganizationPaidPlan(plan, planIdVersion),
        ...(targetPlan ? { targetPlan: canonicalizeOrganizationPaidPlan(targetPlan, planIdVersion) } : {}),
      };
    }
    case "scheduledChange": {
      const currentPlan = canonicalizeOrganizationPaidPlan(state.currentPlan, planIdVersion);
      const targetPlan =
        state.targetPlan === "free" ? "free" : canonicalizeOrganizationPaidPlan(state.targetPlan, planIdVersion);
      const base = {
        kind: "scheduledChange" as const,
        effectiveAt: state.effectiveAt,
        ...(state.restrictAtPeriodEnd ? { restrictAtPeriodEnd: true as const } : {}),
      };
      if (currentPlan === "standard" && targetPlan === "free") return { ...base, currentPlan, targetPlan };
      if (currentPlan === "pro" && targetPlan === "standard") return { ...base, currentPlan, targetPlan };
      if (currentPlan === "pro" && targetPlan === "free") return { ...base, currentPlan, targetPlan };
      throw new ConvexError("現在の契約状態では、このプラン変更を適用できません");
    }
    case "paymentFailed":
    case "scheduledChangeCanceled":
      return state;
  }
}

export const setStateFromVerifiedBilling = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    planIdVersion: v.optional(v.literal(2)),
    state: verifiedBillingStateRequestValidator,
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const requestedState = canonicalizeVerifiedBillingStateRequest(args.state, args.planIdVersion);
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (!billingState || billingState.version !== args.expectedVersion) return { changed: false };
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: billingState.state.kind };

    if (requestedState.kind === "grace" && billingState.state.kind === "grace") {
      if (requestedState.plan !== billingState.state.plan) {
        throw new ConvexError("支払い猶予中のプランと一致しません");
      }
      return { changed: false, stateKind: "grace" };
    }

    const now = Date.now();
    let nextState: CanonicalOrganizationBillingState;
    let scheduledChangeCanceled = false;
    switch (requestedState.kind) {
      case "initialPaymentPending":
        nextState = { ...requestedState, planIdVersion: 2, startedAt: now };
        break;
      case "pendingActivation":
        nextState = {
          ...requestedState,
          planIdVersion: 2,
          startedAt: now,
        };
        break;
      case "grace":
        nextState = createPaymentGraceState(
          requestedState.plan,
          requestedState.firstFailureAt,
          requestedState.targetPlan ?? requestedState.plan,
        );
        break;
      case "paymentFailed": {
        nextState = resolvePendingActivationFailure(billingState);
        break;
      }
      case "scheduledChangeCanceled":
        if (billingState.state.kind !== "scheduledChange") {
          throw new ConvexError("現在の契約状態では、この変更を適用できません");
        }
        nextState = { kind: "active", planIdVersion: 2, plan: billingState.state.currentPlan };
        scheduledChangeCanceled = true;
        break;
      default:
        nextState = { ...requestedState, planIdVersion: 2 };
    }
    if (
      nextState.kind === "active" &&
      nextState.plan === "standard" &&
      ((billingState.state.kind === "scheduledChange" && billingState.state.currentPlan === "pro") ||
        (billingState.state.kind === "grace" &&
          billingState.state.plan === "pro" &&
          billingState.state.targetPlan === "standard"))
    ) {
      nextState = await resolveVerifiedPaidPlanApplication({
        targetPlan: "standard",
      });
    }
    if (
      !isVerifiedBillingTransitionAllowed(
        billingState.state,
        nextState,
        scheduledChangeCanceled
          ? "scheduledChangeCanceled"
          : requestedState.kind === "paymentFailed"
            ? "paymentFailed"
            : "stateUpdate",
      )
    ) {
      throw new ConvexError("現在の契約状態では、この変更を適用できません");
    }
    const usageLimitExceeded =
      nextState.kind === "active"
        ? await isOrganizationOverPlanLimits(ctx, args.organizationId, nextState.plan)
        : false;
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      ...(nextState.kind === "active"
        ? {
            freeManagerPersonId: undefined,
            freeShopId: undefined,
          }
        : {}),
      ...(usageLimitExceeded
        ? {
            businessNotificationCutoffAt: now,
            businessNotificationCutoffVersion: nextVersion,
          }
        : {}),
      version: nextVersion,
      updatedAt: now,
    });
    if (usageLimitExceeded) {
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.cancelOrganizationBusinessNotifications, {
        organizationId: args.organizationId,
        cutoffAt: now,
        cutoffVersion: nextVersion,
      });
    }
    const analyticsEvent = billingAnalyticsEvent(nextState, nextVersion, now, []);
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_state_changed",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: billingState.state.kind,
      toState: nextState.kind === "active" ? nextState.plan : nextState.kind,
      correlationId: args.correlationId,
      occurredAt: now,
      ...(analyticsEvent ? { analyticsEvent } : {}),
    });
    const updated = { ...billingState, state: nextState, version: nextVersion, updatedAt: now };
    await scheduleOrganizationBillingStateDeadline(ctx, updated);
    return { changed: true, stateKind: nextState.kind === "active" ? nextState.plan : nextState.kind };
  },
});

/** 検証済みのより早い初回失敗だけを採用し、14日猶予を配送順で延長させない。 */
export const tightenVerifiedPaymentGrace = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    expectedVersion: v.number(),
    firstFailureAt: v.number(),
    correlationId: v.string(),
  },
  returns: transitionResultValidator,
  handler: async (ctx, args) => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization || organization.isDeleted) return { changed: false };
    const billingState = await getOrganizationBillingState(ctx, args.organizationId);
    if (
      !billingState ||
      billingState.version !== args.expectedVersion ||
      billingState.state.kind !== "grace" ||
      !Number.isSafeInteger(args.firstFailureAt) ||
      args.firstFailureAt < 0 ||
      args.firstFailureAt >= billingState.state.startedAt
    ) {
      return { changed: false, stateKind: billingState?.state.kind };
    }
    const existingAudit = await ctx.db
      .query("organizationAuditEvents")
      .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
      .first();
    if (existingAudit) return { changed: false, stateKind: "grace" };

    const now = Date.now();
    const nextState = createPaymentGraceState(
      billingState.state.plan,
      args.firstFailureAt,
      billingState.state.targetPlan ?? billingState.state.plan,
    );
    const nextVersion = billingState.version + 1;
    await ctx.db.patch(billingState._id, {
      state: nextState,
      version: nextVersion,
      updatedAt: now,
    });
    await recordOrganizationAuditEvent(ctx, {
      organizationId: args.organizationId,
      action: "organization.billing_grace_shortened",
      targetKind: "billing",
      targetId: billingState._id,
      fromState: "grace",
      toState: "grace",
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await scheduleOrganizationBillingStateDeadline(ctx, {
      ...billingState,
      state: nextState,
      version: nextVersion,
    });
    return { changed: true, stateKind: "grace" };
  },
});

async function updateBillingEmailForActor(
  ctx: MutationCtx,
  args: { email: string; requestId: string },
  actor: OrganizationReadActor,
) {
  const billingState = await getOrganizationBillingState(ctx, actor.organization._id);
  if (!billingState) {
    throw new ConvexError("組織の契約情報を確認中です");
  }
  if (billingState.state.kind === "complimentary") {
    throw new ConvexError("支払い不要の組織では請求先メールアドレスを変更できません");
  }
  const normalized = normalizeEmail(args.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new ConvexError("メールアドレスの形式で入力してください");
  }
  if (actor.member.status !== "active") {
    throw new ConvexError("この操作を行う権限がありません");
  }
  const requestKey = await toAuditRequestKey(args.requestId);
  if (actor.organization.billingEmailNormalized === normalized) return { changed: false };

  const correlationId = `${actor.organization._id}:billing-email:${requestKey}`;
  const existing = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
    .first();
  if (existing) return { changed: false };

  await ctx.db.patch(actor.organization._id, {
    billingEmail: args.email.trim(),
    billingEmailNormalized: normalized,
    billingEmailSyncKey: requestKey,
    updatedAt: Date.now(),
  });
  await recordOrganizationAuditEvent(ctx, {
    organizationId: actor.organization._id,
    actorUserId: actor.member.userId,
    actorPersonId: actor.person._id,
    action: "organization.billing_email_changed",
    targetKind: "organization",
    targetId: actor.organization._id,
    correlationId,
  });
  await ctx.scheduler.runAfter(0, internal.organizationBilling.actions.enqueueBillingEmailChangedNotification, {
    organizationId: actor.organization._id,
    eventKey: correlationId,
  });
  await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.syncBillingEmail, {
    organizationId: actor.organization._id,
    requestId: requestKey,
  });
  return { changed: true };
}

export const updateBillingEmail = authenticatedMutation({
  args: { shopId: v.id("shops"), email: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationActorForShop(ctx, {
      user: ctx.user,
      shopId: args.shopId,
    });
    return await updateBillingEmailForActor(ctx, args, actor);
  },
});

export const updateBillingEmailForOrganization = authenticatedMutation({
  args: { organizationId: v.id("organizations"), email: v.string(), requestId: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireOrganizationReadActor(ctx, {
      user: ctx.user,
      organizationId: args.organizationId,
    });
    return await updateBillingEmailForActor(ctx, args, actor);
  },
});
