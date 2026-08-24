import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import {
  type OrganizationReadActor,
  requireOrganizationActorForShop,
  requireOrganizationReadActor,
} from "../organization/access";
import { organizationCanonicalBillingStateValidator } from "../organization/validators";
import {
  canonicalizeOrganizationBillingState,
  getEffectiveRestrictedBillingState,
} from "../organizationBilling/policy";
import { canonicalizeStripePaidPlan, canonicalizeStripeTargetPlan } from "./planIds";
import {
  organizationStripeOperationKindValidator,
  organizationStripeOperationStatusValidator,
  stripeWebhookEventTypeValidator,
  trialSubscriptionCreateSnapshotValidator,
} from "./validators";

const actionPurposeValidator = v.union(
  v.literal("price"),
  v.literal("currentSubscriptionPrice"),
  v.literal("startCheckout"),
  v.literal("cancelCheckout"),
  v.literal("portal"),
  v.literal("scheduleFree"),
  v.literal("cancelFreeSchedule"),
  v.literal("changePaidPlan"),
  v.literal("schedulePaidPlanChange"),
  v.literal("cancelScheduledPlanChange"),
);

type ActionPurpose = typeof actionPurposeValidator.type;

const actionContextValidator = v.union(
  v.null(),
  v.object({
    organizationId: v.id("organizations"),
    organizationName: v.string(),
    billingEmail: v.string(),
    personId: v.id("organizationPeople"),
    billingState: v.object({
      state: organizationCanonicalBillingStateValidator,
      version: v.number(),
    }),
    stripeCustomerId: v.optional(v.string()),
    stripeCustomerLivemode: v.optional(v.boolean()),
    providerGeneration: v.number(),
    currentStripeSubscriptionId: v.optional(v.string()),
    currentStripeSubscriptionLivemode: v.optional(v.boolean()),
    currentStripePriceId: v.optional(v.string()),
    currentStripePlan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
    currentStripeSubscriptionItemId: v.optional(v.string()),
    currentPeriodStartsAt: v.optional(v.number()),
    currentPeriodEndsAt: v.optional(v.number()),
    billingCycleAnchor: v.optional(v.number()),
    stripeSubscriptionScheduleId: v.optional(v.string()),
  }),
);

const paidCheckoutOperationKindValidator = v.union(
  v.literal("immediateProCheckout"),
  v.literal("immediatePaidCheckout"),
);

const PAID_CHECKOUT_OPERATION_KINDS = ["immediateProCheckout", "immediatePaidCheckout"] as const;

export const getActionContext = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    shopId: v.id("shops"),
    purpose: actionPurposeValidator,
  },
  returns: actionContextValidator,
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", args.tokenIdentifier))
      .take(2);
    if (users.length !== 1) return null;

    const actor = await requireOrganizationActorForShop(ctx, {
      user: users[0],
      shopId: args.shopId,
      allowReadOnly: true,
    });
    return await getActionContextForActor(ctx, actor, args.purpose);
  },
});

/** app管理画面用。店舗anchorを経由せずcanonical組織所属から課金対象を確定する。 */
export const getActionContextForOrganization = internalQuery({
  args: {
    tokenIdentifier: v.string(),
    organizationId: v.id("organizations"),
    purpose: actionPurposeValidator,
  },
  returns: actionContextValidator,
  handler: async (ctx, args) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_authTokenIdentifier", (q) => q.eq("authTokenIdentifier", args.tokenIdentifier))
      .take(2);
    if (users.length !== 1) return null;

    const actor = await requireOrganizationReadActor(ctx, {
      user: users[0],
      organizationId: args.organizationId,
    });
    return await getActionContextForActor(ctx, actor, args.purpose);
  },
});

async function getActionContextForActor(ctx: QueryCtx, actor: OrganizationReadActor, purpose: ActionPurpose) {
  const [billingState, customer, latestSubscription] = await Promise.all([
    ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", actor.organization._id))
      .unique(),
    ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", actor.organization._id))
      .unique(),
    ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", actor.organization._id))
      .order("desc")
      .first(),
  ]);
  if (!billingState) return null;
  if (purpose === "currentSubscriptionPrice" && latestSubscription?.terminalAt !== undefined) return null;
  const canonicalBillingState = canonicalizeOrganizationBillingState(billingState.state);
  const restrictedState = getEffectiveRestrictedBillingState(canonicalBillingState);
  const isRecoveryManager = restrictedState?.recoveryManagerPersonIds.includes(actor.person._id) === true;
  const isActiveManager = actor.member.status === "active";
  if (!isActiveManager && !isRecoveryManager) return null;
  if (!isPurposeAllowed(purpose, canonicalBillingState, isActiveManager, isRecoveryManager)) return null;
  if (
    purpose === "startCheckout" &&
    canonicalBillingState.kind === "restricted" &&
    canonicalBillingState.reason === "paymentGraceExpired" &&
    latestSubscription?.terminalAt !== undefined
  ) {
    const collectionFinalized = (
      await Promise.all(
        (["cancelSubscription", "stopInvoiceCollection"] as const).map(async (kind) =>
          ctx.db
            .query("organizationStripeOperations")
            .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
              q
                .eq("organizationId", actor.organization._id)
                .eq("providerGeneration", latestSubscription.providerGeneration)
                .eq("kind", kind)
                .eq("status", "succeeded"),
            )
            .first(),
        ),
      )
    ).every((operation) => operation !== null);
    if (!collectionFinalized) return null;
  }

  return {
    organizationId: actor.organization._id,
    organizationName: actor.organization.name,
    billingEmail: actor.organization.billingEmail ?? actor.person.email,
    personId: actor.person._id,
    billingState: { state: canonicalBillingState, version: billingState.version },
    ...(customer ? { stripeCustomerId: customer.stripeCustomerId } : {}),
    ...(customer ? { stripeCustomerLivemode: customer.livemode } : {}),
    providerGeneration: latestSubscription?.providerGeneration ?? 0,
    ...(latestSubscription && !latestSubscription.terminalAt
      ? { currentStripeSubscriptionId: latestSubscription.stripeSubscriptionId }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt
      ? { currentStripeSubscriptionLivemode: latestSubscription.livemode }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt
      ? { currentStripePriceId: latestSubscription.stripePriceId }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.plan
      ? {
          currentStripePlan: canonicalizeStripePaidPlan(latestSubscription.plan, latestSubscription.planIdVersion),
        }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.stripeSubscriptionItemId
      ? { currentStripeSubscriptionItemId: latestSubscription.stripeSubscriptionItemId }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.currentPeriodStartsAt !== undefined
      ? { currentPeriodStartsAt: latestSubscription.currentPeriodStartsAt }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.currentPeriodEndsAt !== undefined
      ? { currentPeriodEndsAt: latestSubscription.currentPeriodEndsAt }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.billingCycleAnchor !== undefined
      ? { billingCycleAnchor: latestSubscription.billingCycleAnchor }
      : {}),
    ...(latestSubscription && !latestSubscription.terminalAt && latestSubscription.stripeSubscriptionScheduleId
      ? { stripeSubscriptionScheduleId: latestSubscription.stripeSubscriptionScheduleId }
      : {}),
  };
}

export const getOperation = internalQuery({
  args: { operationId: v.id("organizationStripeOperations") },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      organizationId: v.id("organizations"),
      requestKey: v.string(),
      kind: organizationStripeOperationKindValidator,
      status: organizationStripeOperationStatusValidator,
      expectedBillingVersion: v.optional(v.number()),
      providerGeneration: v.optional(v.number()),
      stripePriceIdSnapshot: v.optional(v.string()),
      sourcePlan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
      targetPlan: v.optional(v.union(v.literal("free"), v.literal("standard"), v.literal("pro"))),
      restrictAtPeriodEnd: v.optional(v.literal(true)),
      changeMode: v.optional(v.union(v.literal("checkout"), v.literal("immediate"), v.literal("periodEnd"))),
      stripeSubscriptionIdSnapshot: v.optional(v.string()),
      stripeSubscriptionItemIdSnapshot: v.optional(v.string()),
      sourceStripePriceIdSnapshot: v.optional(v.string()),
      targetStripePriceIdSnapshot: v.optional(v.string()),
      prorationDate: v.optional(v.number()),
      effectiveAt: v.optional(v.number()),
      stripeObjectId: v.optional(v.string()),
      stripeIdempotencyKey: v.string(),
      livemode: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) return null;
    return {
      operationId: operation._id,
      organizationId: operation.organizationId,
      requestKey: operation.requestKey,
      kind: operation.kind,
      status: operation.status,
      ...(operation.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: operation.expectedBillingVersion }
        : {}),
      ...(operation.providerGeneration !== undefined ? { providerGeneration: operation.providerGeneration } : {}),
      ...(operation.stripePriceIdSnapshot ? { stripePriceIdSnapshot: operation.stripePriceIdSnapshot } : {}),
      ...(operation.sourcePlan ? { sourcePlan: canonicalOperationSourcePlan(operation) } : {}),
      ...(operation.targetPlan ? { targetPlan: canonicalOperationTargetPlan(operation) } : {}),
      ...(operation.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
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
      ...(operation.stripeObjectId ? { stripeObjectId: operation.stripeObjectId } : {}),
      stripeIdempotencyKey: operation.stripeIdempotencyKey,
      livemode: operation.livemode,
    };
  },
});

/** Standard→Proの実適用を、同じrequestIdで成功した見積もりの不変snapshotへ束縛する。 */
export const getSuccessfulPaidPlanChangePreview = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    requestKey: v.string(),
    livemode: v.boolean(),
    expectedBillingVersion: v.number(),
    providerGeneration: v.number(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.string(),
    sourceStripePriceId: v.string(),
    targetStripePriceId: v.string(),
    prorationDate: v.number(),
  },
  returns: v.union(v.null(), v.object({ operationId: v.id("organizationStripeOperations") })),
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("kind", "previewPaidPlanChange")
          .eq("requestKey", args.requestKey),
      )
      .unique();
    if (
      operation?.status !== "succeeded" ||
      operation.livemode !== args.livemode ||
      operation.expectedBillingVersion !== args.expectedBillingVersion ||
      operation.providerGeneration !== args.providerGeneration ||
      canonicalOperationSourcePlan(operation) !== "standard" ||
      canonicalOperationTargetPlan(operation) !== "pro" ||
      operation.changeMode !== "immediate" ||
      operation.stripeSubscriptionIdSnapshot !== args.stripeSubscriptionId ||
      operation.stripeSubscriptionItemIdSnapshot !== args.stripeSubscriptionItemId ||
      operation.sourceStripePriceIdSnapshot !== args.sourceStripePriceId ||
      operation.targetStripePriceIdSnapshot !== args.targetStripePriceId ||
      operation.prorationDate !== args.prorationDate
    ) {
      return null;
    }
    return { operationId: operation._id };
  },
});

/** pending_if_incomplete後のPrice rotationでも、成功済みStandard→Pro intentだけをprovider変更の根拠にする。 */
export const getSuccessfulImmediatePaidPlanChangeOperation = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    livemode: v.boolean(),
    providerGeneration: v.number(),
    sourceBillingVersion: v.number(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.string(),
    sourceStripePriceId: v.string(),
    targetStripePriceId: v.string(),
  },
  returns: v.union(v.null(), v.object({ operationId: v.id("organizationStripeOperations") })),
  handler: async (ctx, args) => {
    const operations = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("providerGeneration", args.providerGeneration)
          .eq("kind", "changePaidPlanNow")
          .eq("status", "succeeded"),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("livemode"), args.livemode),
          q.eq(q.field("expectedBillingVersion"), args.sourceBillingVersion),
          q.or(
            q.and(
              q.eq(q.field("planIdVersion"), 2),
              q.eq(q.field("sourcePlan"), "standard"),
              q.eq(q.field("targetPlan"), "pro"),
            ),
            q.and(
              q.eq(q.field("planIdVersion"), undefined),
              q.eq(q.field("sourcePlan"), "pro"),
              q.eq(q.field("targetPlan"), "business"),
            ),
          ),
          q.eq(q.field("changeMode"), "immediate"),
          q.eq(q.field("stripeSubscriptionIdSnapshot"), args.stripeSubscriptionId),
          q.eq(q.field("stripeSubscriptionItemIdSnapshot"), args.stripeSubscriptionItemId),
          q.eq(q.field("sourceStripePriceIdSnapshot"), args.sourceStripePriceId),
          q.eq(q.field("targetStripePriceIdSnapshot"), args.targetStripePriceId),
          q.eq(q.field("stripeObjectId"), args.stripeSubscriptionId),
        ),
      )
      .take(2);
    if (operations.length !== 1) return null;
    const operation = operations[0];
    if (
      operation.prorationDate === undefined ||
      !Number.isSafeInteger(operation.prorationDate) ||
      operation.effectiveAt === undefined ||
      !Number.isSafeInteger(operation.effectiveAt) ||
      operation.completedAt === undefined
    ) {
      return null;
    }
    return { operationId: operation._id };
  },
});

/** Free予約・取消のretryが、初回操作で保存したprovider snapshotをそのまま再利用する。 */
export const getFreePlanChangeOperationByRequest = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    kind: v.union(v.literal("scheduleFree"), v.literal("cancelFreeSchedule")),
    requestKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      status: organizationStripeOperationStatusValidator,
      livemode: v.boolean(),
      expectedBillingVersion: v.optional(v.number()),
      providerGeneration: v.optional(v.number()),
      sourcePlan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
      targetPlan: v.optional(v.union(v.literal("free"), v.literal("standard"), v.literal("pro"))),
      restrictAtPeriodEnd: v.optional(v.literal(true)),
      changeMode: v.optional(v.union(v.literal("checkout"), v.literal("immediate"), v.literal("periodEnd"))),
      stripeSubscriptionIdSnapshot: v.optional(v.string()),
      stripeSubscriptionItemIdSnapshot: v.optional(v.string()),
      sourceStripePriceIdSnapshot: v.optional(v.string()),
      targetStripePriceIdSnapshot: v.optional(v.string()),
      prorationDate: v.optional(v.number()),
      effectiveAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", args.kind).eq("requestKey", args.requestKey),
      )
      .unique();
    if (!operation) return null;
    return {
      operationId: operation._id,
      status: operation.status,
      livemode: operation.livemode,
      ...(operation.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: operation.expectedBillingVersion }
        : {}),
      ...(operation.providerGeneration !== undefined ? { providerGeneration: operation.providerGeneration } : {}),
      ...(operation.sourcePlan ? { sourcePlan: canonicalOperationSourcePlan(operation) } : {}),
      ...(operation.targetPlan ? { targetPlan: canonicalOperationTargetPlan(operation) } : {}),
      ...(operation.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
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
    };
  },
});

/** providerの期間末解約を、旧Free予約と新しい解約予約のどちらへ収束させるか判定する。 */
export const getCancelAtPeriodEndRestrictionIntent = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    providerGeneration: v.number(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.string(),
    effectiveAt: v.number(),
  },
  returns: v.object({ restrictAtPeriodEnd: v.boolean() }),
  handler: async (ctx, args) => {
    const operations = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_providerGeneration", (q) =>
        q.eq("organizationId", args.organizationId).eq("providerGeneration", args.providerGeneration),
      )
      .order("desc")
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("kind"), "scheduleFree"), q.eq(q.field("kind"), "cancelFreeSchedule")),
          q.eq(q.field("targetPlan"), "free"),
          q.eq(q.field("changeMode"), "periodEnd"),
          q.eq(q.field("stripeSubscriptionIdSnapshot"), args.stripeSubscriptionId),
          q.eq(q.field("stripeSubscriptionItemIdSnapshot"), args.stripeSubscriptionItemId),
          q.eq(q.field("effectiveAt"), args.effectiveAt),
        ),
      )
      .take(1);
    const latestIntent = operations[0];
    // markerなしscheduleFreeだけがdeployment前から存在するFree予約の証拠になる。
    // その後に取消された予約や証跡のないprovider側解約からはFreeを新規生成しない。
    return {
      restrictAtPeriodEnd:
        latestIntent === undefined ||
        latestIntent.kind === "cancelFreeSchedule" ||
        latestIntent.restrictAtPeriodEnd === true,
    };
  },
});

/** 期間末有料変更を作成したoperationとScheduleの永続対応を、期限確定前に再検証する。 */
export const getScheduledPaidPlanChangeOperation = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    stripeSubscriptionScheduleId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.string(),
    providerGeneration: v.number(),
    effectiveAt: v.number(),
    livemode: v.boolean(),
  },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      sourceStripePriceId: v.string(),
      targetStripePriceId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const operations = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_stripeObjectId", (q) =>
        q.eq("organizationId", args.organizationId).eq("stripeObjectId", args.stripeSubscriptionScheduleId),
      )
      .filter((q) => q.eq(q.field("kind"), "schedulePaidPlanChange"))
      .take(2);
    if (operations.length !== 1) return null;
    const operation = operations[0];
    if (
      operation.kind !== "schedulePaidPlanChange" ||
      operation.status !== "succeeded" ||
      operation.livemode !== args.livemode ||
      operation.providerGeneration !== args.providerGeneration ||
      canonicalOperationSourcePlan(operation) !== "pro" ||
      canonicalOperationTargetPlan(operation) !== "standard" ||
      operation.changeMode !== "periodEnd" ||
      operation.stripeSubscriptionIdSnapshot !== args.stripeSubscriptionId ||
      operation.stripeSubscriptionItemIdSnapshot !== args.stripeSubscriptionItemId ||
      operation.effectiveAt !== args.effectiveAt ||
      !operation.sourceStripePriceIdSnapshot ||
      !operation.sourceStripePriceIdSnapshot.startsWith("price_") ||
      !operation.targetStripePriceIdSnapshot ||
      !operation.targetStripePriceIdSnapshot.startsWith("price_") ||
      operation.sourceStripePriceIdSnapshot === operation.targetStripePriceIdSnapshot
    ) {
      return null;
    }
    return {
      operationId: operation._id,
      sourceStripePriceId: operation.sourceStripePriceIdSnapshot,
      targetStripePriceId: operation.targetStripePriceIdSnapshot,
    };
  },
});

/** Price停止中のTrial作成を、ローカル同期済み契約と未確定provider副作用へ分けて回収する。 */
export const getTrialCreationRecoveryContext = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    requestKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      status: organizationStripeOperationStatusValidator,
      leaseToken: v.optional(v.string()),
      leaseExpiresAt: v.optional(v.number()),
      stripeObjectId: v.optional(v.string()),
      providerGeneration: v.optional(v.number()),
      stripePriceIdSnapshot: v.optional(v.string()),
      targetPlan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
      trialSubscriptionCreateSnapshot: v.optional(trialSubscriptionCreateSnapshotValidator),
      stripeIdempotencyKey: v.string(),
      livemode: v.boolean(),
      expectedBillingVersion: v.optional(v.number()),
      attemptCount: v.number(),
      lastErrorCode: v.optional(v.string()),
      mappingState: v.union(v.literal("none"), v.literal("matching"), v.literal("conflict")),
    }),
  ),
  handler: async (ctx, args) => {
    const operation = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("kind", "createTrialSubscription")
          .eq("requestKey", args.requestKey),
      )
      .unique();
    if (!operation) return null;

    let mappingState: "none" | "matching" | "conflict" = "none";
    if (operation.stripeObjectId) {
      const stripeSubscriptionId = operation.stripeObjectId;
      const mappings = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", operation.livemode).eq("stripeSubscriptionId", stripeSubscriptionId),
        )
        .take(2);
      if (mappings.length > 1) {
        mappingState = "conflict";
      } else if (mappings.length === 1) {
        const mapping = mappings[0];
        mappingState =
          mapping.organizationId === operation.organizationId &&
          mapping.stripeCustomerId === operation.trialSubscriptionCreateSnapshot?.stripeCustomerId &&
          mapping.stripePriceId === operation.stripePriceIdSnapshot &&
          mapping.providerGeneration === operation.providerGeneration
            ? "matching"
            : "conflict";
      }
    }

    return {
      operationId: operation._id,
      status: operation.status,
      ...(operation.leaseToken ? { leaseToken: operation.leaseToken } : {}),
      ...(operation.leaseExpiresAt !== undefined ? { leaseExpiresAt: operation.leaseExpiresAt } : {}),
      ...(operation.stripeObjectId ? { stripeObjectId: operation.stripeObjectId } : {}),
      ...(operation.providerGeneration !== undefined ? { providerGeneration: operation.providerGeneration } : {}),
      ...(operation.stripePriceIdSnapshot ? { stripePriceIdSnapshot: operation.stripePriceIdSnapshot } : {}),
      ...(operation.targetPlan && operation.targetPlan !== "free"
        ? { targetPlan: canonicalOperationTargetPlan(operation) as "standard" | "pro" }
        : {}),
      ...(operation.trialSubscriptionCreateSnapshot
        ? { trialSubscriptionCreateSnapshot: operation.trialSubscriptionCreateSnapshot }
        : {}),
      stripeIdempotencyKey: operation.stripeIdempotencyKey,
      livemode: operation.livemode,
      ...(operation.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: operation.expectedBillingVersion }
        : {}),
      attemptCount: operation.attemptCount,
      ...(operation.lastErrorCode ? { lastErrorCode: operation.lastErrorCode } : {}),
      mappingState,
    };
  },
});

/** persisted cleanup intentから、provider所有関係の検証に必要な値だけを復元する。 */
export const getInvalidTrialSubscriptionCleanupContext = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    requestKey: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      sourceOperationId: v.id("organizationStripeOperations"),
      stripeSubscriptionId: v.string(),
      stripeCustomerId: v.string(),
      stripePriceId: v.string(),
      providerGeneration: v.number(),
      livemode: v.boolean(),
      billingVersion: v.number(),
      errorCode: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const cleanup = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
        q.eq("organizationId", args.organizationId).eq("kind", "cancelSubscription").eq("requestKey", args.requestKey),
      )
      .unique();
    if (
      cleanup?.recoveryPurpose !== "invalidTrialSubscriptionCancellation" ||
      !cleanup.sourceOperationId ||
      !cleanup.stripeObjectId ||
      cleanup.providerGeneration === undefined ||
      !cleanup.stripePriceIdSnapshot
    ) {
      return null;
    }
    const [organization, billingState, customer, source] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
      ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
      ctx.db.get(cleanup.sourceOperationId),
    ]);
    if (
      !organization ||
      organization.isDeleted ||
      !billingState ||
      billingState.state.kind === "complimentary" ||
      !customer ||
      customer.livemode !== cleanup.livemode ||
      !source ||
      source.kind !== "createTrialSubscription" ||
      source.organizationId !== args.organizationId ||
      source.livemode !== cleanup.livemode ||
      source.providerGeneration !== cleanup.providerGeneration ||
      source.stripePriceIdSnapshot !== cleanup.stripePriceIdSnapshot ||
      source.stripeObjectId !== cleanup.stripeObjectId
    ) {
      return null;
    }
    return {
      sourceOperationId: source._id,
      stripeSubscriptionId: cleanup.stripeObjectId,
      stripeCustomerId: customer.stripeCustomerId,
      stripePriceId: cleanup.stripePriceIdSnapshot,
      providerGeneration: cleanup.providerGeneration,
      livemode: cleanup.livemode,
      billingVersion: billingState.version,
      errorCode: source.lastErrorCode ?? "invalid_trial_subscription",
    };
  },
});

export const getCheckoutOperationBySession = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    stripeSessionId: v.string(),
    livemode: v.boolean(),
  },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      kind: organizationStripeOperationKindValidator,
      status: organizationStripeOperationStatusValidator,
      expectedBillingVersion: v.optional(v.number()),
      providerGeneration: v.optional(v.number()),
      stripePriceIdSnapshot: v.optional(v.string()),
      targetPlan: v.optional(v.union(v.literal("free"), v.literal("standard"), v.literal("pro"))),
      stripeIdempotencyKey: v.string(),
      lastErrorCode: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const operations = await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_stripeObjectId", (q) =>
        q.eq("organizationId", args.organizationId).eq("stripeObjectId", args.stripeSessionId),
      )
      .take(2);
    if (operations.length !== 1 || operations[0].livemode !== args.livemode) return null;
    const operation = operations[0];
    return {
      operationId: operation._id,
      kind: operation.kind,
      status: operation.status,
      ...(operation.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: operation.expectedBillingVersion }
        : {}),
      ...(operation.providerGeneration !== undefined ? { providerGeneration: operation.providerGeneration } : {}),
      ...(operation.stripePriceIdSnapshot ? { stripePriceIdSnapshot: operation.stripePriceIdSnapshot } : {}),
      ...(operation.targetPlan ? { targetPlan: canonicalOperationTargetPlan(operation) } : {}),
      stripeIdempotencyKey: operation.stripeIdempotencyKey,
      ...(operation.lastErrorCode ? { lastErrorCode: operation.lastErrorCode } : {}),
    };
  },
});

/** 現在のpendingActivationに対応する未完了Checkoutだけを、組織・世代・modeへ束縛して返す。 */
export const getPendingCheckoutOperationForOrganization = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    providerGeneration: v.number(),
    livemode: v.boolean(),
  },
  returns: v.union(
    v.null(),
    v.object({
      operationId: v.id("organizationStripeOperations"),
      kind: paidCheckoutOperationKindValidator,
      providerGeneration: v.number(),
      expectedBillingVersion: v.optional(v.number()),
      targetPlan: v.union(v.literal("standard"), v.literal("pro")),
      stripePriceIdSnapshot: v.string(),
      stripeSessionId: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const operations = (
      await Promise.all(
        PAID_CHECKOUT_OPERATION_KINDS.map((kind) =>
          ctx.db
            .query("organizationStripeOperations")
            .withIndex("by_organizationId_and_providerGeneration_and_kind_and_status", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("providerGeneration", args.providerGeneration)
                .eq("kind", kind)
                .eq("status", "succeeded"),
            )
            .take(2),
        ),
      )
    ).flat();
    const candidates = operations.filter(
      (operation) =>
        operation.livemode === args.livemode &&
        operation.providerGeneration === args.providerGeneration &&
        operation.targetPlan !== undefined &&
        operation.targetPlan !== "free" &&
        operation.stripePriceIdSnapshot !== undefined &&
        operation.stripeObjectId !== undefined,
    );
    if (candidates.length !== 1) return null;
    const operation = candidates[0];
    if (
      (operation.kind !== "immediateProCheckout" && operation.kind !== "immediatePaidCheckout") ||
      operation.targetPlan === undefined ||
      operation.targetPlan === "free" ||
      !operation.stripePriceIdSnapshot ||
      !operation.stripeObjectId ||
      operation.providerGeneration === undefined
    ) {
      return null;
    }
    return {
      operationId: operation._id,
      kind: operation.kind,
      providerGeneration: operation.providerGeneration,
      ...(operation.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: operation.expectedBillingVersion }
        : {}),
      targetPlan: canonicalOperationTargetPlan(operation) as "standard" | "pro",
      stripePriceIdSnapshot: operation.stripePriceIdSnapshot,
      stripeSessionId: operation.stripeObjectId,
    };
  },
});

export const resolveOrganizationByCustomer = internalQuery({
  args: { stripeCustomerId: v.string(), livemode: v.boolean() },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      livemode: v.boolean(),
      billingState: v.object({
        state: organizationCanonicalBillingStateValidator,
        version: v.number(),
      }),
      providerGeneration: v.number(),
      latestStripeSubscriptionId: v.optional(v.string()),
      latestStripePriceId: v.optional(v.string()),
      latestStripePlan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
      latestStripeSubscriptionItemId: v.optional(v.string()),
      latestStripeSubscriptionScheduleId: v.optional(v.string()),
      latestStripeSubscriptionTerminal: v.boolean(),
      currentStripeSubscriptionId: v.optional(v.string()),
      restoreManagerPersonIds: v.optional(v.array(v.id("organizationPeople"))),
      restoreShopIds: v.optional(v.array(v.id("shops"))),
    }),
  ),
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_livemode_and_stripeCustomerId", (q) =>
        q.eq("livemode", args.livemode).eq("stripeCustomerId", args.stripeCustomerId),
      )
      .unique();
    if (!customer) return null;
    const [organization, billingState, latestSubscription] = await Promise.all([
      ctx.db.get(customer.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", customer.organizationId))
        .unique(),
      ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", customer.organizationId))
        .order("desc")
        .first(),
    ]);
    if (!organization || organization.isDeleted || !billingState || billingState.state.kind === "complimentary") {
      return null;
    }
    const canonicalBillingState = canonicalizeOrganizationBillingState(billingState.state);
    const restorationSelection =
      canonicalBillingState.kind === "pendingActivation" || canonicalBillingState.kind === "restricted"
        ? await getPaidRestorationSelection(ctx, customer.organizationId, canonicalBillingState)
        : undefined;
    return {
      organizationId: customer.organizationId,
      livemode: customer.livemode,
      billingState: { state: canonicalBillingState, version: billingState.version },
      providerGeneration: latestSubscription?.providerGeneration ?? 0,
      ...(latestSubscription ? { latestStripeSubscriptionId: latestSubscription.stripeSubscriptionId } : {}),
      ...(latestSubscription ? { latestStripePriceId: latestSubscription.stripePriceId } : {}),
      ...(latestSubscription?.plan
        ? {
            latestStripePlan: canonicalizeStripePaidPlan(latestSubscription.plan, latestSubscription.planIdVersion),
          }
        : {}),
      ...(latestSubscription?.stripeSubscriptionItemId
        ? { latestStripeSubscriptionItemId: latestSubscription.stripeSubscriptionItemId }
        : {}),
      ...(latestSubscription?.stripeSubscriptionScheduleId
        ? { latestStripeSubscriptionScheduleId: latestSubscription.stripeSubscriptionScheduleId }
        : {}),
      latestStripeSubscriptionTerminal: latestSubscription?.terminalAt !== undefined,
      ...(latestSubscription && !latestSubscription.terminalAt
        ? { currentStripeSubscriptionId: latestSubscription.stripeSubscriptionId }
        : {}),
      ...(restorationSelection
        ? {
            restoreManagerPersonIds: restorationSelection.managerPersonIds,
            restoreShopIds: restorationSelection.shopIds,
          }
        : {}),
    };
  },
});

async function getPaidRestorationSelection(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  state: Extract<typeof organizationCanonicalBillingStateValidator.type, { kind: "pendingActivation" | "restricted" }>,
) {
  if (state.kind === "restricted") {
    return {
      managerPersonIds: state.recoveryManagerPersonIds,
      shopIds: state.previousActiveShopIds,
    };
  }
  if (state.fallback === "restricted") {
    if (!state.restrictedFallbackState) return null;
    return {
      managerPersonIds: state.restrictedFallbackState.recoveryManagerPersonIds,
      shopIds: state.restrictedFallbackState.previousActiveShopIds,
    };
  }

  const [members, shops] = await Promise.all([
    ctx.db
      .query("organizationMembers")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", "active"))
      .collect(),
    ctx.db
      .query("shops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect(),
  ]);
  return {
    managerPersonIds: [...new Set(members.map((member) => member.personId))],
    shopIds: shops.filter((shop) => !shop.isDeleted && shop.operatingStatus === "active").map((shop) => shop._id),
  };
}

export const getSafetyContextByOrganization = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      billingState: organizationCanonicalBillingStateValidator,
      billingVersion: v.number(),
      stripeCustomerId: v.string(),
      livemode: v.boolean(),
      subscription: v.object({
        stripeSubscriptionId: v.string(),
        stripePriceId: v.string(),
        plan: v.optional(v.union(v.literal("standard"), v.literal("pro"))),
        stripeSubscriptionItemId: v.optional(v.string()),
        currentPeriodStartsAt: v.optional(v.number()),
        currentPeriodEndsAt: v.optional(v.number()),
        billingCycleAnchor: v.optional(v.number()),
        stripeSubscriptionScheduleId: v.optional(v.string()),
        providerGeneration: v.number(),
        status: v.string(),
        latestInvoiceId: v.optional(v.string()),
        terminal: v.boolean(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
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
    if (
      !organization ||
      organization.isDeleted ||
      !billingState ||
      (args.expectedBillingVersion !== undefined && billingState.version !== args.expectedBillingVersion) ||
      billingState.state.kind === "complimentary" ||
      !customer ||
      !latestSubscription ||
      customer.stripeCustomerId !== latestSubscription.stripeCustomerId ||
      customer.livemode !== latestSubscription.livemode
    ) {
      return null;
    }
    const canonicalBillingState = canonicalizeOrganizationBillingState(billingState.state);
    return {
      organizationId: args.organizationId,
      billingState: canonicalBillingState,
      billingVersion: billingState.version,
      stripeCustomerId: customer.stripeCustomerId,
      livemode: customer.livemode,
      subscription: {
        stripeSubscriptionId: latestSubscription.stripeSubscriptionId,
        stripePriceId: latestSubscription.stripePriceId,
        ...(latestSubscription.plan
          ? {
              plan: canonicalizeStripePaidPlan(latestSubscription.plan, latestSubscription.planIdVersion),
            }
          : {}),
        ...(latestSubscription.stripeSubscriptionItemId
          ? { stripeSubscriptionItemId: latestSubscription.stripeSubscriptionItemId }
          : {}),
        ...(latestSubscription.currentPeriodStartsAt !== undefined
          ? { currentPeriodStartsAt: latestSubscription.currentPeriodStartsAt }
          : {}),
        ...(latestSubscription.currentPeriodEndsAt !== undefined
          ? { currentPeriodEndsAt: latestSubscription.currentPeriodEndsAt }
          : {}),
        ...(latestSubscription.billingCycleAnchor !== undefined
          ? { billingCycleAnchor: latestSubscription.billingCycleAnchor }
          : {}),
        ...(latestSubscription.stripeSubscriptionScheduleId
          ? { stripeSubscriptionScheduleId: latestSubscription.stripeSubscriptionScheduleId }
          : {}),
        providerGeneration: latestSubscription.providerGeneration,
        status: latestSubscription.status,
        ...(latestSubscription.latestInvoiceId ? { latestInvoiceId: latestSubscription.latestInvoiceId } : {}),
        terminal: latestSubscription.terminalAt !== undefined,
      },
    };
  },
});

/** Webhook競合時に、課金状態が目的状態へ既に収束したかだけを再確認する。 */
export const getBillingStateForConvergence = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.union(
    v.null(),
    v.object({
      state: organizationCanonicalBillingStateValidator,
      version: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const [organization, billingState] = await Promise.all([
      ctx.db.get(args.organizationId),
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
        .unique(),
    ]);
    if (!organization || organization.isDeleted || !billingState) return null;
    return { state: canonicalizeOrganizationBillingState(billingState.state), version: billingState.version };
  },
});

export const getBillingEmailSyncContext = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.union(
    v.null(),
    v.object({
      organizationId: v.id("organizations"),
      billingEmail: v.string(),
      billingEmailSyncKey: v.optional(v.string()),
      organizationUpdatedAt: v.number(),
      billingVersion: v.number(),
      stripeCustomerId: v.string(),
      livemode: v.boolean(),
      providerGeneration: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
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
    if (
      !organization ||
      organization.isDeleted ||
      !organization.billingEmail ||
      !billingState ||
      billingState.state.kind === "complimentary" ||
      !customer
    )
      return null;
    return {
      organizationId: args.organizationId,
      billingEmail: organization.billingEmail,
      ...(organization.billingEmailSyncKey ? { billingEmailSyncKey: organization.billingEmailSyncKey } : {}),
      organizationUpdatedAt: organization.updatedAt,
      billingVersion: billingState.version,
      stripeCustomerId: customer.stripeCustomerId,
      livemode: customer.livemode,
      providerGeneration: latestSubscription?.providerGeneration ?? 0,
    };
  },
});

/** DB上で所有関係が既知のWebhook objectは、Stripeへ接続する前に支払い不要プランを遮断する。 */
export const getKnownWebhookObjectGuard = internalQuery({
  args: {
    type: stripeWebhookEventTypeValidator,
    objectId: v.string(),
    objectCustomerId: v.optional(v.string()),
    livemode: v.boolean(),
  },
  returns: v.union(v.null(), v.literal("eligible"), v.literal("complimentary")),
  handler: async (ctx, args) => {
    let organizationId: Id<"organizations"> | undefined;
    if (args.type.startsWith("customer.subscription.")) {
      const subscriptions = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeSubscriptionId", args.objectId),
        )
        .take(2);
      if (subscriptions.length === 1) organizationId = subscriptions[0].organizationId;
    } else if (args.type.startsWith("subscription_schedule.")) {
      const subscriptions = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionScheduleId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeSubscriptionScheduleId", args.objectId),
        )
        .take(2);
      if (subscriptions.length === 1) organizationId = subscriptions[0].organizationId;
    } else if (args.type.startsWith("invoice.")) {
      const subscriptions = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_latestInvoiceId", (q) =>
          q.eq("livemode", args.livemode).eq("latestInvoiceId", args.objectId),
        )
        .take(2);
      if (subscriptions.length === 1) organizationId = subscriptions[0].organizationId;
    } else if (args.type.startsWith("checkout.session.")) {
      const operations = await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_livemode_and_stripeObjectId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeObjectId", args.objectId),
        )
        .take(2);
      if (operations.length === 1) organizationId = operations[0].organizationId;
    }
    if (!organizationId && args.objectCustomerId) {
      const customer = await ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_livemode_and_stripeCustomerId", (q) =>
          q.eq("livemode", args.livemode).eq("stripeCustomerId", args.objectCustomerId as string),
        )
        .unique();
      organizationId = customer?.organizationId;
    }
    if (!organizationId) return null;
    const billingState = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!billingState) return null;
    return billingState.state.kind === "complimentary" ? "complimentary" : "eligible";
  },
});

function isPurposeAllowed(
  purpose:
    | "price"
    | "currentSubscriptionPrice"
    | "startCheckout"
    | "cancelCheckout"
    | "portal"
    | "scheduleFree"
    | "cancelFreeSchedule"
    | "changePaidPlan"
    | "schedulePaidPlanChange"
    | "cancelScheduledPlanChange",
  state: typeof organizationCanonicalBillingStateValidator.type,
  isActiveManager: boolean,
  isRecoveryManager: boolean,
) {
  if (state.kind === "complimentary") return false;
  switch (purpose) {
    case "price":
      return isActiveManager || isRecoveryManager;
    case "currentSubscriptionPrice":
      if (state.kind === "active") return isActiveManager && state.plan !== "free";
      if (state.kind === "scheduledChange" || state.kind === "grace") return isActiveManager;
      return (
        state.kind === "restricted" &&
        isRecoveryManager &&
        (state.reason === "paymentGraceExpired" ||
          state.reason === "paymentActivationFailed" ||
          state.reason === "unexpectedCancellation" ||
          state.reason === "trialEndedWithoutSubscription" ||
          state.reason === "scheduledCancellation")
      );
    case "startCheckout":
      if (state.kind === "restricted") return isRecoveryManager;
      if (state.kind === "pendingActivation") {
        return state.fallback === "restricted" ? isRecoveryManager : isActiveManager;
      }
      return isActiveManager && (state.kind === "trial" || (state.kind === "active" && state.plan === "free"));
    case "cancelCheckout":
      if (state.kind === "restricted") return isRecoveryManager;
      if (state.kind === "pendingActivation") {
        return state.fallback === "restricted" ? isRecoveryManager : isActiveManager;
      }
      return isActiveManager;
    case "portal":
      if (state.kind === "restricted") return isRecoveryManager;
      if (state.kind === "pendingActivation" && state.fallback === "restricted") return isRecoveryManager;
      return (
        isActiveManager &&
        (state.kind === "trial" ||
          state.kind === "grace" ||
          state.kind === "scheduledChange" ||
          (state.kind === "active" && state.plan !== "free"))
      );
    case "scheduleFree":
      return isActiveManager && state.kind === "active" && (state.plan === "standard" || state.plan === "pro");
    case "cancelFreeSchedule":
      return (
        isActiveManager &&
        state.kind === "scheduledChange" &&
        (state.currentPlan === "standard" || state.currentPlan === "pro") &&
        state.targetPlan === "free"
      );
    case "changePaidPlan":
      return (
        isActiveManager &&
        ((state.kind === "active" && state.plan === "standard") ||
          (state.kind === "pendingActivation" && state.plan === "pro" && state.fallback === "standard"))
      );
    case "schedulePaidPlanChange":
      return isActiveManager && state.kind === "active" && state.plan === "pro";
    case "cancelScheduledPlanChange":
      return (
        isActiveManager &&
        state.kind === "scheduledChange" &&
        state.currentPlan === "pro" &&
        state.targetPlan === "standard"
      );
  }
}

function canonicalOperationSourcePlan(
  operation: Pick<Doc<"organizationStripeOperations">, "sourcePlan" | "planIdVersion">,
) {
  return operation.sourcePlan ? canonicalizeStripePaidPlan(operation.sourcePlan, operation.planIdVersion) : undefined;
}

function canonicalOperationTargetPlan(
  operation: Pick<Doc<"organizationStripeOperations">, "targetPlan" | "planIdVersion">,
) {
  return operation.targetPlan ? canonicalizeStripeTargetPlan(operation.targetPlan, operation.planIdVersion) : undefined;
}
