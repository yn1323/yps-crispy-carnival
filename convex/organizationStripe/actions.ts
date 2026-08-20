"use node";

import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import Stripe from "stripe";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { getAppUrl } from "../_lib/config";
import { observedAction as action, observedInternalAction as internalAction } from "../_lib/errorObservability";
import { isReleaseFeatureEnabled } from "../_lib/releaseFeatures";
import { deriveOrganizationBillingPolicy } from "../organizationBilling/policy";
import {
  getConfiguredStripePriceId,
  getStripeBillingConfiguration,
  getStripeProviderSafetyConfiguration,
  STRIPE_API_VERSION,
  STRIPE_WEBHOOK_API_VERSION,
  type StripePaidPlan,
} from "./config";
import type { StripeWebhookEventType } from "./validators";

const unavailableReasonValidator = v.union(
  v.literal("configuration_pending"),
  v.literal("not_allowed"),
  v.literal("price_unavailable"),
  v.literal("in_progress"),
  v.literal("request_already_used"),
  v.literal("provider_unavailable"),
);

const redirectResultValidator = v.union(
  v.object({ status: v.literal("redirect"), url: v.string() }),
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
);

const changeResultValidator = v.union(
  v.object({ status: v.literal("accepted") }),
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
);

const availableUrlResultValidator = v.union(
  v.object({ status: v.literal("available"), url: v.string() }),
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
);

const checkoutCancellationResultValidator = v.union(
  v.object({ status: v.literal("cancelled") }),
  v.object({ status: v.literal("pending") }),
  v.object({ status: v.literal("unchanged") }),
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
);

const pendingCheckoutInspectionResultValidator = v.union(
  v.object({ status: v.literal("open"), url: v.string() }),
  v.object({ status: v.literal("cancelled") }),
  v.object({ status: v.literal("pending") }),
  v.object({ status: v.literal("unchanged") }),
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
);

const prorationPreviewResultValidator = v.union(
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
  v.object({
    status: v.literal("available"),
    currency: v.string(),
    amountDue: v.number(),
    currentPeriodEnd: v.number(),
    prorationDate: v.number(),
  }),
);

const priceResultValidator = v.union(
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
  v.object({
    status: v.literal("available"),
    currency: v.string(),
    unitAmount: v.number(),
    interval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
    intervalCount: v.number(),
    taxBehavior: v.union(v.literal("inclusive"), v.literal("exclusive")),
  }),
);

const currentSubscriptionPriceResultValidator = v.union(
  v.object({ status: v.literal("unavailable"), reason: unavailableReasonValidator }),
  v.object({
    status: v.literal("available"),
    currency: v.string(),
    unitAmount: v.number(),
    interval: v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year")),
    intervalCount: v.number(),
    taxBehavior: v.optional(v.union(v.literal("inclusive"), v.literal("exclusive"))),
  }),
);

type ActionPurpose =
  | "price"
  | "currentSubscriptionPrice"
  | "startCheckout"
  | "cancelCheckout"
  | "portal"
  | "scheduleFree"
  | "cancelFreeSchedule"
  | "changePaidPlan"
  | "schedulePaidPlanChange"
  | "cancelScheduledPlanChange";
type UnavailableReason =
  | "configuration_pending"
  | "not_allowed"
  | "price_unavailable"
  | "in_progress"
  | "request_already_used"
  | "provider_unavailable";
type UnavailableResult = { status: "unavailable"; reason: UnavailableReason };
type RedirectResult = { status: "redirect"; url: string } | UnavailableResult;
type ChangeResult = { status: "accepted" } | UnavailableResult;
type AvailableUrlResult = { status: "available"; url: string } | UnavailableResult;
type CheckoutCancellationResult =
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "unchanged" }
  | UnavailableResult;
type PendingCheckoutInspectionResult =
  | { status: "open"; url: string }
  | { status: "cancelled" }
  | { status: "pending" }
  | { status: "unchanged" }
  | UnavailableResult;
type ProrationPreviewResult =
  | UnavailableResult
  | {
      status: "available";
      currency: string;
      amountDue: number;
      currentPeriodEnd: number;
      prorationDate: number;
    };
type PriceResult =
  | UnavailableResult
  | {
      status: "available";
      currency: string;
      unitAmount: number;
      interval: "day" | "week" | "month" | "year";
      intervalCount: number;
      taxBehavior: "inclusive" | "exclusive";
    };
type CurrentSubscriptionPriceResult =
  | UnavailableResult
  | {
      status: "available";
      currency: string;
      unitAmount: number;
      interval: "day" | "week" | "month" | "year";
      intervalCount: number;
      taxBehavior?: "inclusive" | "exclusive";
    };
type StripeBillingCadence = {
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
};
type BillingStateSnapshot = { state: Doc<"organizationBillingStates">["state"]; version: number };
type BillingActionScope = { shopId: Id<"shops"> } | { organizationId: Id<"organizations"> };

const BILLING_EMAIL_CONVERGENCE_LIMIT = 4;
const INACTIVE_PRICE_RECOVERY_MAX_RECHECKS = 3;
const INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX = "price_inactive_subscription_pending_";
const INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE = "price_inactive_subscription_recovery_busy";
const INACTIVE_PRICE_RECOVERY_PROVIDER_RETRY_ERROR_CODE = "price_inactive_subscription_provider_retry";
type AuthorizedActionContext = {
  organizationId: Id<"organizations">;
  organizationName: string;
  billingEmail: string;
  personId: Id<"organizationPeople">;
  billingState: BillingStateSnapshot;
  stripeCustomerId?: string;
  stripeCustomerLivemode?: boolean;
  providerGeneration: number;
  currentStripeSubscriptionId?: string;
  currentStripeSubscriptionLivemode?: boolean;
  currentStripePriceId?: string;
  currentStripePlan?: StripePaidPlan;
  currentStripeSubscriptionItemId?: string;
  currentPeriodStartsAt?: number;
  currentPeriodEndsAt?: number;
  billingCycleAnchor?: number;
  stripeSubscriptionScheduleId?: string;
};
type ResolvedOrganization = {
  organizationId: Id<"organizations">;
  livemode: boolean;
  billingState: BillingStateSnapshot;
  providerGeneration: number;
  latestStripeSubscriptionId?: string;
  latestStripePriceId?: string;
  latestStripePlan?: StripePaidPlan;
  latestStripeSubscriptionItemId?: string;
  latestStripeSubscriptionScheduleId?: string;
  latestStripeSubscriptionTerminal: boolean;
  currentStripeSubscriptionId?: string;
  restoreManagerPersonIds?: Id<"organizationPeople">[];
  restoreShopIds?: Id<"shops">[];
};
type SynchronizedSubscription = {
  organization: ResolvedOrganization;
  providerGeneration: number;
  snapshotStale: boolean;
};
type WebhookProcessResult =
  | { kind: "processed"; organizationId?: Id<"organizations">; providerGeneration?: number }
  | { kind: "ignored"; errorCode?: string }
  | { kind: "retry" | "failed" | "actionRequired"; errorCode: string };
type StripeSafetyContext = {
  organizationId: Id<"organizations">;
  billingState: Doc<"organizationBillingStates">["state"];
  billingVersion: number;
  stripeCustomerId: string;
  livemode: boolean;
  subscription: {
    stripeSubscriptionId: string;
    stripePriceId: string;
    plan?: StripePaidPlan;
    stripeSubscriptionItemId?: string;
    currentPeriodStartsAt?: number;
    currentPeriodEndsAt?: number;
    billingCycleAnchor?: number;
    stripeSubscriptionScheduleId?: string;
    providerGeneration: number;
    status: string;
    latestInvoiceId?: string;
    terminal: boolean;
  };
};

/** 認証済みactorへ、サーバー側allowlistから選んだrecurring Priceだけを返す。 */
export const getPlanPrice = action({
  args: {
    shopId: v.id("shops"),
    targetPlan: v.union(v.literal("pro"), v.literal("business")),
  },
  returns: priceResultValidator,
  handler: async (ctx, args): Promise<PriceResult> =>
    await getPlanPriceForScope(ctx, { shopId: args.shopId }, args.targetPlan),
});

export const getPlanPriceForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
    targetPlan: v.union(v.literal("pro"), v.literal("business")),
  },
  returns: priceResultValidator,
  handler: async (ctx, args): Promise<PriceResult> =>
    await getPlanPriceForScope(ctx, { organizationId: args.organizationId }, args.targetPlan),
});

async function getPlanPriceForScope(
  ctx: ActionCtx,
  scope: BillingActionScope,
  targetPlan: StripePaidPlan,
): Promise<PriceResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, scope, "price");
  if (!context) return unavailable("not_allowed");
  const priceId = getConfiguredStripePriceId(configuration, targetPlan);
  if (!priceId) return unavailable("price_unavailable");

  try {
    const stripe = createStripeClient(configuration.secretKey);
    const price = await retrieveAllowedPrice(stripe, priceId, configuration.livemode);
    if (!price) return unavailable("price_unavailable");
    if (targetPlan === "business") {
      const proPrice = await retrieveAllowedPrice(stripe, configuration.proPriceId, configuration.livemode);
      if (!proPrice || proPrice.currency !== price.currency || !hasSameBillingCadence(proPrice, price)) {
        return unavailable("price_unavailable");
      }
    }
    return { status: "available", ...price };
  } catch {
    return unavailable("provider_unavailable");
  }
}

/** 認可済みactorへ、DBに保存済みの現在契約Priceの表示用金額だけを返す。 */
export const getCurrentSubscriptionPrice = action({
  args: { shopId: v.id("shops") },
  returns: currentSubscriptionPriceResultValidator,
  handler: async (ctx, args): Promise<CurrentSubscriptionPriceResult> => {
    if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration) return unavailable("configuration_pending");

    const context = await getAuthorizedContext(ctx, { shopId: args.shopId }, "currentSubscriptionPrice");
    if (!context) return unavailable("not_allowed");
    const displayedPaidPlan = getDisplayedPaidPlanForCurrentSubscriptionPrice(context.billingState.state);
    if (
      !displayedPaidPlan ||
      !context.currentStripeSubscriptionId ||
      !context.currentStripePriceId ||
      context.currentStripePlan !== displayedPaidPlan
    ) {
      return unavailable("price_unavailable");
    }
    if (context.currentStripeSubscriptionLivemode !== configuration.livemode) {
      return unavailable("configuration_pending");
    }

    try {
      const stripe = createStripeClient(configuration.secretKey);
      const price = await retrieveExistingRecurringPrice(stripe, context.currentStripePriceId, configuration.livemode);
      return price ? { status: "available", ...price } : unavailable("price_unavailable");
    } catch {
      return unavailable("provider_unavailable");
    }
  },
});

/** TODO[narrow]: 旧client配布終了を確認後、targetPlan付きgetPlanPriceへ一本化して削除する。 */
export const getProPrice = action({
  args: { shopId: v.id("shops") },
  returns: priceResultValidator,
  handler: async (ctx, args): Promise<PriceResult> => {
    if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
    const configuration = getStripeBillingConfiguration();
    if (configuration.status !== "ready") return unavailable("configuration_pending");

    const context = await getAuthorizedContext(ctx, { shopId: args.shopId }, "price");
    if (!context) return unavailable("not_allowed");

    const stripe = createStripeClient(configuration.secretKey);
    const price = await retrieveAllowedPrice(stripe, configuration.proPriceId, configuration.livemode);
    if (!price) return unavailable("price_unavailable");
    return {
      status: "available" as const,
      currency: price.currency,
      unitAmount: price.unitAmount,
      interval: price.interval,
      intervalCount: price.intervalCount,
      taxBehavior: price.taxBehavior,
    };
  },
});

export const startPaidCheckout = action({
  args: {
    shopId: v.id("shops"),
    targetPlan: v.union(v.literal("pro"), v.literal("business")),
    requestId: v.string(),
  },
  returns: availableUrlResultValidator,
  handler: async (ctx, args): Promise<AvailableUrlResult> =>
    await startPaidCheckoutForPlan(ctx, { ...args, scope: { shopId: args.shopId } }),
});

export const startPaidCheckoutForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
    targetPlan: v.union(v.literal("pro"), v.literal("business")),
    requestId: v.string(),
  },
  returns: availableUrlResultValidator,
  handler: async (ctx, args): Promise<AvailableUrlResult> =>
    await startPaidCheckoutForPlan(ctx, { ...args, scope: { organizationId: args.organizationId } }),
});

/**
 * pendingActivationに対応するCheckoutをproviderで照合し、画面復帰後に利用者が選べる安全な状態だけを返す。
 * Sessionがopenでも、この確認だけでは支払いを取り消さない。
 */
export const inspectPendingCheckoutForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: pendingCheckoutInspectionResultValidator,
  handler: async (ctx, args): Promise<PendingCheckoutInspectionResult> => {
    if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
    const configuration = getStripeBillingConfiguration();
    if (configuration.status !== "ready") return unavailable("configuration_pending");
    const context = await getAuthorizedContext(ctx, { organizationId: args.organizationId }, "cancelCheckout");
    if (!context) return unavailable("not_allowed");
    if (context.billingState.state.kind !== "pendingActivation") return { status: "unchanged" };
    if (!context.stripeCustomerId || context.stripeCustomerLivemode !== configuration.livemode) {
      return unavailable("configuration_pending");
    }

    const operation = await ctx.runQuery(
      internal.organizationStripe.queries.getPendingCheckoutOperationForOrganization,
      {
        organizationId: context.organizationId,
        providerGeneration: context.providerGeneration + 1,
        livemode: configuration.livemode,
      },
    );
    if (!operation) return { status: "unchanged" };

    const stripe = createStripeClient(configuration.secretKey);
    try {
      const session = await stripe.checkout.sessions.retrieve(operation.stripeSessionId);
      assertCheckoutSession(session, {
        organizationId: context.organizationId,
        operationId: operation.operationId,
        stripeSessionId: operation.stripeSessionId,
        providerGeneration: operation.providerGeneration,
        livemode: configuration.livemode,
        customerId: context.stripeCustomerId,
        priceId: operation.stripePriceIdSnapshot,
        mode: "subscription",
      });

      if (session.status === "open") {
        return session.url ? { status: "open", url: session.url } : unavailable("provider_unavailable");
      }
      if (session.status !== "expired") return { status: "pending" };

      return await convergeExpiredPendingCheckout(ctx, {
        organizationId: context.organizationId,
        billingVersion: context.billingState.version,
        fallback: context.billingState.state.fallback,
        operationId: operation.operationId,
        stripeSessionId: operation.stripeSessionId,
        livemode: configuration.livemode,
        correlationSuffix: "checkout-expired",
        releaseReason: "checkout_session_expired",
      });
    } catch {
      return unavailable("provider_unavailable");
    }
  },
});

/**
 * Checkoutのキャンセル戻りを、Stripe側のSessionがexpiredになったことを確認してからfallbackへ収束させる。
 * 戻りURLやclientのstateだけでは支払い結果を確定しない。
 */
export const cancelPendingCheckoutForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
  },
  returns: checkoutCancellationResultValidator,
  handler: async (ctx, args): Promise<CheckoutCancellationResult> => {
    if (!isReleaseFeatureEnabled("billing")) return { status: "unavailable" as const, reason: "not_allowed" as const };
    const configuration = getStripeBillingConfiguration();
    if (configuration.status !== "ready") {
      return { status: "unavailable" as const, reason: "configuration_pending" as const };
    }
    const context = await getAuthorizedContext(ctx, { organizationId: args.organizationId }, "cancelCheckout");
    if (!context) return { status: "unavailable" as const, reason: "not_allowed" as const };
    if (context.billingState.state.kind !== "pendingActivation") {
      return { status: "unchanged" as const };
    }
    if (!context.stripeCustomerId || context.stripeCustomerLivemode !== configuration.livemode) {
      return { status: "unavailable" as const, reason: "configuration_pending" as const };
    }

    const operation = await ctx.runQuery(
      internal.organizationStripe.queries.getPendingCheckoutOperationForOrganization,
      {
        organizationId: context.organizationId,
        providerGeneration: context.providerGeneration + 1,
        livemode: configuration.livemode,
      },
    );
    if (!operation) return { status: "unchanged" as const };

    const stripe = createStripeClient(configuration.secretKey);
    try {
      let session = await stripe.checkout.sessions.retrieve(operation.stripeSessionId);
      assertCheckoutSession(session, {
        organizationId: context.organizationId,
        operationId: operation.operationId,
        stripeSessionId: operation.stripeSessionId,
        providerGeneration: operation.providerGeneration,
        livemode: configuration.livemode,
        customerId: context.stripeCustomerId,
        priceId: operation.stripePriceIdSnapshot,
        mode: "subscription",
      });

      if (session.status === "complete") return { status: "pending" as const };
      if (session.status === "open") {
        session = await expireOpenCheckoutSession(stripe, session);
        assertCheckoutSession(session, {
          organizationId: context.organizationId,
          operationId: operation.operationId,
          stripeSessionId: operation.stripeSessionId,
          providerGeneration: operation.providerGeneration,
          livemode: configuration.livemode,
          customerId: context.stripeCustomerId,
          priceId: operation.stripePriceIdSnapshot,
          mode: "subscription",
        });
      }
      if (session.status !== "expired") return { status: "pending" as const };

      return await convergeExpiredPendingCheckout(ctx, {
        organizationId: context.organizationId,
        billingVersion: context.billingState.version,
        fallback: context.billingState.state.fallback,
        operationId: operation.operationId,
        stripeSessionId: operation.stripeSessionId,
        livemode: configuration.livemode,
        correlationSuffix: "checkout-cancelled",
        releaseReason: "checkout_session_cancelled",
      });
    } catch {
      return { status: "unavailable" as const, reason: "provider_unavailable" as const };
    }
  },
});

/**
 * Trialの継続登録とFree/制限中からのPro開始を、現在状態からサーバー側で振り分ける。
 * TODO[narrow]: 旧client配布終了とimmediateProCheckout row 0を確認後、startPaidCheckoutへ一本化して削除する。
 */
export const startProCheckout = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: redirectResultValidator,
  handler: async (ctx, args): Promise<RedirectResult> => {
    if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
    const configuration = getStripeBillingConfiguration();
    if (configuration.status !== "ready") return unavailable("configuration_pending");

    const context = await getAuthorizedContext(ctx, { shopId: args.shopId }, "startCheckout");
    if (!context) return unavailable("not_allowed");
    const livemode = configuration.livemode;
    if (
      (context.stripeCustomerLivemode !== undefined && context.stripeCustomerLivemode !== livemode) ||
      (context.currentStripeSubscriptionLivemode !== undefined &&
        context.currentStripeSubscriptionLivemode !== livemode)
    ) {
      return unavailable("configuration_pending");
    }

    const billingState = context.billingState.state;
    const isTrial = billingState.kind === "trial";
    if (isTrial && (billingState.selectedPaidPlan || context.currentStripeSubscriptionId)) {
      return unavailable("not_allowed");
    }
    if (!isTrial && context.currentStripeSubscriptionId) return unavailable("not_allowed");

    const kind = isTrial ? ("trialSetupCheckout" as const) : ("immediateProCheckout" as const);
    const providerGeneration = context.providerGeneration + 1;
    const beginArgs = {
      organizationId: context.organizationId,
      kind,
      requestKey: args.requestId,
      livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration,
      stripePriceIdSnapshot: configuration.proPriceId,
    };
    let operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, beginArgs);
    const stripe = createStripeClient(configuration.secretKey);
    if (operation.conflict || !operation.created) {
      if (operation.status === "succeeded" && operation.stripeObjectId) {
        const existing = await stripe.checkout.sessions.retrieve(operation.stripeObjectId);
        assertCheckoutSession(existing, {
          organizationId: context.organizationId,
          operationId: operation.operationId,
          stripeSessionId: existing.id,
          providerGeneration,
          livemode,
          customerId: context.stripeCustomerId,
          priceId: operation.stripePriceIdSnapshot ?? configuration.proPriceId,
        });
        if (existing.status === "expired") {
          await ctx.runMutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
            operationId: operation.operationId,
            stripeSessionId: existing.id,
          });
          operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, beginArgs);
        } else if (existing.status !== "complete" && existing.url) {
          return { status: "redirect" as const, url: existing.url };
        } else {
          return unavailable("request_already_used");
        }
      }
      if (!operation.created) {
        return unavailable(
          operation.conflict || operation.status === "processing" ? "in_progress" : "request_already_used",
        );
      }
    }
    const operationLease = requireOperationLease(operation);
    const checkoutPriceId = operation.stripePriceIdSnapshot;
    if (!checkoutPriceId) throw new Error("checkout_price_snapshot_missing");

    let pendingActivationStarted = false;
    try {
      const price = await retrieveAllowedPrice(stripe, checkoutPriceId, livemode);
      if (!price) {
        await finishOperation(ctx, operation.operationId, operationLease, "failed", undefined, "price_invalid");
        return unavailable("price_unavailable");
      }
      const stripeCustomerId = await ensureStripeCustomer(stripe, ctx, {
        organizationId: context.organizationId,
        organizationName: context.organizationName,
        billingEmail: context.billingEmail,
        existingCustomerId: context.stripeCustomerId,
        livemode,
        idempotencyKey: `${operation.stripeIdempotencyKey}:customer`,
      });

      if (!isTrial && billingState.kind !== "pendingActivation") {
        const fallback = billingState.kind === "restricted" ? ("restricted" as const) : ("free" as const);
        const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: context.organizationId,
          expectedVersion: context.billingState.version,
          state: { kind: "pendingActivation", plan: "pro", fallback },
          correlationId: `stripe:${operation.operationId}:pending-activation`,
        });
        if (!transition.changed) {
          await finishOperation(
            ctx,
            operation.operationId,
            operationLease,
            "failed",
            undefined,
            "billing_version_conflict",
          );
          return unavailable("in_progress");
        }
        pendingActivationStarted = true;
      }

      const settingsUrl = billingSettingsUrl(context.organizationId);
      const metadata = stripeMetadata({
        organizationId: context.organizationId,
        operationId: operation.operationId,
        providerGeneration,
        priceId: checkoutPriceId,
      });
      const session = await stripe.checkout.sessions.create(
        isTrial
          ? {
              mode: "setup",
              customer: stripeCustomerId,
              payment_method_types: ["card"],
              client_reference_id: String(context.organizationId),
              metadata,
              setup_intent_data: { metadata },
              success_url: withStripeResult(settingsUrl, "returned"),
              cancel_url: withStripeResult(settingsUrl, "cancelled"),
              locale: "ja",
            }
          : {
              mode: "subscription",
              customer: stripeCustomerId,
              payment_method_types: ["card"],
              client_reference_id: String(context.organizationId),
              line_items: [{ price: checkoutPriceId, quantity: 1 }],
              metadata,
              subscription_data: { metadata },
              success_url: withStripeResult(settingsUrl, "returned"),
              cancel_url: withStripeResult(settingsUrl, "cancelled"),
              locale: "ja",
            },
        { idempotencyKey: operation.stripeIdempotencyKey },
      );
      if (!session.url || session.livemode !== livemode) {
        throw new Error("checkout_session_invalid");
      }
      await finishOperation(ctx, operation.operationId, operationLease, "succeeded", session.id);
      return { status: "redirect" as const, url: session.url };
    } catch (error) {
      if (pendingActivationStarted) {
        await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: context.organizationId,
          expectedVersion: context.billingState.version + 1,
          state: { kind: "paymentFailed" },
          correlationId: `stripe:${operation.operationId}:checkout-create-failed`,
        });
      }
      await finishOperation(
        ctx,
        operation.operationId,
        operationLease,
        "retrying",
        undefined,
        safeStripeErrorCode(error),
      );
      return unavailable("configuration_pending");
    }
  },
});

async function startPaidCheckoutForPlan(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; targetPlan: StripePaidPlan; requestId: string },
): Promise<AvailableUrlResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const targetPriceId = getConfiguredStripePriceId(configuration, args.targetPlan);
  if (!targetPriceId) return unavailable("price_unavailable");

  const context = await getAuthorizedContext(ctx, args.scope, "startCheckout");
  if (!context) return unavailable("not_allowed");
  const livemode = configuration.livemode;
  if (
    (context.stripeCustomerLivemode !== undefined && context.stripeCustomerLivemode !== livemode) ||
    (context.currentStripeSubscriptionLivemode !== undefined && context.currentStripeSubscriptionLivemode !== livemode)
  ) {
    return unavailable("configuration_pending");
  }

  const billingState = context.billingState.state;
  const isTrial = billingState.kind === "trial";
  if (isTrial && (billingState.selectedPaidPlan || context.currentStripeSubscriptionId)) {
    return unavailable("not_allowed");
  }
  if (!isTrial && context.currentStripeSubscriptionId) return unavailable("not_allowed");

  const kind = isTrial ? ("trialSetupCheckout" as const) : ("immediatePaidCheckout" as const);
  const providerGeneration = context.providerGeneration + 1;
  const beginArgs = {
    organizationId: context.organizationId,
    kind,
    requestKey: args.requestId,
    livemode,
    expectedBillingVersion: context.billingState.version,
    providerGeneration,
    targetPlan: args.targetPlan,
    changeMode: "checkout" as const,
    stripePriceIdSnapshot: targetPriceId,
    targetStripePriceIdSnapshot: targetPriceId,
  };
  let operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, beginArgs);
  const stripe = createStripeClient(configuration.secretKey);
  if (operation.conflict || !operation.created) {
    if (operation.status === "succeeded" && operation.stripeObjectId) {
      const existing = await stripe.checkout.sessions.retrieve(operation.stripeObjectId);
      assertCheckoutSession(existing, {
        organizationId: context.organizationId,
        operationId: operation.operationId,
        stripeSessionId: existing.id,
        providerGeneration,
        livemode,
        customerId: context.stripeCustomerId,
        priceId: operation.stripePriceIdSnapshot ?? targetPriceId,
      });
      if (existing.status === "expired") {
        await ctx.runMutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
          operationId: operation.operationId,
          stripeSessionId: existing.id,
        });
        operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, beginArgs);
      } else if (existing.status !== "complete" && existing.url) {
        return { status: "available", url: existing.url };
      } else {
        return unavailable("request_already_used");
      }
    }
    if (!operation.created) {
      return unavailable(
        operation.conflict || operation.status === "processing" ? "in_progress" : "request_already_used",
      );
    }
  }
  const operationLease = requireOperationLease(operation);
  const checkoutPriceId = operation.stripePriceIdSnapshot;
  if (!checkoutPriceId || operation.targetPlan !== args.targetPlan) {
    await finishOperation(ctx, operation.operationId, operationLease, "actionRequired", undefined, "intent_mismatch");
    return unavailable("request_already_used");
  }

  let pendingActivationStarted = false;
  try {
    const price = await retrieveAllowedPrice(stripe, checkoutPriceId, livemode);
    if (!price) {
      await finishOperation(ctx, operation.operationId, operationLease, "failed", undefined, "price_invalid");
      return unavailable("price_unavailable");
    }
    if (args.targetPlan === "business") {
      const proPrice = await retrieveAllowedPrice(stripe, configuration.proPriceId, livemode);
      if (!proPrice || proPrice.currency !== price.currency || !hasSameBillingCadence(proPrice, price)) {
        await finishOperation(
          ctx,
          operation.operationId,
          operationLease,
          "failed",
          undefined,
          "price_compatibility_invalid",
        );
        return unavailable("price_unavailable");
      }
    }
    const stripeCustomerId = await ensureStripeCustomer(stripe, ctx, {
      organizationId: context.organizationId,
      organizationName: context.organizationName,
      billingEmail: context.billingEmail,
      existingCustomerId: context.stripeCustomerId,
      livemode,
      idempotencyKey: `${operation.stripeIdempotencyKey}:customer`,
    });

    if (!isTrial && billingState.kind !== "pendingActivation") {
      const fallback = billingState.kind === "restricted" ? ("restricted" as const) : ("free" as const);
      const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: context.organizationId,
        expectedVersion: context.billingState.version,
        state: { kind: "pendingActivation", plan: args.targetPlan, fallback },
        correlationId: `stripe:${operation.operationId}:pending-activation`,
      });
      if (!transition.changed) {
        await finishOperation(
          ctx,
          operation.operationId,
          operationLease,
          "failed",
          undefined,
          "billing_version_conflict",
        );
        return unavailable("in_progress");
      }
      pendingActivationStarted = true;
    }

    const settingsUrl = billingSettingsUrl(context.organizationId);
    const metadata = stripeMetadata({
      organizationId: context.organizationId,
      operationId: operation.operationId,
      providerGeneration,
      priceId: checkoutPriceId,
    });
    const session = await stripe.checkout.sessions.create(
      isTrial
        ? {
            mode: "setup",
            customer: stripeCustomerId,
            payment_method_types: ["card"],
            client_reference_id: String(context.organizationId),
            metadata,
            setup_intent_data: { metadata },
            success_url: withStripeResult(settingsUrl, "returned"),
            cancel_url: withStripeResult(settingsUrl, "cancelled"),
            locale: "ja",
          }
        : {
            mode: "subscription",
            customer: stripeCustomerId,
            payment_method_types: ["card"],
            client_reference_id: String(context.organizationId),
            line_items: [{ price: checkoutPriceId, quantity: 1 }],
            metadata,
            subscription_data: { metadata },
            success_url: withStripeResult(settingsUrl, "returned"),
            cancel_url: withStripeResult(settingsUrl, "cancelled"),
            locale: "ja",
          },
      { idempotencyKey: operation.stripeIdempotencyKey },
    );
    if (!session.url || session.livemode !== livemode) throw new Error("checkout_session_invalid");
    await finishOperation(ctx, operation.operationId, operationLease, "succeeded", session.id);
    return { status: "available", url: session.url };
  } catch (error) {
    if (pendingActivationStarted) {
      await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: context.organizationId,
        expectedVersion: context.billingState.version + 1,
        state: { kind: "paymentFailed" },
        correlationId: `stripe:${operation.operationId}:checkout-create-failed`,
      });
    }
    await finishOperation(
      ctx,
      operation.operationId,
      operationLease,
      "retrying",
      undefined,
      safeStripeErrorCode(error),
    );
    return unavailable("provider_unavailable");
  }
}

export const previewPaidPlanChange = action({
  args: {
    shopId: v.id("shops"),
    targetPlan: v.literal("business"),
    requestId: v.string(),
  },
  returns: prorationPreviewResultValidator,
  handler: async (ctx, args): Promise<ProrationPreviewResult> =>
    await previewImmediatePaidPlanChange(ctx, { ...args, scope: { shopId: args.shopId } }),
});

export const previewPaidPlanChangeForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
    targetPlan: v.literal("business"),
    requestId: v.string(),
  },
  returns: prorationPreviewResultValidator,
  handler: async (ctx, args): Promise<ProrationPreviewResult> =>
    await previewImmediatePaidPlanChange(ctx, { ...args, scope: { organizationId: args.organizationId } }),
});

export const changePaidPlanNow = action({
  args: {
    shopId: v.id("shops"),
    targetPlan: v.literal("business"),
    requestId: v.string(),
    prorationDate: v.number(),
  },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await applyImmediatePaidPlanChange(ctx, { ...args, scope: { shopId: args.shopId } }),
});

export const changePaidPlanNowForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
    targetPlan: v.literal("business"),
    requestId: v.string(),
    prorationDate: v.number(),
  },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await applyImmediatePaidPlanChange(ctx, { ...args, scope: { organizationId: args.organizationId } }),
});

export const schedulePaidPlanChange = action({
  args: {
    shopId: v.id("shops"),
    targetPlan: v.union(v.literal("pro"), v.literal("free")),
    requestId: v.string(),
  },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> => {
    if (args.targetPlan === "free") {
      return unavailable("not_allowed");
    }
    return await scheduleBusinessToPro(ctx, { ...args, targetPlan: "pro", scope: { shopId: args.shopId } });
  },
});

export const schedulePaidPlanChangeForOrganization = action({
  args: {
    organizationId: v.id("organizations"),
    targetPlan: v.union(v.literal("pro"), v.literal("free")),
    requestId: v.string(),
  },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> => {
    if (args.targetPlan === "free") return unavailable("not_allowed");
    return await scheduleBusinessToPro(ctx, {
      ...args,
      targetPlan: "pro",
      scope: { organizationId: args.organizationId },
    });
  },
});

/** 現在の支払い済み期間の終了時に契約を終了し、データ保持の利用停止状態へ移す。 */
export const scheduleServiceStopAtPeriodEnd = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await updateCancelAtPeriodEnd(ctx, {
      scope: { shopId: args.shopId },
      requestId: args.requestId,
      purpose: "scheduleFree",
      cancelAtPeriodEnd: true,
      restrictAtPeriodEnd: true,
    }),
});

export const scheduleServiceStopAtPeriodEndForOrganization = action({
  args: { organizationId: v.id("organizations"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await updateCancelAtPeriodEnd(ctx, {
      scope: { organizationId: args.organizationId },
      requestId: args.requestId,
      purpose: "scheduleFree",
      cancelAtPeriodEnd: true,
      restrictAtPeriodEnd: true,
    }),
});

export const cancelScheduledPlanChange = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await cancelAnyScheduledPlanChange(ctx, { ...args, scope: { shopId: args.shopId } }),
});

export const cancelScheduledPlanChangeForOrganization = action({
  args: { organizationId: v.id("organizations"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await cancelAnyScheduledPlanChange(ctx, { ...args, scope: { organizationId: args.organizationId } }),
});

export const openCustomerPortal = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: redirectResultValidator,
  handler: async (ctx, args): Promise<RedirectResult> =>
    await openCustomerPortalForScope(ctx, { scope: { shopId: args.shopId }, requestId: args.requestId }),
});

export const openCustomerPortalForOrganization = action({
  args: { organizationId: v.id("organizations"), requestId: v.string() },
  returns: redirectResultValidator,
  handler: async (ctx, args): Promise<RedirectResult> =>
    await openCustomerPortalForScope(ctx, {
      scope: { organizationId: args.organizationId },
      requestId: args.requestId,
    }),
});

async function openCustomerPortalForScope(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; requestId: string },
): Promise<RedirectResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, args.scope, "portal");
  if (!context?.stripeCustomerId) return unavailable("not_allowed");

  const livemode = configuration.livemode;
  if (context.stripeCustomerLivemode !== livemode) return unavailable("configuration_pending");
  const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
    organizationId: context.organizationId,
    kind: "portalSession",
    requestKey: args.requestId,
    livemode,
    expectedBillingVersion: context.billingState.version,
    providerGeneration: context.providerGeneration || undefined,
  });
  if (!operation.created) return unavailable(operation.conflict ? "in_progress" : "request_already_used");
  const operationLease = requireOperationLease(operation);

  try {
    const stripe = createStripeClient(configuration.secretKey);
    await verifyMappedCustomer(stripe, context.stripeCustomerId, context.organizationId, livemode);
    const portalConfiguration = await stripe.billingPortal.configurations.retrieve(configuration.portalConfigurationId);
    if (
      !portalConfiguration.active ||
      !portalConfiguration.features.payment_method_update.enabled ||
      !portalConfiguration.features.invoice_history.enabled ||
      portalConfiguration.features.subscription_cancel.enabled ||
      portalConfiguration.features.subscription_update.enabled ||
      portalConfiguration.features.customer_update.enabled
    ) {
      throw new Error("portal_configuration_unsafe");
    }
    const session = await stripe.billingPortal.sessions.create(
      {
        customer: context.stripeCustomerId,
        configuration: configuration.portalConfigurationId,
        return_url: billingSettingsUrl(context.organizationId),
      },
      { idempotencyKey: operation.stripeIdempotencyKey },
    );
    await finishOperation(ctx, operation.operationId, operationLease, "succeeded", session.id);
    return { status: "redirect" as const, url: session.url };
  } catch (error) {
    await finishOperation(
      ctx,
      operation.operationId,
      operationLease,
      "retrying",
      undefined,
      safeStripeErrorCode(error),
    );
    return unavailable("configuration_pending");
  }
}

/** 旧client互換alias。新しいFree予約は受け付けず、既存予約の取消だけを別actionで維持する。 */
export const scheduleFreeAtPeriodEnd = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (): Promise<ChangeResult> => unavailable("not_allowed"),
});

/** TODO[narrow]: 旧client配布終了を確認後、cancelScheduledPlanChangeへ一本化して削除する。 */
export const cancelScheduledFree = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await updateCancelAtPeriodEnd(ctx, {
      scope: { shopId: args.shopId },
      requestId: args.requestId,
      purpose: "cancelFreeSchedule",
      cancelAtPeriodEnd: false,
    }),
});

/** cancel_at_period_end のprovider反映後に停止しても、同じoperationで最新状態へ収束する。 */
export const reconcileCancelAtPeriodEndChange = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
    operationKind: v.union(v.literal("scheduleFree"), v.literal("cancelFreeSchedule")),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const persisted = await ctx.runQuery(internal.organizationStripe.queries.getFreePlanChangeOperationByRequest, {
      organizationId: args.organizationId,
      kind: args.operationKind,
      requestKey: args.requestId,
    });
    if (!persisted) return null;
    if (
      persisted.expectedBillingVersion === undefined ||
      persisted.providerGeneration === undefined ||
      !persisted.sourcePlan ||
      persisted.targetPlan !== "free" ||
      persisted.changeMode !== "periodEnd" ||
      !persisted.stripeSubscriptionIdSnapshot ||
      !persisted.stripeSubscriptionItemIdSnapshot ||
      !persisted.sourceStripePriceIdSnapshot ||
      persisted.effectiveAt === undefined ||
      persisted.expectedBillingVersion !== args.expectedBillingVersion
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.terminalizeInvalidPaidPlanChangeRecovery, {
        operationId: persisted.operationId,
        errorCode: "free_plan_change_snapshot_invalid",
      });
      return null;
    }
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (!context) {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    const cancelAtPeriodEnd = args.operationKind === "scheduleFree";
    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: args.organizationId,
      kind: args.operationKind,
      requestKey: args.requestId,
      livemode: persisted.livemode,
      expectedBillingVersion: persisted.expectedBillingVersion,
      providerGeneration: persisted.providerGeneration,
      sourcePlan: persisted.sourcePlan,
      targetPlan: "free",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: persisted.stripeSubscriptionIdSnapshot,
      stripeSubscriptionItemIdSnapshot: persisted.stripeSubscriptionItemIdSnapshot,
      sourceStripePriceIdSnapshot: persisted.sourceStripePriceIdSnapshot,
      ...(persisted.targetStripePriceIdSnapshot
        ? { targetStripePriceIdSnapshot: persisted.targetStripePriceIdSnapshot }
        : {}),
      ...(persisted.prorationDate !== undefined ? { prorationDate: persisted.prorationDate } : {}),
      effectiveAt: persisted.effectiveAt,
      ...(persisted.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
    });
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    if (
      operation.providerGeneration !== context.subscription.providerGeneration ||
      persisted.livemode !== context.livemode ||
      persisted.stripeSubscriptionIdSnapshot !== context.subscription.stripeSubscriptionId ||
      persisted.stripeSubscriptionItemIdSnapshot !== context.subscription.stripeSubscriptionItemId ||
      persisted.sourceStripePriceIdSnapshot !== context.subscription.stripePriceId
    ) {
      await finishOperation(
        ctx,
        operation.operationId,
        leaseToken,
        "actionRequired",
        undefined,
        "free_plan_change_provider_snapshot_mismatch",
      );
      return null;
    }
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryCancelAtPeriodEndChange(
        ctx,
        args,
        operation.operationId,
        leaseToken,
        configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
      );
      return null;
    }

    try {
      const stripe = createStripeClient(configuration.secretKey);
      let subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(
        context.subscription.stripeSubscriptionId,
        {
          expand: ["latest_invoice"],
        },
      );
      assertSafetySubscription(subscription, context);
      subscription = await cancelPausedSubscription(stripe, subscription, {
        organizationId: context.organizationId,
        providerGeneration: context.subscription.providerGeneration,
        livemode: context.livemode,
        idempotencyScope: operation.stripeIdempotencyKey,
      });
      if (
        !["canceled", "incomplete_expired"].includes(subscription.status) &&
        subscription.cancel_at_period_end !== cancelAtPeriodEnd &&
        context.billingVersion === persisted.expectedBillingVersion
      ) {
        subscription = await stripe.subscriptions.update(
          context.subscription.stripeSubscriptionId,
          { cancel_at_period_end: cancelAtPeriodEnd },
          { idempotencyKey: operation.stripeIdempotencyKey },
        );
        assertSafetySubscription(subscription, context);
        if (subscription.cancel_at_period_end !== cancelAtPeriodEnd) {
          throw new Error("subscription_schedule_not_confirmed");
        }
      }
      subscription = await cancelPausedSubscription(stripe, subscription, {
        organizationId: context.organizationId,
        providerGeneration: context.subscription.providerGeneration,
        livemode: context.livemode,
        idempotencyScope: operation.stripeIdempotencyKey,
      });
      if (["canceled", "incomplete_expired"].includes(subscription.status)) {
        await saveSubscriptionFromSafetyAction(ctx, context, subscription);
        await convergeCancelledTrialContinuation(ctx, {
          organizationId: args.organizationId,
          stripeCustomerId: context.stripeCustomerId,
          livemode: context.livemode,
          providerGeneration: context.subscription.providerGeneration,
          correlationId: `operation-${operation.operationId}-terminal`,
        });
        await finishOperation(
          ctx,
          operation.operationId,
          leaseToken,
          "cancelled",
          subscription.id,
          "subscription_terminal",
        );
        return null;
      }
      const periodEndsAt = subscriptionPeriodEnd(subscription);
      if (subscription.cancel_at_period_end && periodEndsAt === undefined) {
        throw new Error("subscription_schedule_not_confirmed");
      }
      await saveSubscriptionFromSafetyAction(ctx, context, subscription);
      await convergeCancelAtPeriodEndState(ctx, {
        organizationId: args.organizationId,
        expectedBillingVersion: context.billingVersion,
        operationId: operation.operationId,
        billingState: context.billingState,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        periodEndsAt,
        ...(persisted.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
      });
      await finishOperation(
        ctx,
        operation.operationId,
        leaseToken,
        subscription.cancel_at_period_end === cancelAtPeriodEnd ? "succeeded" : "cancelled",
        subscription.id,
        subscription.cancel_at_period_end === cancelAtPeriodEnd ? undefined : "superseded",
      );
    } catch (error) {
      await retryCancelAtPeriodEndChange(ctx, args, operation.operationId, leaseToken, safeStripeErrorCode(error));
    }
    return null;
  },
});

export const cancelTrialContinuation = action({
  args: { shopId: v.id("shops"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await cancelTrialContinuationForScope(ctx, { scope: { shopId: args.shopId }, requestId: args.requestId }),
});

export const cancelTrialContinuationForOrganization = action({
  args: { organizationId: v.id("organizations"), requestId: v.string() },
  returns: changeResultValidator,
  handler: async (ctx, args): Promise<ChangeResult> =>
    await cancelTrialContinuationForScope(ctx, {
      scope: { organizationId: args.organizationId },
      requestId: args.requestId,
    }),
});

async function cancelTrialContinuationForScope(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; requestId: string },
): Promise<ChangeResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, args.scope, "portal");
  if (
    !context?.currentStripeSubscriptionId ||
    context.billingState.state.kind !== "trial" ||
    !context.billingState.state.selectedPaidPlan
  ) {
    return unavailable("not_allowed");
  }
  const livemode = configuration.livemode;
  const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
    organizationId: context.organizationId,
    kind: "cancelSubscription",
    requestKey: args.requestId,
    livemode,
    expectedBillingVersion: context.billingState.version,
    providerGeneration: context.providerGeneration,
    recoveryPurpose: "trialContinuationCancellation",
  });
  if (!operation.created) return unavailable(operation.conflict ? "in_progress" : "request_already_used");
  const operationLease = requireOperationLease(operation);

  try {
    const stripe = createStripeClient(configuration.secretKey);
    const current = await stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, {
      expand: ["latest_invoice"],
    });
    assertActionSubscription(current, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode,
    });
    const latestContext = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: context.organizationId,
    });
    if (!latestContext || latestContext.subscription.stripeSubscriptionId !== current.id) {
      throw new Error("billing_version_conflict");
    }
    if (
      await preservePaidTrialContinuation(ctx, stripe, latestContext, current, {
        operationId: operation.operationId,
        operationLease,
      })
    ) {
      return unavailable("not_allowed");
    }
    if (latestContext.billingState.kind !== "trial" && latestContext.billingState.kind !== "initialPaymentPending") {
      throw new Error("billing_version_conflict");
    }
    const subscription = await stripe.subscriptions.cancel(current.id, undefined, {
      idempotencyKey: operation.stripeIdempotencyKey,
    });
    if (subscription.status !== "canceled" || subscription.livemode !== livemode) {
      throw new Error("subscription_cancel_not_confirmed");
    }
    await saveSubscriptionFromSafetyAction(ctx, latestContext, subscription);
    await convergeCancelledTrialContinuation(ctx, {
      organizationId: context.organizationId,
      stripeCustomerId: latestContext.stripeCustomerId,
      livemode,
      providerGeneration: latestContext.subscription.providerGeneration,
      correlationId: `operation-${operation.operationId}`,
    });
    await finishOperation(ctx, operation.operationId, operationLease, "succeeded", subscription.id);
    return { status: "accepted" as const };
  } catch (error) {
    await retryTrialContinuationCancellation(
      ctx,
      {
        organizationId: context.organizationId,
        expectedBillingVersion: context.billingState.version,
        requestId: args.requestId,
      },
      operation.operationId,
      operationLease,
      safeStripeErrorCode(error),
    );
    return unavailable("configuration_pending");
  }
}

/** Trial継続取消のprovider成功後にlocal更新が落ちても、同じoperationで再取得して終端まで収束する。 */
export const reconcileTrialContinuationCancellation = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (!context) {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: args.organizationId,
      kind: "cancelSubscription",
      requestKey: args.requestId,
      livemode: context.livemode,
      expectedBillingVersion: context.billingVersion,
      providerGeneration: context.subscription.providerGeneration,
      recoveryPurpose: "trialContinuationCancellation",
    });
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    if (operation.providerGeneration !== context.subscription.providerGeneration) {
      await finishOperation(
        ctx,
        operation.operationId,
        leaseToken,
        "actionRequired",
        undefined,
        "provider_generation_mismatch",
      );
      return null;
    }
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryTrialContinuationCancellation(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
      );
      return null;
    }
    try {
      const stripe = createStripeClient(configuration.secretKey);
      const current = await stripe.subscriptions.retrieve(context.subscription.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      assertSafetySubscription(current, context);
      if (
        await preservePaidTrialContinuation(ctx, stripe, context, current, {
          operationId: operation.operationId,
          operationLease: leaseToken,
        })
      ) {
        return null;
      }
      const subscription =
        current.status === "canceled"
          ? current
          : await stripe.subscriptions.cancel(current.id, undefined, {
              idempotencyKey: operation.stripeIdempotencyKey,
            });
      if (subscription.status !== "canceled" || subscription.livemode !== context.livemode) {
        throw new Error("subscription_cancel_not_confirmed");
      }
      assertSafetySubscription(subscription, context);
      await saveSubscriptionFromSafetyAction(ctx, context, subscription);
      await convergeCancelledTrialContinuation(ctx, {
        organizationId: args.organizationId,
        stripeCustomerId: context.stripeCustomerId,
        livemode: context.livemode,
        providerGeneration: context.subscription.providerGeneration,
        correlationId: `operation-${operation.operationId}`,
      });
      await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
    } catch (error) {
      await retryTrialContinuationCancellation(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
      );
    }
    return null;
  },
});

/** 無効なTrial Subscriptionを、元の作成operationへ束縛したまま終端まで回収する。 */
export const reconcileInvalidTrialSubscriptionCancellation = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.organizationStripe.queries.getInvalidTrialSubscriptionCleanupContext, {
      organizationId: args.organizationId,
      requestKey: args.requestId,
    });
    if (!context) {
      await ctx.runMutation(internal.organizationStripe.mutations.terminalizeInvalidTrialCleanupBindingFailure, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    const operation = await ctx.runMutation(
      internal.organizationStripe.mutations.beginInvalidTrialSubscriptionCleanup,
      {
        organizationId: args.organizationId,
        sourceOperationId: context.sourceOperationId,
        requestKey: args.requestId,
        stripeSubscriptionId: context.stripeSubscriptionId,
        errorCode: context.errorCode,
      },
    );
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryInvalidTrialSubscriptionCleanup(
        ctx,
        {
          organizationId: args.organizationId,
          expectedBillingVersion: context.billingVersion,
          requestId: args.requestId,
        },
        operation.operationId,
        leaseToken,
        configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
      );
      return null;
    }
    try {
      const stripe = createStripeClient(configuration.secretKey);
      const subscription = await stripe.subscriptions.retrieve(context.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      await cancelInvalidTrialSubscription(
        ctx,
        stripe,
        subscription,
        { ...context, organizationId: args.organizationId },
        {
          operationId: operation.operationId,
          operationLease: leaseToken,
          stripeIdempotencyKey: operation.stripeIdempotencyKey,
        },
      );
    } catch (error) {
      await retryInvalidTrialSubscriptionCleanup(
        ctx,
        {
          organizationId: args.organizationId,
          expectedBillingVersion: context.billingVersion,
          requestId: args.requestId,
        },
        operation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
      );
    }
    return null;
  },
});

/** 期間末FreeはStripeの最新Subscriptionを確認し、解約済みの場合だけ確定する。 */
export const reconcileScheduledFreeDeadline = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (
      context?.billingState.kind !== "scheduledChange" ||
      (context.billingState.currentPlan !== "pro" && context.billingState.currentPlan !== "business") ||
      context.billingState.targetPlan !== "free"
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    if (Date.now() < context.billingState.effectiveAt) return null;
    const currentPlan = context.billingState.currentPlan;
    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: args.organizationId,
      kind: "reconcileSubscription",
      requestKey: args.requestId,
      livemode: context.livemode,
      expectedBillingVersion: context.billingVersion,
      providerGeneration: context.subscription.providerGeneration,
      recoveryPurpose: "scheduledFreeDeadline",
    });
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    if (operation.providerGeneration !== context.subscription.providerGeneration) {
      await finishOperation(
        ctx,
        operation.operationId,
        leaseToken,
        "actionRequired",
        undefined,
        "provider_generation_mismatch",
      );
      return null;
    }
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryScheduledFreeDeadline(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
      );
      return null;
    }
    try {
      const stripe = createStripeClient(configuration.secretKey);
      let subscription: Stripe.Subscription = await stripe.subscriptions.retrieve(
        context.subscription.stripeSubscriptionId,
        {
          expand: ["latest_invoice"],
        },
      );
      assertSafetySubscription(subscription, context);
      subscription = await cancelPausedSubscription(stripe, subscription, {
        organizationId: context.organizationId,
        providerGeneration: context.subscription.providerGeneration,
        livemode: context.livemode,
        idempotencyScope: operation.stripeIdempotencyKey,
      });
      await saveSubscriptionFromSafetyAction(ctx, context, subscription);
      if (["canceled", "incomplete_expired"].includes(subscription.status)) {
        const confirmed = await ctx.runMutation(internal.organizationBilling.mutations.confirmScheduledFreeDeadline, {
          organizationId: args.organizationId,
          expectedVersion: context.billingVersion,
          expectedDeadlineAt: context.billingState.effectiveAt,
          correlationId: `stripe:${operation.operationId}:scheduled-free-confirmed`,
        });
        if (
          !(await billingMutationConverged(
            ctx,
            args.organizationId,
            confirmed.changed,
            (state) => state.kind === "restricted" || (state.kind === "active" && state.plan === "free"),
          ))
        ) {
          throw new Error("billing_version_conflict");
        }
        await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
        return null;
      }

      const periodEndsAt = subscriptionPeriodEnd(subscription);
      if (!subscription.cancel_at_period_end) {
        const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: args.organizationId,
          expectedVersion: context.billingVersion,
          state: { kind: "scheduledChangeCanceled" },
          correlationId: `stripe:${operation.operationId}:scheduled-free-cancelled`,
        });
        if (
          !(await billingMutationConverged(
            ctx,
            args.organizationId,
            changed.changed,
            (state) => state.kind === "active" && state.plan === currentPlan,
          ))
        ) {
          throw new Error("billing_version_conflict");
        }
        await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
        return null;
      }
      if (periodEndsAt !== undefined && periodEndsAt !== context.billingState.effectiveAt) {
        const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: args.organizationId,
          expectedVersion: context.billingVersion,
          state: {
            kind: "scheduledChange",
            currentPlan,
            targetPlan: "free",
            effectiveAt: periodEndsAt,
            ...(context.billingState.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
          },
          correlationId: `stripe:${operation.operationId}:scheduled-free-rescheduled`,
        });
        if (!changed.changed) throw new Error("billing_version_conflict");
        await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
        return null;
      }
      throw new Error("scheduled_cancellation_pending");
    } catch (error) {
      await retryScheduledFreeDeadline(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
      );
    }
    return null;
  },
});

/** Stripe Scheduleのphase移行と請求結果を再取得し、BusinessからProへの期間末変更を確定する。 */
export const reconcileScheduledPaidPlanDeadline = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (
      context?.billingState.kind !== "scheduledChange" ||
      context.billingState.currentPlan !== "business" ||
      context.billingState.targetPlan !== "pro"
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    if (Date.now() < context.billingState.effectiveAt) return null;
    const effectiveAt = context.billingState.effectiveAt;
    const scheduleId = context.subscription.stripeSubscriptionScheduleId;
    const subscriptionItemId = context.subscription.stripeSubscriptionItemId;
    if (!scheduleId || !subscriptionItemId) return null;
    const scheduledChangeOperation = await ctx.runQuery(
      internal.organizationStripe.queries.getScheduledPaidPlanChangeOperation,
      {
        organizationId: args.organizationId,
        stripeSubscriptionScheduleId: scheduleId,
        stripeSubscriptionId: context.subscription.stripeSubscriptionId,
        stripeSubscriptionItemId: subscriptionItemId,
        providerGeneration: context.subscription.providerGeneration,
        effectiveAt,
        livemode: context.livemode,
      },
    );
    if (!scheduledChangeOperation) return null;

    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: args.organizationId,
      kind: "reconcileSubscription",
      requestKey: args.requestId,
      livemode: context.livemode,
      expectedBillingVersion: context.billingVersion,
      providerGeneration: context.subscription.providerGeneration,
      recoveryPurpose: "scheduledPaidPlanDeadline",
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: context.subscription.stripeSubscriptionId,
      stripeSubscriptionItemIdSnapshot: context.subscription.stripeSubscriptionItemId,
      sourceStripePriceIdSnapshot: scheduledChangeOperation.sourceStripePriceId,
      targetStripePriceIdSnapshot: scheduledChangeOperation.targetStripePriceId,
      effectiveAt,
    });
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryScheduledPaidPlanDeadline(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        configuration ? "stripe_configuration_incomplete" : "stripe_configuration_unavailable",
      );
      return null;
    }

    try {
      const stripe = createStripeClient(configuration.secretKey);
      const subscription = await stripe.subscriptions.retrieve(context.subscription.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      await verifyScheduledPaidPlanDeadlineProviderState(stripe, {
        context,
        subscription,
        effectiveAt,
        stripeSubscriptionScheduleId: scheduleId,
        scheduledChangeOperation,
      });

      const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, context);
      await saveSubscriptionFromSafetyAction(ctx, context, subscription, {
        plan: "pro",
      });
      assertScheduledPaidPlanInvoice(invoice, {
        targetStripePriceId: scheduledChangeOperation.targetStripePriceId,
        effectiveAt,
      });
      const result =
        invoice.status === "paid" && subscription.status === "active"
          ? "paid"
          : isConfirmedUnpaid(subscription, invoice)
            ? "failed"
            : null;
      if (!result) throw new Error("scheduled_paid_invoice_pending");

      const confirmed = await ctx.runMutation(internal.organizationBilling.mutations.confirmScheduledPaidPlanDeadline, {
        organizationId: args.organizationId,
        expectedVersion: context.billingVersion,
        expectedDeadlineAt: effectiveAt,
        result,
        ...(result === "failed" ? { firstFailureAt: authoritativeInvoiceFailureAt(invoice) } : {}),
        ...(result === "paid" ? { amountDue: invoice.amount_paid, currency: invoice.currency } : {}),
        correlationId: `stripe:${operation.operationId}:scheduled-paid-${result}`,
      });
      if (
        !(await billingMutationConverged(ctx, args.organizationId, confirmed.changed, (state) =>
          result === "paid"
            ? state.kind === "active" || state.kind === "restricted"
            : state.kind === "grace" || state.kind === "restricted",
        ))
      ) {
        throw new Error("billing_version_conflict");
      }
      await saveSubscriptionFromSafetyAction(ctx, context, subscription, {
        plan: "pro",
        clearStripeSubscriptionScheduleId: true,
      });
      await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
    } catch (error) {
      await retryScheduledPaidPlanDeadline(
        ctx,
        { ...args, expectedBillingVersion: context.billingVersion },
        operation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
      );
    }
    return null;
  },
});

/** retryingになった有料プラン変更を、保存済みsnapshotと同じidempotency keyで回収する。 */
export const reconcilePaidPlanChangeOperation = internalAction({
  args: { operationId: v.id("organizationStripeOperations") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const persisted = await ctx.runQuery(internal.organizationStripe.queries.getOperation, {
      operationId: args.operationId,
    });
    if (
      !persisted ||
      (persisted.kind !== "changePaidPlanNow" &&
        persisted.kind !== "schedulePaidPlanChange" &&
        persisted.kind !== "cancelScheduledPlanChange")
    ) {
      return null;
    }
    if (persisted.status !== "retrying" && persisted.status !== "processing") return null;
    if (
      persisted.providerGeneration === undefined ||
      !persisted.sourcePlan ||
      !persisted.targetPlan ||
      !persisted.changeMode ||
      !persisted.stripeSubscriptionIdSnapshot ||
      !persisted.stripeSubscriptionItemIdSnapshot ||
      !persisted.sourceStripePriceIdSnapshot ||
      !persisted.targetStripePriceIdSnapshot ||
      persisted.effectiveAt === undefined
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.terminalizeInvalidPaidPlanChangeRecovery, {
        operationId: persisted.operationId,
        errorCode: "paid_plan_change_snapshot_invalid",
      });
      return null;
    }
    const recoverySnapshot = persisted as PaidPlanChangeRecoverySnapshot;
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: persisted.organizationId,
    });
    if (
      !context ||
      context.livemode !== persisted.livemode ||
      context.subscription.providerGeneration !== persisted.providerGeneration ||
      context.subscription.stripeSubscriptionId !== persisted.stripeSubscriptionIdSnapshot ||
      context.subscription.stripeSubscriptionItemId !== persisted.stripeSubscriptionItemIdSnapshot
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.terminalizeInvalidPaidPlanChangeRecovery, {
        operationId: persisted.operationId,
        errorCode: "paid_plan_change_binding_invalid",
      });
      return null;
    }

    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: persisted.organizationId,
      kind: persisted.kind,
      requestKey: persisted.requestKey,
      livemode: persisted.livemode,
      ...(persisted.expectedBillingVersion !== undefined
        ? { expectedBillingVersion: persisted.expectedBillingVersion }
        : {}),
      providerGeneration: persisted.providerGeneration,
      sourcePlan: persisted.sourcePlan,
      targetPlan: persisted.targetPlan,
      changeMode: persisted.changeMode,
      stripeSubscriptionIdSnapshot: persisted.stripeSubscriptionIdSnapshot,
      stripeSubscriptionItemIdSnapshot: persisted.stripeSubscriptionItemIdSnapshot,
      sourceStripePriceIdSnapshot: persisted.sourceStripePriceIdSnapshot,
      targetStripePriceIdSnapshot: persisted.targetStripePriceIdSnapshot,
      ...(persisted.prorationDate !== undefined ? { prorationDate: persisted.prorationDate } : {}),
      effectiveAt: persisted.effectiveAt,
    });
    if (!operation.created) {
      if (operation.operationId !== persisted.operationId) {
        await ctx.runMutation(internal.organizationStripe.mutations.terminalizeInvalidPaidPlanChangeRecovery, {
          operationId: persisted.operationId,
          errorCode: "paid_plan_change_recovery_conflict",
        });
      }
      return null;
    }
    const leaseToken = requireOperationLease(operation);
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== persisted.livemode) {
      await retryPaidPlanChangeOperation(
        ctx,
        persisted,
        leaseToken,
        configuration ? "stripe_configuration_incomplete" : "stripe_configuration_unavailable",
      );
      return null;
    }

    try {
      const stripe = createStripeClient(configuration.secretKey);
      if (persisted.kind === "changePaidPlanNow") {
        await recoverImmediatePaidPlanChange(ctx, stripe, context, recoverySnapshot, operation, leaseToken);
      } else if (persisted.kind === "schedulePaidPlanChange") {
        await recoverScheduledPaidPlanChange(ctx, stripe, context, recoverySnapshot, operation, leaseToken);
      } else {
        await recoverCanceledPaidPlanChange(ctx, stripe, context, recoverySnapshot, operation, leaseToken);
      }
    } catch (error) {
      await retryPaidPlanChangeOperation(ctx, persisted, leaseToken, safeStripeErrorCode(error));
    }
    return null;
  },
});

export const reconcileInitialPaymentPending = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (context?.billingState.kind !== "initialPaymentPending") {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    const effectiveArgs = { ...args, expectedBillingVersion: context.billingVersion };
    const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: args.organizationId,
      kind: "reconcileSubscription",
      requestKey: args.requestId,
      livemode: context.livemode,
      expectedBillingVersion: effectiveArgs.expectedBillingVersion,
      providerGeneration: context.subscription.providerGeneration,
    });
    if (!operation.created) return null;
    const leaseToken = requireOperationLease(operation);
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration || configuration.livemode !== context.livemode) {
      await retryExpiredGraceSafetyOperation(
        ctx,
        effectiveArgs,
        operation.operationId,
        leaseToken,
        configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
        "initialPayment",
      );
      return null;
    }
    try {
      const stripe = createStripeClient(configuration.secretKey);
      const subscription = await stripe.subscriptions.retrieve(context.subscription.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      assertSafetySubscription(subscription, context);
      const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, context);
      const targetPlan = context.billingState.plan;
      const transition =
        invoice.status === "paid" && subscription.status === "active"
          ? await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
              organizationId: args.organizationId,
              expectedVersion: effectiveArgs.expectedBillingVersion,
              state: { kind: "active", plan: targetPlan },
              correlationId: `stripe:${operation.operationId}:initial-payment-paid`,
            })
          : isConfirmedUnpaid(subscription, invoice)
            ? await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
                organizationId: args.organizationId,
                expectedVersion: effectiveArgs.expectedBillingVersion,
                state: {
                  kind: "grace",
                  plan: "pro",
                  ...(targetPlan === "business" ? { targetPlan: "business" as const } : {}),
                  firstFailureAt: authoritativeInvoiceFailureAt(invoice),
                },
                correlationId: `stripe:${operation.operationId}:initial-payment-unpaid`,
              })
            : { changed: false };
      if (!transition.changed) throw new Error("billing_reconciliation_pending");
      await saveSubscriptionFromSafetyAction(ctx, context, subscription, { plan: targetPlan });
      await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", subscription.id);
    } catch (error) {
      await retryExpiredGraceSafetyOperation(
        ctx,
        effectiveArgs,
        operation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
        "initialPayment",
      );
    }
    return null;
  },
});

/** ローカルの最新請求先メールだけをStripe Customerへ同期し、古いjobで巻き戻さない。 */
export const syncBillingEmail = internalAction({
  args: {
    organizationId: v.id("organizations"),
    requestId: v.string(),
    repairRequestId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let scheduledRequestId = args.requestId;
    let repairRequestId = args.repairRequestId;
    for (let pass = 0; pass < BILLING_EMAIL_CONVERGENCE_LIMIT; pass += 1) {
      const context = await ctx.runQuery(internal.organizationStripe.queries.getBillingEmailSyncContext, {
        organizationId: args.organizationId,
      });
      if (!context) return null;
      const canonicalRequestId = billingEmailSyncRequestKey(context);
      const requestId = repairRequestId ?? canonicalRequestId;
      if (!repairRequestId && scheduledRequestId !== canonicalRequestId) {
        await ctx.runMutation(internal.organizationStripe.mutations.cancelSupersededBillingEmailSyncOperation, {
          organizationId: args.organizationId,
          requestId: scheduledRequestId,
        });
      }
      const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
        organizationId: args.organizationId,
        kind: "syncBillingEmail",
        requestKey: requestId,
        livemode: context.livemode,
        expectedBillingVersion: context.billingVersion,
        providerGeneration: context.providerGeneration,
      });
      if (!operation.created) return null;
      const leaseToken = requireOperationLease(operation);
      const configuration = getStripeProviderSafetyConfiguration();
      if (!configuration || configuration.livemode !== context.livemode) {
        await ctx.runMutation(internal.organizationStripe.mutations.retryBillingEmailSyncOperation, {
          operationId: operation.operationId,
          leaseToken,
          organizationId: args.organizationId,
          requestId,
          errorCode: configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
        });
        return null;
      }
      try {
        const stripe = createStripeClient(configuration.secretKey);
        const customer = await stripe.customers.retrieve(context.stripeCustomerId);
        if (
          customer.deleted ||
          customer.livemode !== context.livemode ||
          customer.metadata.shiftori_organization_id !== String(context.organizationId)
        ) {
          throw new Error("customer_mapping_invalid");
        }
        const updated = await stripe.customers.update(
          customer.id,
          { email: context.billingEmail },
          { idempotencyKey: operation.stripeIdempotencyKey },
        );
        if (
          updated.deleted ||
          updated.email !== context.billingEmail ||
          updated.livemode !== context.livemode ||
          updated.metadata.shiftori_organization_id !== String(context.organizationId)
        ) {
          throw new Error("customer_email_sync_invalid");
        }
        const completion = await ctx.runMutation(
          internal.organizationStripe.mutations.completeBillingEmailSyncOperation,
          {
            operationId: operation.operationId,
            leaseToken,
            organizationId: args.organizationId,
            ...(context.billingEmailSyncKey ? { sentBillingEmailSyncKey: context.billingEmailSyncKey } : {}),
            sentBillingEmailFingerprint: createHash("sha256").update(context.billingEmail).digest("hex"),
            sentOrganizationUpdatedAt: context.organizationUpdatedAt,
            sentStripeCustomerId: context.stripeCustomerId,
            sentProviderGeneration: context.providerGeneration,
          },
        );
        if (!completion.repairRequestId) return null;
        scheduledRequestId = requestId;
        repairRequestId = completion.repairRequestId;
      } catch (error) {
        await ctx.runMutation(internal.organizationStripe.mutations.retryBillingEmailSyncOperation, {
          operationId: operation.operationId,
          leaseToken,
          organizationId: args.organizationId,
          requestId,
          errorCode: safeStripeErrorCode(error),
        });
        return null;
      }
    }

    const latest = await ctx.runQuery(internal.organizationStripe.queries.getBillingEmailSyncContext, {
      organizationId: args.organizationId,
    });
    if (latest) {
      const nextRequestId = repairRequestId ?? billingEmailSyncRequestKey(latest);
      await ctx.scheduler.runAfter(0, internal.organizationStripe.actions.syncBillingEmail, {
        organizationId: args.organizationId,
        requestId: nextRequestId,
        ...(repairRequestId ? { repairRequestId } : {}),
      });
    }
    return null;
  },
});

function billingEmailSyncRequestKey(context: {
  organizationId: Id<"organizations">;
  billingEmail: string;
  billingEmailSyncKey?: string;
  organizationUpdatedAt: number;
  stripeCustomerId: string;
  livemode: boolean;
  providerGeneration: number;
}) {
  const revision =
    context.billingEmailSyncKey && /^[A-Za-z0-9_-]{8,64}$/.test(context.billingEmailSyncKey)
      ? context.billingEmailSyncKey
      : `legacy:${context.organizationUpdatedAt}:${context.billingEmail}`;
  return createHash("sha256")
    .update(
      [
        String(context.organizationId),
        revision,
        context.stripeCustomerId,
        context.livemode ? "live" : "test",
        String(context.providerGeneration),
      ].join(":"),
    )
    .digest("base64url");
}

/** 猶予終了時に最新請求を再照合し、未払い確認後だけ制限・取消・請求停止へ進める。 */
export const stopExpiredGraceCollection = internalAction({
  args: {
    organizationId: v.id("organizations"),
    expectedBillingVersion: v.number(),
    requestId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    let context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
      organizationId: args.organizationId,
    });
    if (
      !context ||
      (context.billingState.kind !== "grace" &&
        !(context.billingState.kind === "restricted" && context.billingState.reason === "paymentGraceExpired"))
    ) {
      await ctx.runMutation(internal.organizationStripe.mutations.settleResolvedSafetyOperations, {
        organizationId: args.organizationId,
        requestKey: args.requestId,
      });
      return null;
    }
    const effectiveArgs = { ...args, expectedBillingVersion: context.billingVersion };
    const configuration = getStripeProviderSafetyConfiguration();
    const stripe =
      configuration && configuration.livemode === context.livemode ? createStripeClient(configuration.secretKey) : null;

    if (context.billingState.kind === "grace") {
      const reconcileOperation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
        organizationId: args.organizationId,
        kind: "reconcileSubscription",
        requestKey: args.requestId,
        livemode: context.livemode,
        expectedBillingVersion: effectiveArgs.expectedBillingVersion,
        providerGeneration: context.subscription.providerGeneration,
      });
      if (!reconcileOperation.created) return null;
      const leaseToken = requireOperationLease(reconcileOperation);
      if (!stripe) {
        await retryExpiredGraceSafetyOperation(
          ctx,
          effectiveArgs,
          reconcileOperation.operationId,
          leaseToken,
          configuration ? "stripe_livemode_mismatch" : "stripe_configuration_unavailable",
          "expiredGrace",
        );
        return null;
      }
      try {
        const subscription = await stripe.subscriptions.retrieve(context.subscription.stripeSubscriptionId, {
          expand: ["latest_invoice"],
        });
        assertSafetySubscription(subscription, context);
        const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, context);
        if (invoice.status === "paid" && subscription.status === "active") {
          const targetPlan = context.billingState.targetPlan ?? context.billingState.plan;
          const recovered = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
            organizationId: args.organizationId,
            expectedVersion: effectiveArgs.expectedBillingVersion,
            state: { kind: "active", plan: targetPlan },
            correlationId: `stripe:${reconcileOperation.operationId}:grace-paid`,
          });
          if (!recovered.changed) throw new Error("billing_version_conflict");
          await saveSubscriptionFromSafetyAction(ctx, context, subscription, { plan: targetPlan });
          await finishOperation(ctx, reconcileOperation.operationId, leaseToken, "succeeded", subscription.id);
          return null;
        }
        if (!isConfirmedUnpaid(subscription, invoice)) throw new Error("billing_reconciliation_pending");
        const expired = await ctx.runMutation(internal.organizationBilling.mutations.expireVerifiedPaymentGrace, {
          organizationId: args.organizationId,
          expectedVersion: effectiveArgs.expectedBillingVersion,
          expectedEndsAt: context.billingState.endsAt,
          correlationId: `stripe:${reconcileOperation.operationId}:grace-expired`,
        });
        if (!expired.changed || expired.billingVersion === undefined) throw new Error("billing_version_conflict");
        await finishOperation(ctx, reconcileOperation.operationId, leaseToken, "succeeded", subscription.id);
        context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
          organizationId: args.organizationId,
          expectedBillingVersion: expired.billingVersion,
        });
        if (!context) return null;
      } catch (error) {
        await retryExpiredGraceSafetyOperation(
          ctx,
          effectiveArgs,
          reconcileOperation.operationId,
          leaseToken,
          safeStripeErrorCode(error),
          "expiredGrace",
        );
        return null;
      }
    }
    if (context.billingState.kind !== "restricted" || context.billingState.reason !== "paymentGraceExpired")
      return null;
    await stopRestrictedStripeCollection(ctx, stripe, context, {
      ...args,
      expectedBillingVersion: context.billingVersion,
    });
    return null;
  },
});

/** 署名済みreceiptだけがscheduler経由で到達する。Event自体もStripeから再取得して判断する。 */
export const processWebhookEvent = internalAction({
  args: { stripeEventId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claim = await ctx.runMutation(internal.organizationStripe.mutations.claimWebhookEvent, args);
    if (!claim) return null;
    const knownGuard = await ctx.runQuery(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
      type: claim.type,
      objectId: claim.objectId,
      objectCustomerId: claim.objectCustomerId,
      livemode: claim.livemode,
    });
    if (knownGuard === "complimentary") {
      await finishWebhook(ctx, claim, { kind: "actionRequired", errorCode: "complimentary_stripe_mapping" });
      return null;
    }
    const configuration = getStripeProviderSafetyConfiguration();
    if (!configuration) {
      await finishWebhook(ctx, claim, { kind: "retry", errorCode: "stripe_safety_config_missing" });
      return null;
    }

    try {
      const stripe = createStripeClient(configuration.secretKey);
      const event = await stripe.events.retrieve(claim.stripeEventId);
      const eventObjectId = stripeObjectId(event.data.object);
      if (
        event.id !== claim.stripeEventId ||
        event.type !== claim.type ||
        event.livemode !== claim.livemode ||
        event.api_version !== STRIPE_WEBHOOK_API_VERSION ||
        event.created * 1000 !== claim.eventCreatedAt ||
        eventObjectId !== claim.objectId
      ) {
        await finishWebhook(ctx, claim, { kind: "actionRequired", errorCode: "event_snapshot_mismatch" });
        return null;
      }

      const result = await processVerifiedStripeEvent(ctx, stripe, {
        type: claim.type,
        objectId: claim.objectId,
        stripeEventId: event.id,
        webhookLeaseToken: claim.leaseToken,
        eventCreatedAt: event.created * 1000,
        livemode: event.livemode,
        proPriceId: configuration.proPriceId,
        businessPriceId: configuration.businessPriceId,
      });
      await finishWebhook(ctx, claim, result);
    } catch (error) {
      await finishWebhook(ctx, claim, { kind: "retry", errorCode: safeStripeErrorCode(error) });
    }
    return null;
  },
});

async function processVerifiedStripeEvent(
  ctx: ActionCtx,
  stripe: Stripe,
  event: {
    type: StripeWebhookEventType;
    objectId: string;
    stripeEventId: string;
    webhookLeaseToken: string;
    eventCreatedAt: number;
    livemode: boolean;
    proPriceId?: string;
    businessPriceId?: string;
  },
): Promise<WebhookProcessResult> {
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    return await processCheckoutEvent(ctx, stripe, { ...event, type: event.type });
  }
  if (event.type.startsWith("subscription_schedule.")) {
    const schedule = await stripe.subscriptionSchedules.retrieve(event.objectId);
    const subscriptionId = subscriptionScheduleSubscriptionId(schedule);
    const customerId = stripeObjectId(schedule.customer);
    if (!subscriptionId || !customerId || schedule.livemode !== event.livemode) {
      return { kind: "actionRequired" as const, errorCode: "subscription_schedule_relationship_invalid" };
    }
    const organization = await resolveOrganizationForSubscription(ctx, customerId, event.livemode);
    if (!organization) return { kind: "ignored" as const, errorCode: "customer_not_mapped" };
    if (
      schedule.metadata?.shiftori_organization_id !== String(organization.organizationId) ||
      schedule.metadata?.shiftori_provider_generation !== String(organization.providerGeneration) ||
      (organization.latestStripeSubscriptionScheduleId &&
        organization.latestStripeSubscriptionScheduleId !== schedule.id)
    ) {
      return { kind: "actionRequired" as const, errorCode: "subscription_schedule_relationship_invalid" };
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
    const synchronizedResult = await synchronizeSubscription(ctx, stripe, event, subscription, customerId);
    if (!synchronizedResult.ok) return synchronizedResult.result;
    const billing = synchronizedResult.organization.billingState;
    if (
      billing.state.kind === "scheduledChange" &&
      billing.state.currentPlan === "business" &&
      billing.state.targetPlan === "pro"
    ) {
      const item = requireSingleLicensedSubscriptionItem(subscription);
      const providerPlan = configuredPlanForPrice(item.price.id, event);
      if (providerPlan === "pro" && event.eventCreatedAt >= billing.state.effectiveAt) {
        const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, {
          stripeCustomerId: customerId,
          livemode: event.livemode,
          subscription: { stripeSubscriptionId: subscription.id },
        });
        const applied = await applyScheduledPaidInvoiceResult(
          ctx,
          stripe,
          event,
          synchronizedResult,
          subscription,
          invoice,
        );
        if (applied) return applied;
      } else if (
        providerPlan === "business" &&
        (event.type === "subscription_schedule.canceled" || event.type === "subscription_schedule.released")
      ) {
        const canceled = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: organization.organizationId,
          expectedVersion: billing.version,
          state: { kind: "scheduledChangeCanceled" },
          correlationId: `stripe:${event.stripeEventId}:scheduled-paid-canceled`,
        });
        if (
          !(await billingMutationConverged(
            ctx,
            organization.organizationId,
            canceled.changed,
            (state) => state.kind === "active" && state.plan === "business",
          ))
        ) {
          return { kind: "retry" as const, errorCode: "billing_version_conflict" };
        }
      }
    }
    return processedResult(synchronizedResult);
  }
  if (event.type.startsWith("customer.subscription.")) {
    const subscription = await stripe.subscriptions.retrieve(event.objectId, { expand: ["latest_invoice"] });
    const synchronizedResult = await synchronizeSubscription(ctx, stripe, event, subscription);
    if (!synchronizedResult.ok) return synchronizedResult.result;
    const reconciliation = await reconcileAuthoritativeSubscriptionState(
      ctx,
      stripe,
      event,
      subscription,
      synchronizedResult,
    );
    if (!reconciliation.ok) return reconciliation.result;
    const synchronized = reconciliation.synchronized;
    if (synchronized.snapshotStale) {
      if (reconciliation.reconciled) return processedResult(synchronized);
      return { kind: "ignored" as const, errorCode: "subscription_snapshot_stale" };
    }
    const billing = synchronized.organization.billingState;
    const expandedInvoice = subscription.latest_invoice;
    const invoice =
      expandedInvoice && typeof expandedInvoice === "object" && !expandedInvoice.deleted ? expandedInvoice : null;

    if (event.type === "customer.subscription.pending_update_expired" && billing.state.kind === "pendingActivation") {
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: billing.version,
        state: { kind: "paymentFailed" },
        correlationId: `stripe:${event.stripeEventId}:pending-update-expired`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          isSafeAfterSubscriptionCancellation,
        ))
      ) {
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      }
      return processedResult(synchronized);
    }
    if (event.type === "customer.subscription.pending_update_applied" && billing.state.kind === "pendingActivation") {
      if (invoice?.status !== "paid" || subscription.status !== "active") {
        return { kind: "retry" as const, errorCode: "pending_update_payment_unconfirmed" };
      }
      return (await applyVerifiedPaidEntitlement(ctx, event, synchronized, invoice)) ?? processedResult(synchronized);
    }

    if (invoice && billing.state.kind === "scheduledChange") {
      const scheduled = await applyScheduledPaidInvoiceResult(ctx, stripe, event, synchronized, subscription, invoice);
      if (scheduled) return scheduled;
    }
    if (invoice && isConfirmedUnpaid(subscription, invoice)) {
      const tightened = await tightenGraceFromVerifiedFailure(
        ctx,
        { ...event, eventCreatedAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt) },
        synchronized,
      );
      if (tightened) return tightened;
      if (billing.state.kind === "active" && billing.state.plan !== "free") {
        const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: synchronized.organization.organizationId,
          expectedVersion: billing.version,
          state: {
            kind: "grace",
            plan: billing.state.plan,
            firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt),
          },
          correlationId: `stripe:${event.stripeEventId}:subscription-unpaid`,
        });
        if (
          !(await billingMutationConverged(
            ctx,
            synchronized.organization.organizationId,
            changed.changed,
            isGraceOrRestricted,
          ))
        ) {
          return { kind: "retry" as const, errorCode: "billing_version_conflict" };
        }
      } else if (billing.state.kind === "initialPaymentPending") {
        const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: synchronized.organization.organizationId,
          expectedVersion: billing.version,
          state: {
            kind: "grace",
            plan: "pro",
            ...(billing.state.plan === "business" ? { targetPlan: "business" as const } : {}),
            firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt),
          },
          correlationId: `stripe:${event.stripeEventId}:initial-subscription-unpaid`,
        });
        if (
          !(await billingMutationConverged(
            ctx,
            synchronized.organization.organizationId,
            changed.changed,
            isGraceOrRestricted,
          ))
        ) {
          return { kind: "retry" as const, errorCode: "billing_version_conflict" };
        }
      }
    }
    return processedResult(synchronized);
  }

  const invoice = await stripe.invoices.retrieve(event.objectId);
  const customerId = stripeObjectId(invoice.customer);
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!customerId || !subscriptionId || invoice.livemode !== event.livemode) {
    return { kind: "actionRequired" as const, errorCode: "invoice_relationship_invalid" };
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  const synchronizedResult = await synchronizeSubscription(ctx, stripe, event, subscription, customerId);
  if (!synchronizedResult.ok) return synchronizedResult.result;
  const reconciliation = await reconcileAuthoritativeSubscriptionState(
    ctx,
    stripe,
    event,
    subscription,
    synchronizedResult,
  );
  if (!reconciliation.ok) return reconciliation.result;
  const synchronized = reconciliation.synchronized;
  if (stripeObjectId(subscription.latest_invoice) !== invoice.id) {
    return { kind: "ignored" as const, errorCode: "invoice_not_latest" };
  }

  const current = synchronized.organization.billingState;
  const invoiceIsPaid = invoice.status === "paid";
  if (invoiceIsPaid) {
    if (subscription.status !== "active") return processedResult(synchronized);
    const scheduled = await applyScheduledPaidInvoiceResult(ctx, stripe, event, synchronized, subscription, invoice);
    if (scheduled) return scheduled;
    if (current.state.kind === "trial") {
      if (!current.state.selectedPaidPlan || event.eventCreatedAt < current.state.trialEndsAt) {
        return processedResult(synchronized);
      }
      const selectedPaidPlan = current.state.selectedPaidPlan;
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: current.version,
        trialEndsAt: current.state.trialEndsAt,
        result: "paid",
        correlationId: `stripe:${event.stripeEventId}:trial-invoice-paid`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          (state) => state.kind === "active" && state.plan === selectedPaidPlan,
        ))
      )
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      return processedResult(synchronized);
    }
    return (await applyVerifiedPaidEntitlement(ctx, event, synchronized, invoice)) ?? processedResult(synchronized);
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required") {
    if (!isConfirmedUnpaid(subscription, invoice)) {
      return { kind: "ignored" as const, errorCode: "invoice_no_longer_unpaid" };
    }
    const tightened = await tightenGraceFromVerifiedFailure(ctx, event, synchronized);
    if (tightened) return tightened;
    if (synchronized.snapshotStale) return { kind: "ignored" as const, errorCode: "subscription_snapshot_stale" };
    const scheduled = await applyScheduledPaidInvoiceResult(ctx, stripe, event, synchronized, subscription, invoice);
    if (scheduled) return scheduled;
    if (current.state.kind === "trial") {
      if (!current.state.selectedPaidPlan || event.eventCreatedAt < current.state.trialEndsAt) {
        return processedResult(synchronized);
      }
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: current.version,
        trialEndsAt: current.state.trialEndsAt,
        result: "failed",
        firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt),
        correlationId: `stripe:${event.stripeEventId}:trial-invoice-failed`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          isGraceOrRestricted,
        ))
      )
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      return processedResult(synchronized);
    }
    if (current.state.kind === "pendingActivation") {
      // 追加認証待ちは失敗の終端ではない。pendingActivationを維持し、後続のinvoice.paidでのみProへ進める。
      if (event.type === "invoice.payment_action_required") return processedResult(synchronized);
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: current.version,
        state: { kind: "paymentFailed" },
        correlationId: `stripe:${event.stripeEventId}:activation-failed`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          isSafeAfterSubscriptionCancellation,
        ))
      )
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
    } else if (current.state.kind === "active" && current.state.plan !== "free") {
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: current.version,
        state: {
          kind: "grace",
          plan: current.state.plan,
          firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt),
        },
        correlationId: `stripe:${event.stripeEventId}:renewal-failed`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          isGraceOrRestricted,
        ))
      )
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
    } else if (current.state.kind === "initialPaymentPending") {
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: synchronized.organization.organizationId,
        expectedVersion: current.version,
        state: {
          kind: "grace",
          plan: "pro",
          ...(current.state.plan === "business" ? { targetPlan: "business" as const } : {}),
          firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt),
        },
        correlationId: `stripe:${event.stripeEventId}:initial-payment-failed`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          synchronized.organization.organizationId,
          changed.changed,
          isGraceOrRestricted,
        ))
      )
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
    }
    return processedResult(synchronized);
  }
  return event.type === "invoice.paid"
    ? { kind: "ignored" as const, errorCode: "invoice_no_longer_paid" }
    : processedResult(synchronized);
}

function paidPlanAfterVerifiedPayment(state: Doc<"organizationBillingStates">["state"]): StripePaidPlan | null {
  switch (state.kind) {
    case "initialPaymentPending":
    case "pendingActivation":
      return state.plan;
    case "grace":
      return state.targetPlan ?? state.plan;
    case "restricted":
      if (state.targetPlan) return state.targetPlan;
      return state.previousPlan === "pro" || state.previousPlan === "business" ? state.previousPlan : null;
    default:
      return null;
  }
}

async function applyVerifiedPaidEntitlement(
  ctx: ActionCtx,
  event: { stripeEventId: string; eventCreatedAt: number },
  synchronized: SynchronizedSubscription,
  invoice?: Stripe.Invoice | null,
): Promise<WebhookProcessResult | null> {
  const billing = synchronized.organization.billingState;
  if (billing.state.kind === "restricted" && synchronized.organization.latestStripeSubscriptionTerminal) {
    return null;
  }
  const targetPlan = paidPlanAfterVerifiedPayment(billing.state);
  if (!targetPlan) return null;
  const needsRestoration =
    billing.state.kind === "restricted" ||
    (billing.state.kind === "pendingActivation" && billing.state.fallback !== "pro");
  if (
    needsRestoration &&
    (!synchronized.organization.restoreManagerPersonIds || !synchronized.organization.restoreShopIds)
  ) {
    return { kind: "actionRequired", errorCode: "restoration_selection_missing" };
  }
  const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
    organizationId: synchronized.organization.organizationId,
    expectedVersion: billing.version,
    state: { kind: "active", plan: targetPlan },
    ...(invoice?.status === "paid"
      ? {
          notificationDetails: {
            targetPlan,
            amountDue: invoice.amount_paid,
            currency: invoice.currency,
            effectiveAt: event.eventCreatedAt,
          },
        }
      : {}),
    ...(needsRestoration
      ? {
          restoreManagerPersonIds: synchronized.organization.restoreManagerPersonIds,
          restoreShopIds: synchronized.organization.restoreShopIds,
        }
      : {}),
    correlationId: `stripe:${event.stripeEventId}:invoice-paid`,
  });
  const converged = await billingMutationConverged(
    ctx,
    synchronized.organization.organizationId,
    changed.changed,
    (state) => (state.kind === "active" && state.plan === targetPlan) || state.kind === "restricted",
  );
  return converged ? processedResult(synchronized) : { kind: "retry" as const, errorCode: "billing_version_conflict" };
}

async function applyScheduledPaidInvoiceResult(
  ctx: ActionCtx,
  stripe: Stripe,
  event: { stripeEventId: string; eventCreatedAt: number; livemode: boolean },
  synchronized: SynchronizedSubscription,
  subscription: Stripe.Subscription,
  invoice: Stripe.Invoice,
): Promise<WebhookProcessResult | null> {
  const billing = synchronized.organization.billingState;
  if (
    billing.state.kind !== "scheduledChange" ||
    billing.state.currentPlan !== "business" ||
    billing.state.targetPlan !== "pro" ||
    event.eventCreatedAt < billing.state.effectiveAt
  ) {
    return null;
  }
  const context = await ctx.runQuery(internal.organizationStripe.queries.getSafetyContextByOrganization, {
    organizationId: synchronized.organization.organizationId,
  });
  if (
    !context ||
    context.billingVersion !== billing.version ||
    context.livemode !== event.livemode ||
    context.subscription.providerGeneration !== synchronized.providerGeneration ||
    context.billingState.kind !== "scheduledChange" ||
    context.billingState.currentPlan !== "business" ||
    context.billingState.targetPlan !== "pro" ||
    context.billingState.effectiveAt !== billing.state.effectiveAt
  ) {
    return { kind: "retry", errorCode: "billing_version_conflict" };
  }
  const scheduleId =
    stripeObjectId(subscription.schedule) ?? synchronized.organization.latestStripeSubscriptionScheduleId;
  if (!scheduleId || !context.subscription.stripeSubscriptionItemId) {
    return { kind: "actionRequired", errorCode: "scheduled_paid_subscription_not_applied" };
  }
  const scheduledChangeOperation = await ctx.runQuery(
    internal.organizationStripe.queries.getScheduledPaidPlanChangeOperation,
    {
      organizationId: context.organizationId,
      stripeSubscriptionScheduleId: scheduleId,
      stripeSubscriptionId: context.subscription.stripeSubscriptionId,
      stripeSubscriptionItemId: context.subscription.stripeSubscriptionItemId,
      providerGeneration: context.subscription.providerGeneration,
      effectiveAt: billing.state.effectiveAt,
      livemode: context.livemode,
    },
  );
  if (!scheduledChangeOperation) {
    return { kind: "actionRequired", errorCode: "scheduled_paid_subscription_not_applied" };
  }
  try {
    await verifyScheduledPaidPlanDeadlineProviderState(stripe, {
      context,
      subscription,
      effectiveAt: billing.state.effectiveAt,
      stripeSubscriptionScheduleId: scheduleId,
      scheduledChangeOperation,
    });
  } catch (error) {
    if (error instanceof ScheduledPaidPlanDeadlineVerificationError) {
      return { kind: "actionRequired", errorCode: error.errorCode };
    }
    throw error;
  }
  try {
    assertScheduledPaidPlanInvoice(invoice, {
      targetStripePriceId: scheduledChangeOperation.targetStripePriceId,
      effectiveAt: billing.state.effectiveAt,
    });
  } catch {
    return { kind: "actionRequired", errorCode: "scheduled_paid_invoice_invalid" };
  }
  const result =
    invoice.status === "paid" && subscription.status === "active"
      ? "paid"
      : isConfirmedUnpaid(subscription, invoice)
        ? "failed"
        : null;
  if (!result) return { kind: "retry", errorCode: "scheduled_paid_invoice_pending" };
  const changed = await ctx.runMutation(internal.organizationBilling.mutations.confirmScheduledPaidPlanDeadline, {
    organizationId: synchronized.organization.organizationId,
    expectedVersion: billing.version,
    expectedDeadlineAt: billing.state.effectiveAt,
    result,
    ...(result === "failed" ? { firstFailureAt: authoritativeInvoiceFailureAt(invoice, event.eventCreatedAt) } : {}),
    ...(result === "paid" ? { amountDue: invoice.amount_paid, currency: invoice.currency } : {}),
    correlationId: `stripe:${event.stripeEventId}:scheduled-paid-${result}`,
  });
  const converged = await billingMutationConverged(
    ctx,
    synchronized.organization.organizationId,
    changed.changed,
    (state) =>
      result === "paid"
        ? state.kind === "active" || state.kind === "restricted"
        : state.kind === "grace" || state.kind === "restricted",
  );
  if (!converged) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
  await saveSubscriptionFromSafetyAction(ctx, context, subscription, {
    plan: "pro",
    clearStripeSubscriptionScheduleId: true,
  });
  return processedResult(synchronized);
}

type ScheduledPaidPlanChangeOperationEvidence = {
  operationId: Id<"organizationStripeOperations">;
  sourceStripePriceId: string;
  targetStripePriceId: string;
};

class ScheduledPaidPlanDeadlineVerificationError extends Error {
  readonly errorCode = "scheduled_paid_subscription_not_applied";
}

/** 期限ActionとWebhookが同じprovider証拠を満たす場合だけBusiness→Proを確定する。 */
async function verifyScheduledPaidPlanDeadlineProviderState(
  stripe: Stripe,
  args: {
    context: StripeSafetyContext;
    subscription: Stripe.Subscription;
    effectiveAt: number;
    stripeSubscriptionScheduleId: string;
    scheduledChangeOperation: ScheduledPaidPlanChangeOperationEvidence;
  },
) {
  const { context, subscription, effectiveAt, stripeSubscriptionScheduleId, scheduledChangeOperation } = args;
  const subscriptionItemId = context.subscription.stripeSubscriptionItemId;
  if (!subscriptionItemId) throw new ScheduledPaidPlanDeadlineVerificationError();
  const schedule = await stripe.subscriptionSchedules.retrieve(stripeSubscriptionScheduleId);
  const item = requireSingleLicensedSubscriptionItem(subscription);
  try {
    assertPaidPlanChangeScheduleEvidence(schedule, {
      scheduleId: stripeSubscriptionScheduleId,
      subscriptionId: subscription.id,
      organizationId: context.organizationId,
      sourceOperationId: scheduledChangeOperation.operationId,
      providerGeneration: context.subscription.providerGeneration,
      targetStripePriceId: scheduledChangeOperation.targetStripePriceId,
      livemode: context.livemode,
    });
  } catch {
    throw new ScheduledPaidPlanDeadlineVerificationError();
  }
  if (
    subscription.id !== context.subscription.stripeSubscriptionId ||
    subscription.livemode !== context.livemode ||
    stripeObjectId(subscription.customer) !== context.stripeCustomerId ||
    item.id !== subscriptionItemId ||
    item.price.id !== scheduledChangeOperation.targetStripePriceId ||
    subscription.pending_update ||
    !matchesSubscriptionMetadata(subscription, context.organizationId, context.subscription.providerGeneration) ||
    !schedule.phases.some(
      (phase) =>
        phase.start_date === Math.floor(effectiveAt / 1000) &&
        phase.items.length === 1 &&
        stripeObjectId(phase.items[0]?.price) === scheduledChangeOperation.targetStripePriceId,
    )
  ) {
    throw new ScheduledPaidPlanDeadlineVerificationError();
  }
}

/** Scheduleで確定したProの初回請求だけを、期間末変更の支払い根拠として受け入れる。 */
function assertScheduledPaidPlanInvoice(
  invoice: Stripe.Invoice,
  expected: { targetStripePriceId: string; effectiveAt: number },
) {
  const invoiceRecord = invoice as unknown as Record<string, unknown>;
  const effectiveAtSeconds = Math.floor(expected.effectiveAt / 1000);
  const lines = asRecord(invoiceRecord.lines);
  const lineData = Array.isArray(lines?.data) ? lines.data : [];
  const matchingLines = lineData.filter((candidate) => {
    const line = asRecord(candidate);
    const pricing = asRecord(line?.pricing);
    const priceDetails = asRecord(pricing?.price_details);
    const period = asRecord(line?.period);
    const priceId = stripeObjectId(priceDetails?.price) ?? stripeObjectId(line?.price);
    return priceId === expected.targetStripePriceId && period?.start === effectiveAtSeconds;
  });
  if (
    expected.effectiveAt % 1000 !== 0 ||
    invoice.billing_reason !== "subscription_cycle" ||
    invoice.period_start !== effectiveAtSeconds ||
    !Number.isSafeInteger(invoice.period_end) ||
    (invoice.period_end ?? 0) <= effectiveAtSeconds ||
    lines?.has_more === true ||
    lineData.length !== 1 ||
    matchingLines.length !== 1
  ) {
    throw new Error("scheduled_paid_invoice_invalid");
  }
}

async function processCheckoutEvent(
  ctx: ActionCtx,
  stripe: Stripe,
  event: {
    type: "checkout.session.completed" | "checkout.session.expired";
    objectId: string;
    stripeEventId: string;
    webhookLeaseToken: string;
    eventCreatedAt: number;
    livemode: boolean;
    proPriceId?: string;
    businessPriceId?: string;
  },
): Promise<WebhookProcessResult> {
  const session = await stripe.checkout.sessions.retrieve(event.objectId);
  const customerId = stripeObjectId(session.customer);
  if (!customerId || session.livemode !== event.livemode) {
    return { kind: "actionRequired" as const, errorCode: "checkout_customer_invalid" };
  }
  let organization = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
    stripeCustomerId: customerId,
    livemode: event.livemode,
  });
  if (!organization) return { kind: "ignored" as const, errorCode: "customer_not_mapped" };
  const operation = await ctx.runQuery(internal.organizationStripe.queries.getCheckoutOperationBySession, {
    organizationId: organization.organizationId,
    stripeSessionId: session.id,
    livemode: event.livemode,
  });
  if (!operation) return { kind: "actionRequired" as const, errorCode: "checkout_operation_missing" };
  const isCancelledExpiredCheckoutOperation =
    event.type === "checkout.session.expired" &&
    operation.status === "cancelled" &&
    (operation.lastErrorCode === "checkout_session_cancelled" ||
      operation.lastErrorCode === "checkout_session_expired_webhook" ||
      operation.lastErrorCode === "checkout_session_expired");
  if (
    (operation.status !== "succeeded" && !isCancelledExpiredCheckoutOperation) ||
    (operation.kind !== "trialSetupCheckout" &&
      operation.kind !== "immediateProCheckout" &&
      operation.kind !== "immediatePaidCheckout") ||
    operation.providerGeneration === undefined ||
    !operation.stripePriceIdSnapshot
  ) {
    return { kind: "actionRequired" as const, errorCode: "checkout_operation_invalid" };
  }
  const targetPlan = operation.targetPlan === "business" ? "business" : "pro";
  try {
    assertCheckoutSession(session, {
      organizationId: organization.organizationId,
      operationId: operation.operationId,
      stripeSessionId: session.id,
      providerGeneration: operation.providerGeneration,
      livemode: event.livemode,
      customerId,
      priceId: operation.stripePriceIdSnapshot,
    });
  } catch {
    return { kind: "actionRequired" as const, errorCode: "price_snapshot_mismatch" };
  }

  if (event.type === "checkout.session.expired") {
    if (session.status !== "expired") {
      return { kind: "retry" as const, errorCode: "checkout_expiration_not_confirmed" };
    }
    if (isCancelledExpiredCheckoutOperation) {
      return {
        kind: "processed" as const,
        organizationId: organization.organizationId,
        providerGeneration: operation.providerGeneration,
      };
    }
    if (
      (operation.kind === "immediateProCheckout" || operation.kind === "immediatePaidCheckout") &&
      organization.billingState.state.kind === "pendingActivation"
    ) {
      const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: organization.organizationId,
        expectedVersion: organization.billingState.version,
        state: { kind: "paymentFailed" },
        correlationId: `stripe:${event.stripeEventId}:checkout-expired`,
      });
      const converged = await billingMutationConverged(
        ctx,
        organization.organizationId,
        changed.changed,
        (state) => (state.kind === "active" && state.plan === "free") || state.kind === "restricted",
      );
      if (!converged) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
    }
    const released = await ctx.runMutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
      operationId: operation.operationId,
      stripeSessionId: session.id,
      reason: "checkout_session_expired_webhook",
    });
    if (!released.changed) return { kind: "retry" as const, errorCode: "checkout_operation_conflict" };
    return {
      kind: "processed" as const,
      organizationId: organization.organizationId,
      providerGeneration: operation.providerGeneration,
    };
  }

  if (operation.kind === "trialSetupCheckout") {
    if (session.mode !== "setup" || session.status !== "complete") {
      return { kind: "actionRequired" as const, errorCode: "setup_checkout_invalid" };
    }
    const checkoutPriceId = operation.stripePriceIdSnapshot;
    const configuredPrice = await retrieveConfiguredPrice(stripe, checkoutPriceId, event.livemode);
    if (configuredPrice.status === "invalid") {
      return { kind: "actionRequired" as const, errorCode: "price_invalid" };
    }
    if (configuredPrice.status === "inactive") {
      return await recoverTrialCreationAfterInactivePrice(ctx, stripe, organization, event, customerId, {
        providerGeneration: operation.providerGeneration,
        priceId: checkoutPriceId,
      });
    }
    const recoverySource = await ctx.runQuery(internal.organizationStripe.queries.getTrialCreationRecoveryContext, {
      organizationId: organization.organizationId,
      requestKey: event.stripeEventId,
    });
    if (hasInactivePriceRecoveryMarker(recoverySource?.lastErrorCode)) {
      return await recoverTrialCreationAfterInactivePrice(ctx, stripe, organization, event, customerId, {
        providerGeneration: operation.providerGeneration,
        priceId: checkoutPriceId,
        allowTerminalNotFoundRecheck: true,
      });
    }
    const setupIntentId = stripeObjectId(session.setup_intent);
    if (!setupIntentId) return { kind: "actionRequired" as const, errorCode: "setup_intent_missing" };
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = stripeObjectId(setupIntent.payment_method);
    if (
      setupIntent.status !== "succeeded" ||
      setupIntent.usage !== "off_session" ||
      stripeObjectId(setupIntent.customer) !== customerId ||
      !paymentMethodId
    ) {
      return { kind: "actionRequired" as const, errorCode: "setup_intent_invalid" };
    }
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.type !== "card" || stripeObjectId(paymentMethod.customer) !== customerId) {
      return { kind: "actionRequired" as const, errorCode: "payment_method_invalid" };
    }
    let state = organization.billingState.state;
    let immediateAfterTrial = false;
    if (state.kind === "trial" && state.trialEndsAt <= Date.now()) {
      const deadline = await ctx.runMutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: organization.organizationId,
        expectedVersion: organization.billingState.version,
        expectedDeadlineAt: state.trialEndsAt,
      });
      organization = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
        stripeCustomerId: customerId,
        livemode: event.livemode,
      });
      if (!organization) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      state = organization.billingState.state;
      if (!deadline.changed && state.kind === "trial" && state.trialEndsAt <= Date.now()) {
        return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      }
    }
    if ((state.kind === "active" && state.plan === "free") || state.kind === "restricted") {
      const fallback = state.kind === "restricted" ? ("restricted" as const) : ("free" as const);
      const pending = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: organization.organizationId,
        expectedVersion: organization.billingState.version,
        state: { kind: "pendingActivation", plan: targetPlan, fallback },
        correlationId: `stripe:${event.stripeEventId}:late-setup-pending`,
      });
      if (!pending.changed) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      organization = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
        stripeCustomerId: customerId,
        livemode: event.livemode,
      });
      if (!organization) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
      state = organization.billingState.state;
      immediateAfterTrial = true;
    } else if (state.kind === "pendingActivation") {
      immediateAfterTrial = true;
    } else if (state.kind !== "trial" || state.selectedPaidPlan) {
      return { kind: "actionRequired" as const, errorCode: "trial_no_longer_eligible" };
    }
    const selectedTrialEndsAt = state.kind === "trial" ? state.trialEndsAt : undefined;
    if (!immediateAfterTrial && selectedTrialEndsAt === undefined) {
      return { kind: "actionRequired" as const, errorCode: "trial_deadline_missing" };
    }
    const trialSubscriptionCreateSnapshot = {
      stripeCustomerId: customerId,
      stripePaymentMethodId: paymentMethodId,
      ...(immediateAfterTrial ? {} : { trialEndsAt: selectedTrialEndsAt as number }),
    };

    const subscriptionOperation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: organization.organizationId,
      kind: "createTrialSubscription",
      requestKey: event.stripeEventId,
      livemode: event.livemode,
      expectedBillingVersion: organization.billingState.version,
      providerGeneration: operation.providerGeneration ?? organization.providerGeneration + 1,
      stripePriceIdSnapshot: checkoutPriceId,
      targetPlan,
      changeMode: "checkout",
      trialSubscriptionCreateSnapshot,
    });
    if (
      !subscriptionOperation.created &&
      subscriptionOperation.status === "actionRequired" &&
      subscriptionOperation.stripeObjectId &&
      subscriptionOperation.providerGeneration !== undefined &&
      subscriptionOperation.stripePriceIdSnapshot
    ) {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, undefined, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: subscriptionOperation.providerGeneration,
        priceId: subscriptionOperation.stripePriceIdSnapshot,
        livemode: event.livemode,
        operationId: subscriptionOperation.operationId,
        stripeSubscriptionId: subscriptionOperation.stripeObjectId,
        errorCode: "invalid_trial_subscription",
      });
      return rejected
        ? { kind: "actionRequired" as const, errorCode: "invalid_trial_subscription" }
        : { kind: "retry" as const, errorCode: "invalid_trial_cleanup_pending" };
    }
    if (!subscriptionOperation.created && subscriptionOperation.status !== "succeeded") {
      return { kind: "retry" as const, errorCode: "trial_subscription_operation_busy" };
    }
    const subscriptionLease = subscriptionOperation.created ? requireOperationLease(subscriptionOperation) : undefined;
    const subscription = subscriptionOperation.stripeObjectId
      ? await stripe.subscriptions.retrieve(subscriptionOperation.stripeObjectId, { expand: ["latest_invoice"] })
      : await stripe.subscriptions.create(
          trialSubscriptionCreateParams({
            organizationId: organization.organizationId,
            operationId: subscriptionOperation.operationId,
            providerGeneration: subscriptionOperation.providerGeneration ?? organization.providerGeneration + 1,
            priceId: checkoutPriceId,
            snapshot: trialSubscriptionCreateSnapshot,
          }),
          { idempotencyKey: subscriptionOperation.stripeIdempotencyKey },
        );
    if (subscriptionLease) {
      const bound = await ctx.runMutation(internal.organizationStripe.mutations.bindTrialCreationSubscription, {
        operationId: subscriptionOperation.operationId,
        leaseToken: subscriptionLease,
        organizationId: organization.organizationId,
        stripeSubscriptionId: subscription.id,
      });
      if (!bound.changed) return { kind: "retry" as const, errorCode: "trial_subscription_operation_conflict" };
    }
    if (
      !matchesSubscriptionMetadata(
        subscription,
        organization.organizationId,
        subscriptionOperation.providerGeneration ?? organization.providerGeneration + 1,
        checkoutPriceId,
      )
    ) {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, subscription, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: subscriptionOperation.providerGeneration ?? organization.providerGeneration + 1,
        priceId: checkoutPriceId,
        livemode: event.livemode,
        operationId: subscriptionOperation.operationId,
        ...(subscriptionLease ? { operationLease: subscriptionLease } : {}),
        errorCode: "subscription_generation_invalid",
      });
      if (!rejected) return { kind: "retry" as const, errorCode: "invalid_trial_cleanup_pending" };
      return { kind: "actionRequired" as const, errorCode: "subscription_generation_invalid" };
    }
    const synchronized = await synchronizeSubscription(ctx, stripe, event, subscription, customerId, {
      expectedGeneration: subscriptionOperation.providerGeneration,
      expectedPriceId: checkoutPriceId,
      expectedPlan: targetPlan,
      trialCreationOperationId: subscriptionOperation.operationId,
      ...(subscriptionLease ? { trialCreationOperationLeaseToken: subscriptionLease } : {}),
    });
    if (!synchronized.ok) {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, subscription, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: subscriptionOperation.providerGeneration ?? organization.providerGeneration + 1,
        priceId: checkoutPriceId,
        livemode: event.livemode,
        operationId: subscriptionOperation.operationId,
        ...(subscriptionLease ? { operationLease: subscriptionLease } : {}),
        errorCode: synchronized.result.errorCode,
      });
      if (!rejected) return { kind: "retry" as const, errorCode: "invalid_trial_cleanup_pending" };
      return synchronized.result;
    }
    if (
      !immediateAfterTrial &&
      (subscription.status !== "trialing" || (subscription.trial_end ?? 0) * 1000 !== selectedTrialEndsAt)
    ) {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, subscription, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: synchronized.providerGeneration,
        priceId: checkoutPriceId,
        livemode: event.livemode,
        operationId: subscriptionOperation.operationId,
        ...(subscriptionLease ? { operationLease: subscriptionLease } : {}),
        errorCode: "trial_subscription_invalid",
      });
      if (!rejected) return { kind: "retry" as const, errorCode: "invalid_trial_cleanup_pending" };
      return { kind: "actionRequired" as const, errorCode: "trial_subscription_invalid" };
    }
    if (immediateAfterTrial) {
      if (subscription.status === "active") {
        const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, {
          stripeCustomerId: customerId,
          livemode: event.livemode,
          subscription: { stripeSubscriptionId: subscription.id },
        });
        if (invoice.status === "paid") {
          const activated = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
            organizationId: organization.organizationId,
            expectedVersion: organization.billingState.version,
            state: { kind: "active", plan: targetPlan },
            restoreManagerPersonIds: organization.restoreManagerPersonIds,
            restoreShopIds: organization.restoreShopIds,
            correlationId: `stripe:${event.stripeEventId}:late-setup-paid`,
          });
          if (!activated.changed) return { kind: "retry" as const, errorCode: "billing_version_conflict" };
        }
      }
      if (subscriptionLease) {
        await finishOperation(ctx, subscriptionOperation.operationId, subscriptionLease, "succeeded", subscription.id);
      }
      return processedResult(synchronized);
    }
    const selected = await ctx.runMutation(internal.organizationBilling.mutations.selectTrialPro, {
      organizationId: organization.organizationId,
      expectedVersion: organization.billingState.version,
      plan: targetPlan,
      correlationId: `stripe:${event.stripeEventId}:trial-pro-selected`,
    });
    if (!selected.changed && selected.stateKind !== "trial") {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, subscription, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: synchronized.providerGeneration,
        priceId: checkoutPriceId,
        livemode: event.livemode,
        operationId: subscriptionOperation.operationId,
        ...(subscriptionLease ? { operationLease: subscriptionLease } : {}),
        errorCode: "trial_eligibility_race",
      });
      if (!rejected) return { kind: "retry" as const, errorCode: "invalid_trial_cleanup_pending" };
      return { kind: "actionRequired" as const, errorCode: "trial_eligibility_race" };
    }
    if (subscriptionLease) {
      await finishOperation(ctx, subscriptionOperation.operationId, subscriptionLease, "succeeded", subscription.id);
    }
    return processedResult(synchronized);
  }

  if (
    (operation.kind !== "immediateProCheckout" && operation.kind !== "immediatePaidCheckout") ||
    session.mode !== "subscription"
  ) {
    return { kind: "actionRequired" as const, errorCode: "subscription_checkout_invalid" };
  }
  const subscriptionId = stripeObjectId(session.subscription);
  if (!subscriptionId) return { kind: "retry" as const, errorCode: "checkout_subscription_missing" };
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["latest_invoice"] });
  const synchronizedResult = await synchronizeSubscription(ctx, stripe, event, subscription, customerId, {
    expectedGeneration: operation.providerGeneration,
    expectedPriceId: operation.stripePriceIdSnapshot,
    expectedPlan: targetPlan,
  });
  if (!synchronizedResult.ok) return synchronizedResult.result;
  const reconciliation = await reconcileAuthoritativeSubscriptionState(
    ctx,
    stripe,
    event,
    subscription,
    synchronizedResult,
  );
  return reconciliation.ok ? processedResult(reconciliation.synchronized) : reconciliation.result;
}

async function synchronizeSubscription(
  ctx: ActionCtx,
  stripe: Stripe,
  event: {
    stripeEventId: string;
    eventCreatedAt: number;
    livemode: boolean;
    proPriceId?: string;
    businessPriceId?: string;
  },
  subscription: Stripe.Subscription,
  expectedCustomerId?: string,
  options: {
    expectedGeneration?: number;
    expectedPriceId?: string;
    expectedPlan?: StripePaidPlan;
    trialCreationOperationId?: Id<"organizationStripeOperations">;
    trialCreationOperationLeaseToken?: string;
  } = {},
): Promise<
  | ({
      ok: true;
    } & SynchronizedSubscription)
  | {
      ok: false;
      result:
        | { kind: "ignored"; errorCode: string }
        | { kind: "actionRequired"; errorCode: string }
        | { kind: "retry"; errorCode: string };
    }
> {
  const customerId = stripeObjectId(subscription.customer);
  if (
    !customerId ||
    (expectedCustomerId && customerId !== expectedCustomerId) ||
    subscription.livemode !== event.livemode
  ) {
    return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_customer_invalid" } };
  }
  const organization = await resolveOrganizationForSubscription(ctx, customerId, event.livemode);
  if (!organization) return { ok: false, result: { kind: "ignored", errorCode: "customer_not_mapped" } };
  const item = subscription.items.data[0];
  if (
    subscription.items.data.length !== 1 ||
    !item ||
    item.price.livemode !== event.livemode ||
    !getStripeBillingCadence(item.price)
  ) {
    return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_price_invalid" } };
  }

  let providerGeneration: number;
  let operationAuthorizedPlan: StripePaidPlan | undefined;
  if (organization.latestStripeSubscriptionId === subscription.id) {
    providerGeneration = organization.providerGeneration;
    if (!organization.latestStripePriceId) {
      return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_price_invalid" } };
    }
    if (item.price.id !== organization.latestStripePriceId) {
      const state = organization.billingState.state;
      let providerChangeAuthorized = isAuthorizedProviderPlanChange(state, item.price.id, event);
      if (
        !providerChangeAuthorized &&
        state.kind === "pendingActivation" &&
        state.plan === "business" &&
        state.fallback === "pro" &&
        organization.billingState.version > 0 &&
        organization.latestStripeSubscriptionItemId === item.id
      ) {
        const source = await ctx.runQuery(
          internal.organizationStripe.queries.getSuccessfulImmediatePaidPlanChangeOperation,
          {
            organizationId: organization.organizationId,
            livemode: event.livemode,
            providerGeneration,
            sourceBillingVersion: organization.billingState.version - 1,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionItemId: item.id,
            sourceStripePriceId: organization.latestStripePriceId,
            targetStripePriceId: item.price.id,
          },
        );
        if (source) {
          providerChangeAuthorized = true;
          operationAuthorizedPlan = "business";
        }
      }
      if (
        !providerChangeAuthorized &&
        state.kind === "scheduledChange" &&
        state.currentPlan === "business" &&
        state.targetPlan === "pro" &&
        event.eventCreatedAt >= state.effectiveAt &&
        organization.latestStripeSubscriptionScheduleId &&
        organization.latestStripeSubscriptionItemId === item.id
      ) {
        const source = await ctx.runQuery(internal.organizationStripe.queries.getScheduledPaidPlanChangeOperation, {
          organizationId: organization.organizationId,
          stripeSubscriptionScheduleId: organization.latestStripeSubscriptionScheduleId,
          stripeSubscriptionId: subscription.id,
          stripeSubscriptionItemId: item.id,
          providerGeneration,
          effectiveAt: state.effectiveAt,
          livemode: event.livemode,
        });
        if (
          source?.sourceStripePriceId === organization.latestStripePriceId &&
          source.targetStripePriceId === item.price.id
        ) {
          providerChangeAuthorized = true;
          operationAuthorizedPlan = "pro";
        }
      }
      if (!organization.latestStripeSubscriptionItemId || item.id !== organization.latestStripeSubscriptionItemId) {
        providerChangeAuthorized = false;
      }
      if (!providerChangeAuthorized) {
        return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_price_invalid" } };
      }
    }
  } else if (organization.currentStripeSubscriptionId) {
    return { ok: false, result: { kind: "actionRequired", errorCode: "multiple_current_subscriptions" } };
  } else {
    providerGeneration = organization.providerGeneration + 1;
    const operationId = subscription.metadata.shiftori_operation_id as Id<"organizationStripeOperations"> | undefined;
    const operation = operationId
      ? await ctx.runQuery(internal.organizationStripe.queries.getOperation, { operationId })
      : null;
    const priceSnapshot = options.expectedPriceId ?? operation?.stripePriceIdSnapshot;
    if (
      !operation ||
      operation.organizationId !== organization.organizationId ||
      operation.livemode !== event.livemode ||
      operation.providerGeneration !== providerGeneration ||
      !priceSnapshot?.startsWith("price_") ||
      operation.stripePriceIdSnapshot !== priceSnapshot ||
      item.price.id !== priceSnapshot
    ) {
      return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_price_invalid" } };
    }
    if (!matchesSubscriptionMetadata(subscription, organization.organizationId, providerGeneration, priceSnapshot)) {
      return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_generation_invalid" } };
    }
    if (operation.kind === "immediateProCheckout" || operation.kind === "immediatePaidCheckout") {
      if (operation.status === "processing") {
        return { ok: false, result: { kind: "retry", errorCode: "checkout_operation_pending" } };
      }
      if (operation.status !== "succeeded" || !operation.stripeObjectId) {
        return { ok: false, result: { kind: "actionRequired", errorCode: "checkout_operation_invalid" } };
      }
      const checkout = await stripe.checkout.sessions.retrieve(operation.stripeObjectId);
      try {
        assertCheckoutSession(checkout, {
          organizationId: organization.organizationId,
          operationId: operation.operationId,
          stripeSessionId: operation.stripeObjectId,
          providerGeneration,
          livemode: event.livemode,
          customerId,
          priceId: priceSnapshot,
        });
      } catch {
        return { ok: false, result: { kind: "actionRequired", errorCode: "checkout_session_relationship_invalid" } };
      }
      if (
        checkout.status !== "complete" ||
        checkout.mode !== "subscription" ||
        stripeObjectId(checkout.subscription) !== subscription.id
      ) {
        return { ok: false, result: { kind: "actionRequired", errorCode: "checkout_subscription_mismatch" } };
      }
    } else if (operation.kind === "createTrialSubscription") {
      if (operation.status === "processing" && options.expectedGeneration === undefined) {
        return { ok: false, result: { kind: "retry", errorCode: "trial_subscription_operation_pending" } };
      }
      if (
        (operation.status !== "processing" && operation.status !== "succeeded") ||
        (operation.status === "succeeded" && operation.stripeObjectId !== subscription.id)
      ) {
        return { ok: false, result: { kind: "actionRequired", errorCode: "trial_subscription_operation_invalid" } };
      }
    } else {
      return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_operation_invalid" } };
    }
  }
  if (options.expectedGeneration !== undefined && providerGeneration !== options.expectedGeneration) {
    return { ok: false, result: { kind: "actionRequired", errorCode: "provider_generation_mismatch" } };
  }

  const latestInvoiceId = stripeObjectId(subscription.latest_invoice);
  const snapshotPlan = operationAuthorizedPlan
    ? operationAuthorizedPlan
    : options.expectedPlan && options.expectedPriceId === item.price.id
      ? options.expectedPlan
      : resolveSubscriptionSnapshotPlan(organization, item.price.id, event);
  if (!snapshotPlan) {
    return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_price_invalid" } };
  }
  const saved = await ctx.runMutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
    organizationId: organization.organizationId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionItemId: item.id,
    stripePriceId: item.price.id,
    plan: snapshotPlan,
    livemode: event.livemode,
    status: subscription.status,
    providerGeneration,
    ...(subscription.trial_end ? { trialEndsAt: subscription.trial_end * 1000 } : {}),
    currentPeriodStartsAt: item.current_period_start * 1000,
    ...(subscriptionPeriodEnd(subscription) !== undefined
      ? { currentPeriodEndsAt: subscriptionPeriodEnd(subscription) }
      : {}),
    billingCycleAnchor: subscription.billing_cycle_anchor * 1000,
    ...(stripeObjectId(subscription.schedule)
      ? { stripeSubscriptionScheduleId: stripeObjectId(subscription.schedule) as string }
      : organization.latestStripeSubscriptionScheduleId &&
          !(
            organization.billingState.state.kind === "scheduledChange" &&
            organization.billingState.state.currentPlan === "business" &&
            organization.billingState.state.targetPlan === "pro"
          )
        ? { clearStripeSubscriptionScheduleId: true }
        : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(latestInvoiceId ? { latestInvoiceId } : {}),
    eventCreatedAt: event.eventCreatedAt,
    stripeEventId: event.stripeEventId,
    syncedAt: Date.now(),
    ...(options.trialCreationOperationId ? { trialCreationOperationId: options.trialCreationOperationId } : {}),
    ...(options.trialCreationOperationLeaseToken
      ? { trialCreationOperationLeaseToken: options.trialCreationOperationLeaseToken }
      : {}),
  });
  return { ok: true, organization, providerGeneration, snapshotStale: saved.stale };
}

async function reconcileAuthoritativeSubscriptionState(
  ctx: ActionCtx,
  stripe: Stripe,
  event: { stripeEventId: string; eventCreatedAt: number; livemode: boolean },
  subscription: Stripe.Subscription,
  synchronized: SynchronizedSubscription,
): Promise<
  | { ok: true; synchronized: SynchronizedSubscription; reconciled: boolean }
  | { ok: false; result: WebhookProcessResult }
> {
  if (subscription.status === "paused") {
    const canceled = await cancelPausedSubscription(stripe, subscription, {
      organizationId: synchronized.organization.organizationId,
      providerGeneration: synchronized.providerGeneration,
      livemode: event.livemode,
      idempotencyScope: event.stripeEventId,
    });
    const stripeCustomerId = stripeObjectId(canceled.customer);
    if (!stripeCustomerId) {
      return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_customer_invalid" } };
    }
    await saveSubscriptionFromSafetyAction(
      ctx,
      {
        organizationId: synchronized.organization.organizationId,
        stripeCustomerId,
        livemode: event.livemode,
        subscription: { providerGeneration: synchronized.providerGeneration },
      },
      canceled,
    );
    return {
      ok: false,
      result: await applySubscriptionCancellation(ctx, event, synchronized),
    };
  }
  if (["canceled", "incomplete_expired"].includes(subscription.status)) {
    const providerTerminalAt = (subscription.canceled_at ?? subscription.ended_at ?? 0) * 1000;
    return {
      ok: false,
      result: await applySubscriptionCancellation(
        ctx,
        { ...event, eventCreatedAt: providerTerminalAt || Date.now() },
        synchronized,
      ),
    };
  }

  const billing = synchronized.organization.billingState;
  const periodEndsAt = subscriptionPeriodEnd(subscription);
  let reconciled = false;
  const currentPaidPlan =
    billing.state.kind === "active" && billing.state.plan !== "free"
      ? billing.state.plan
      : billing.state.kind === "scheduledChange" && billing.state.targetPlan === "free"
        ? billing.state.currentPlan
        : null;
  if (
    subscription.cancel_at_period_end &&
    periodEndsAt !== undefined &&
    currentPaidPlan !== null &&
    ((billing.state.kind === "active" && billing.state.plan !== "free") ||
      (billing.state.kind === "scheduledChange" &&
        billing.state.targetPlan === "free" &&
        billing.state.effectiveAt !== periodEndsAt))
  ) {
    const restrictionIntent =
      billing.state.kind === "scheduledChange" && billing.state.targetPlan === "free"
        ? { restrictAtPeriodEnd: billing.state.restrictAtPeriodEnd === true }
        : await ctx.runQuery(internal.organizationStripe.queries.getCancelAtPeriodEndRestrictionIntent, {
            organizationId: synchronized.organization.organizationId,
            providerGeneration: synchronized.providerGeneration,
            stripeSubscriptionId: subscription.id,
            stripeSubscriptionItemId: requireSingleLicensedSubscriptionItem(subscription).id,
            effectiveAt: periodEndsAt,
          });
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      state: {
        kind: "scheduledChange",
        currentPlan: currentPaidPlan,
        targetPlan: "free",
        effectiveAt: periodEndsAt,
        ...(restrictionIntent.restrictAtPeriodEnd ? { restrictAtPeriodEnd: true as const } : {}),
      },
      correlationId: `stripe:${event.stripeEventId}:provider-cancel-at-period-end`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        (state) =>
          state.kind === "scheduledChange" &&
          state.currentPlan === currentPaidPlan &&
          state.targetPlan === "free" &&
          state.effectiveAt === periodEndsAt &&
          (state.restrictAtPeriodEnd === true) === restrictionIntent.restrictAtPeriodEnd,
      ))
    ) {
      return { ok: false, result: { kind: "retry", errorCode: "billing_version_conflict" } };
    }
    reconciled = true;
  } else if (
    !subscription.cancel_at_period_end &&
    billing.state.kind === "scheduledChange" &&
    billing.state.targetPlan === "free"
  ) {
    const continuedPlan = billing.state.currentPlan;
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      state: { kind: "scheduledChangeCanceled" },
      correlationId: `stripe:${event.stripeEventId}:provider-cancel-at-period-end-cleared`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        (state) => state.kind === "active" && state.plan === continuedPlan,
      ))
    ) {
      return { ok: false, result: { kind: "retry", errorCode: "billing_version_conflict" } };
    }
    reconciled = true;
  }

  if (!reconciled) return { ok: true, synchronized, reconciled: false };
  const customerId = stripeObjectId(subscription.customer);
  if (!customerId) return { ok: false, result: { kind: "actionRequired", errorCode: "subscription_customer_invalid" } };
  const organization = await resolveOrganizationForSubscription(ctx, customerId, event.livemode);
  if (!organization) return { ok: false, result: { kind: "retry", errorCode: "billing_version_conflict" } };
  return { ok: true, synchronized: { ...synchronized, organization }, reconciled: true };
}

async function tightenGraceFromVerifiedFailure(
  ctx: ActionCtx,
  event: { stripeEventId: string; eventCreatedAt: number },
  synchronized: SynchronizedSubscription,
): Promise<WebhookProcessResult | null> {
  const billing = synchronized.organization.billingState;
  if (billing.state.kind !== "grace") return null;
  if (event.eventCreatedAt >= billing.state.startedAt) return processedResult(synchronized);
  const tightened = await ctx.runMutation(internal.organizationBilling.mutations.tightenVerifiedPaymentGrace, {
    organizationId: synchronized.organization.organizationId,
    expectedVersion: billing.version,
    firstFailureAt: event.eventCreatedAt,
    correlationId: `stripe:${event.stripeEventId}:grace-shortened`,
  });
  if (
    !(await billingMutationConverged(
      ctx,
      synchronized.organization.organizationId,
      tightened.changed,
      (state) => state.kind === "restricted" || (state.kind === "grace" && state.startedAt <= event.eventCreatedAt),
    ))
  ) {
    return { kind: "retry", errorCode: "billing_version_conflict" };
  }
  return processedResult(synchronized);
}

async function applySubscriptionCancellation(
  ctx: ActionCtx,
  event: { stripeEventId: string; eventCreatedAt: number },
  synchronized: {
    organization: ResolvedOrganization;
    providerGeneration: number;
  },
): Promise<WebhookProcessResult> {
  const billing = synchronized.organization.billingState;
  if (billing.state.kind === "trial" && billing.state.selectedPaidPlan) {
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.clearTrialPro, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      correlationId: `stripe:${event.stripeEventId}:trial-subscription-cancelled`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        isSafeAfterSubscriptionCancellation,
      ))
    )
      return { kind: "retry", errorCode: "billing_version_conflict" };
  } else if (billing.state.kind === "initialPaymentPending") {
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.resolveInitialPaymentCancellation, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      correlationId: `stripe:${event.stripeEventId}:initial-payment-cancelled`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        isSafeAfterSubscriptionCancellation,
      ))
    )
      return { kind: "retry", errorCode: "billing_version_conflict" };
  } else if (billing.state.kind === "pendingActivation") {
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      state: { kind: "paymentFailed" },
      correlationId: `stripe:${event.stripeEventId}:activation-cancelled`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        isSafeAfterSubscriptionCancellation,
      ))
    )
      return { kind: "retry", errorCode: "billing_version_conflict" };
  } else if (
    billing.state.kind === "scheduledChange" &&
    billing.state.targetPlan === "free" &&
    event.eventCreatedAt >= billing.state.effectiveAt
  ) {
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.processDeadline, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      expectedDeadlineAt: billing.state.effectiveAt,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        isSafeAfterSubscriptionCancellation,
      ))
    )
      return { kind: "retry", errorCode: "billing_version_conflict" };
  } else if (
    (billing.state.kind === "active" && billing.state.plan !== "free") ||
    billing.state.kind === "grace" ||
    billing.state.kind === "scheduledChange"
  ) {
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.applyUnexpectedCancellation, {
      organizationId: synchronized.organization.organizationId,
      expectedVersion: billing.version,
      correlationId: `stripe:${event.stripeEventId}:unexpected-cancellation`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        synchronized.organization.organizationId,
        changed.changed,
        isSafeAfterSubscriptionCancellation,
      ))
    )
      return { kind: "retry", errorCode: "billing_version_conflict" };
  }
  return processedResult(synchronized);
}

type PaidPlanChangeRecoverySnapshot = {
  operationId: Id<"organizationStripeOperations">;
  organizationId: Id<"organizations">;
  requestKey: string;
  kind: "changePaidPlanNow" | "schedulePaidPlanChange" | "cancelScheduledPlanChange";
  expectedBillingVersion?: number;
  providerGeneration: number;
  sourcePlan: "pro" | "business";
  targetPlan: "free" | "pro" | "business";
  changeMode: "checkout" | "immediate" | "periodEnd";
  stripeSubscriptionIdSnapshot: string;
  stripeSubscriptionItemIdSnapshot: string;
  sourceStripePriceIdSnapshot: string;
  targetStripePriceIdSnapshot: string;
  prorationDate?: number;
  effectiveAt: number;
  stripeObjectId?: string;
  stripeIdempotencyKey: string;
  livemode: boolean;
};

type ClaimedPaidPlanChangeOperation = {
  operationId: Id<"organizationStripeOperations">;
  stripeIdempotencyKey: string;
  stripeObjectId?: string;
};

async function recoverImmediatePaidPlanChange(
  ctx: ActionCtx,
  stripe: Stripe,
  context: StripeSafetyContext,
  persisted: PaidPlanChangeRecoverySnapshot,
  operation: ClaimedPaidPlanChangeOperation,
  leaseToken: string,
) {
  if (
    persisted.sourcePlan !== "pro" ||
    persisted.targetPlan !== "business" ||
    persisted.changeMode !== "immediate" ||
    persisted.prorationDate === undefined
  ) {
    throw new Error("paid_plan_change_intent_invalid");
  }
  let billingVersion = context.billingVersion;
  if (context.billingState.kind === "active" && context.billingState.plan === "pro") {
    const pending = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: billingVersion,
      state: { kind: "pendingActivation", plan: "business", fallback: "pro" },
      correlationId: `stripe:${operation.operationId}:pending-business-upgrade`,
    });
    if (!pending.changed) throw new Error("billing_version_conflict");
    billingVersion += 1;
  } else if (
    !(
      (context.billingState.kind === "pendingActivation" &&
        context.billingState.plan === "business" &&
        context.billingState.fallback === "pro") ||
      (context.billingState.kind === "active" && context.billingState.plan === "business")
    )
  ) {
    await finishOperation(ctx, operation.operationId, leaseToken, "cancelled", undefined, "billing_already_converged");
    return;
  }

  const current = await stripe.subscriptions.retrieve(persisted.stripeSubscriptionIdSnapshot, {
    expand: ["latest_invoice"],
  });
  const currentItem = assertPaidPlanChangeSubscription(current, context, persisted);
  if (
    currentItem.price.id !== persisted.sourceStripePriceIdSnapshot &&
    currentItem.price.id !== persisted.targetStripePriceIdSnapshot
  ) {
    throw new Error("paid_plan_change_price_invalid");
  }
  const updated =
    currentItem.price.id === persisted.targetStripePriceIdSnapshot
      ? current
      : await stripe.subscriptions.update(
          current.id,
          {
            items: [{ id: currentItem.id, price: persisted.targetStripePriceIdSnapshot, quantity: 1 }],
            proration_behavior: "always_invoice",
            payment_behavior: "pending_if_incomplete",
            proration_date: persisted.prorationDate,
            billing_cycle_anchor: "unchanged",
            expand: ["latest_invoice"],
          },
          { idempotencyKey: operation.stripeIdempotencyKey },
        );
  const updatedItem = assertPaidPlanChangeSubscription(updated, context, persisted);
  if (
    updated.billing_cycle_anchor !== current.billing_cycle_anchor ||
    updatedItem.current_period_end !== currentItem.current_period_end ||
    (updatedItem.price.id !== persisted.sourceStripePriceIdSnapshot &&
      updatedItem.price.id !== persisted.targetStripePriceIdSnapshot)
  ) {
    throw new Error("subscription_update_relationship_invalid");
  }
  const appliedPlan = updatedItem.price.id === persisted.targetStripePriceIdSnapshot ? "business" : "pro";
  await saveSubscriptionFromSafetyAction(ctx, context, updated, { plan: appliedPlan });
  if (appliedPlan === "business" && updated.status === "active") {
    const invoice = await retrieveLatestSubscriptionInvoice(stripe, updated, context);
    if (invoice.status === "paid") {
      const activated = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: context.organizationId,
        expectedVersion: billingVersion,
        state: { kind: "active", plan: "business" },
        notificationDetails: {
          targetPlan: "business",
          amountDue: invoice.amount_paid,
          currency: invoice.currency,
          effectiveAt: persisted.prorationDate * 1000,
        },
        correlationId: `stripe:${operation.operationId}:business-activated`,
      });
      if (
        !(await billingMutationConverged(
          ctx,
          context.organizationId,
          activated.changed,
          (state) => state.kind === "active" && state.plan === "business",
        ))
      ) {
        throw new Error("billing_version_conflict");
      }
    }
  }
  await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", updated.id);
}

async function recoverScheduledPaidPlanChange(
  ctx: ActionCtx,
  stripe: Stripe,
  context: StripeSafetyContext,
  persisted: PaidPlanChangeRecoverySnapshot,
  operation: ClaimedPaidPlanChangeOperation,
  leaseToken: string,
) {
  if (persisted.sourcePlan !== "business" || persisted.targetPlan !== "pro" || persisted.changeMode !== "periodEnd") {
    throw new Error("paid_plan_change_intent_invalid");
  }
  const isAlreadyScheduled =
    context.billingState.kind === "scheduledChange" &&
    context.billingState.currentPlan === "business" &&
    context.billingState.targetPlan === "pro" &&
    context.billingState.effectiveAt === persisted.effectiveAt;
  if (!(context.billingState.kind === "active" && context.billingState.plan === "business") && !isAlreadyScheduled) {
    await finishOperation(ctx, operation.operationId, leaseToken, "cancelled", undefined, "billing_already_converged");
    return;
  }

  const current = await stripe.subscriptions.retrieve(persisted.stripeSubscriptionIdSnapshot, {
    expand: ["latest_invoice"],
  });
  const currentItem = assertPaidPlanChangeSubscription(current, context, persisted);
  if (
    current.pending_update ||
    (currentItem.price.id !== persisted.sourceStripePriceIdSnapshot &&
      currentItem.price.id !== persisted.targetStripePriceIdSnapshot)
  ) {
    throw new Error("paid_plan_change_subscription_invalid");
  }
  if (
    currentItem.price.id === persisted.sourceStripePriceIdSnapshot &&
    currentItem.current_period_end * 1000 !== persisted.effectiveAt
  ) {
    throw new Error("paid_plan_change_period_invalid");
  }

  let scheduleId =
    operation.stripeObjectId ?? stripeObjectId(current.schedule) ?? context.subscription.stripeSubscriptionScheduleId;
  let schedule = scheduleId
    ? await stripe.subscriptionSchedules.retrieve(scheduleId)
    : await stripe.subscriptionSchedules.create(
        {
          from_subscription: current.id,
          metadata: stripeMetadata({
            organizationId: context.organizationId,
            operationId: operation.operationId,
            providerGeneration: persisted.providerGeneration,
            priceId: persisted.targetStripePriceIdSnapshot,
          }),
        },
        { idempotencyKey: `${operation.stripeIdempotencyKey}:create` },
      );
  scheduleId = schedule.id;
  assertPaidPlanChangeSchedule(schedule, context, persisted, operation.operationId, scheduleId);
  if (schedule.status === "released" && currentItem.price.id !== persisted.targetStripePriceIdSnapshot) {
    throw new Error("released_schedule_target_not_applied");
  }
  const bound = await ctx.runMutation(internal.organizationStripe.mutations.bindPlanChangeProviderObject, {
    operationId: operation.operationId,
    leaseToken,
    organizationId: context.organizationId,
    stripeObjectId: scheduleId,
  });
  if (!bound.changed) throw new Error("operation_object_bind_failed");
  const targetPhaseExists = schedule.phases.some(
    (phase) =>
      phase.start_date === Math.floor(persisted.effectiveAt / 1000) &&
      phase.items.length === 1 &&
      stripeObjectId(phase.items[0]?.price) === persisted.targetStripePriceIdSnapshot,
  );
  if (!targetPhaseExists) {
    if (schedule.status === "released") throw new Error("subscription_schedule_not_confirmed");
    if (currentItem.price.id !== persisted.sourceStripePriceIdSnapshot) {
      throw new Error("subscription_schedule_not_confirmed");
    }
    const currentCadence = getStripeBillingCadence(currentItem.price);
    const targetPrice = await retrieveExistingRecurringPrice(
      stripe,
      persisted.targetStripePriceIdSnapshot,
      context.livemode,
    );
    if (!currentCadence || !targetPrice || !hasSameBillingCadence(currentCadence, targetPrice)) {
      throw new Error("paid_plan_change_target_price_invalid");
    }
    const phaseStart = schedule.current_phase?.start_date ?? currentItem.current_period_start;
    schedule = await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: "release",
        proration_behavior: "none",
        metadata: stripeMetadata({
          organizationId: context.organizationId,
          operationId: operation.operationId,
          providerGeneration: persisted.providerGeneration,
          priceId: persisted.targetStripePriceIdSnapshot,
        }),
        phases: [
          {
            start_date: phaseStart,
            end_date: Math.floor(persisted.effectiveAt / 1000),
            items: [{ price: persisted.sourceStripePriceIdSnapshot, quantity: 1 }],
            proration_behavior: "none",
          },
          {
            start_date: Math.floor(persisted.effectiveAt / 1000),
            duration: subscriptionScheduleDuration(targetPrice),
            items: [{ price: persisted.targetStripePriceIdSnapshot, quantity: 1 }],
            proration_behavior: "none",
          },
        ],
      },
      { idempotencyKey: `${operation.stripeIdempotencyKey}:configure` },
    );
    assertPaidPlanChangeSchedule(schedule, context, persisted, operation.operationId, scheduleId);
  }
  if (
    !schedule.phases.some(
      (phase) =>
        phase.start_date === Math.floor(persisted.effectiveAt / 1000) &&
        phase.items.length === 1 &&
        stripeObjectId(phase.items[0]?.price) === persisted.targetStripePriceIdSnapshot,
    )
  ) {
    throw new Error("subscription_schedule_not_confirmed");
  }
  await saveSubscriptionFromSafetyAction(ctx, context, current, {
    plan: currentItem.price.id === persisted.targetStripePriceIdSnapshot ? "pro" : "business",
    stripeSubscriptionScheduleId: schedule.id,
  });
  if (!isAlreadyScheduled) {
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingVersion,
      state: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: persisted.effectiveAt,
      },
      correlationId: `stripe:${operation.operationId}:business-to-pro-scheduled`,
    });
    if (!transition.changed) throw new Error("billing_version_conflict");
  }
  await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", schedule.id);
}

async function recoverCanceledPaidPlanChange(
  ctx: ActionCtx,
  stripe: Stripe,
  context: StripeSafetyContext,
  persisted: PaidPlanChangeRecoverySnapshot,
  operation: ClaimedPaidPlanChangeOperation,
  leaseToken: string,
) {
  if (persisted.sourcePlan !== "business" || persisted.targetPlan !== "pro" || persisted.changeMode !== "periodEnd") {
    throw new Error("paid_plan_change_intent_invalid");
  }
  const isScheduled =
    context.billingState.kind === "scheduledChange" &&
    context.billingState.currentPlan === "business" &&
    context.billingState.targetPlan === "pro" &&
    context.billingState.effectiveAt === persisted.effectiveAt;
  const isAlreadyCanceled = context.billingState.kind === "active" && context.billingState.plan === "business";
  if (!isScheduled && !isAlreadyCanceled) {
    await finishOperation(ctx, operation.operationId, leaseToken, "cancelled", undefined, "billing_already_converged");
    return;
  }

  let current = await stripe.subscriptions.retrieve(persisted.stripeSubscriptionIdSnapshot, {
    expand: ["latest_invoice"],
  });
  const currentItem = assertPaidPlanChangeSubscription(current, context, persisted);
  if (current.pending_update || currentItem.price.id !== persisted.sourceStripePriceIdSnapshot) {
    throw new Error("paid_plan_change_subscription_invalid");
  }
  const scheduleId =
    stripeObjectId(current.schedule) ?? context.subscription.stripeSubscriptionScheduleId ?? operation.stripeObjectId;
  if (scheduleId) {
    const source = await ctx.runQuery(internal.organizationStripe.queries.getScheduledPaidPlanChangeOperation, {
      organizationId: context.organizationId,
      stripeSubscriptionScheduleId: scheduleId,
      stripeSubscriptionId: persisted.stripeSubscriptionIdSnapshot,
      stripeSubscriptionItemId: persisted.stripeSubscriptionItemIdSnapshot,
      providerGeneration: persisted.providerGeneration,
      effectiveAt: persisted.effectiveAt,
      livemode: persisted.livemode,
    });
    if (!source || source.targetStripePriceId !== persisted.targetStripePriceIdSnapshot) {
      throw new Error("subscription_schedule_relationship_invalid");
    }
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const expectedSchedule = {
      scheduleId,
      subscriptionId: current.id,
      organizationId: context.organizationId,
      sourceOperationId: source.operationId,
      providerGeneration: persisted.providerGeneration,
      targetStripePriceId: persisted.targetStripePriceIdSnapshot,
      livemode: persisted.livemode,
    };
    assertPaidPlanChangeScheduleEvidence(schedule, expectedSchedule);
    const released =
      schedule.status === "released"
        ? schedule
        : await stripe.subscriptionSchedules.release(
            schedule.id,
            { preserve_cancel_date: false },
            { idempotencyKey: operation.stripeIdempotencyKey },
          );
    assertPaidPlanChangeScheduleEvidence(released, expectedSchedule);
    if (released.status !== "released") {
      throw new Error("subscription_schedule_release_not_confirmed");
    }
    current = await stripe.subscriptions.retrieve(current.id, { expand: ["latest_invoice"] });
    const verifiedItem = assertPaidPlanChangeSubscription(current, context, persisted);
    if (verifiedItem.price.id !== persisted.sourceStripePriceIdSnapshot || stripeObjectId(current.schedule)) {
      throw new Error("subscription_price_changed_during_cancel");
    }
  } else if (isScheduled) {
    throw new Error("subscription_schedule_missing");
  }

  await saveSubscriptionFromSafetyAction(ctx, context, current, {
    plan: "business",
    clearStripeSubscriptionScheduleId: true,
  });
  if (isScheduled) {
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingVersion,
      state: { kind: "scheduledChangeCanceled" },
      correlationId: `stripe:${operation.operationId}:business-to-pro-canceled`,
    });
    if (!transition.changed) throw new Error("billing_version_conflict");
  }
  await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", scheduleId);
}

function assertPaidPlanChangeSubscription(
  subscription: Stripe.Subscription,
  context: StripeSafetyContext,
  persisted: PaidPlanChangeRecoverySnapshot,
) {
  const item = requireSingleLicensedSubscriptionItem(subscription);
  if (
    subscription.id !== persisted.stripeSubscriptionIdSnapshot ||
    subscription.livemode !== persisted.livemode ||
    stripeObjectId(subscription.customer) !== context.stripeCustomerId ||
    item.id !== persisted.stripeSubscriptionItemIdSnapshot ||
    !matchesSubscriptionMetadata(subscription, context.organizationId, persisted.providerGeneration)
  ) {
    throw new Error("paid_plan_change_subscription_invalid");
  }
  return item;
}

function assertPaidPlanChangeSchedule(
  schedule: Stripe.SubscriptionSchedule,
  context: StripeSafetyContext,
  persisted: PaidPlanChangeRecoverySnapshot,
  sourceOperationId: Id<"organizationStripeOperations">,
  scheduleId: string,
) {
  assertPaidPlanChangeScheduleEvidence(schedule, {
    scheduleId,
    subscriptionId: persisted.stripeSubscriptionIdSnapshot,
    organizationId: context.organizationId,
    sourceOperationId,
    providerGeneration: persisted.providerGeneration,
    targetStripePriceId: persisted.targetStripePriceIdSnapshot,
    livemode: persisted.livemode,
  });
}

function assertPaidPlanChangeScheduleEvidence(
  schedule: Stripe.SubscriptionSchedule,
  expected: {
    scheduleId: string;
    subscriptionId: string;
    organizationId: Id<"organizations">;
    sourceOperationId: Id<"organizationStripeOperations">;
    providerGeneration: number;
    targetStripePriceId: string;
    livemode: boolean;
  },
) {
  if (
    schedule.id !== expected.scheduleId ||
    schedule.livemode !== expected.livemode ||
    schedule.status === "canceled" ||
    subscriptionScheduleSubscriptionId(schedule) !== expected.subscriptionId ||
    schedule.metadata?.shiftori_organization_id !== String(expected.organizationId) ||
    schedule.metadata?.shiftori_operation_id !== String(expected.sourceOperationId) ||
    schedule.metadata?.shiftori_provider_generation !== String(expected.providerGeneration) ||
    schedule.metadata?.shiftori_price_id !== expected.targetStripePriceId
  ) {
    throw new Error("subscription_schedule_relationship_invalid");
  }
}

async function retryPaidPlanChangeOperation(
  ctx: ActionCtx,
  persisted: Pick<PaidPlanChangeRecoverySnapshot, "operationId" | "organizationId" | "requestKey">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryPaidPlanChangeOperation, {
    operationId: persisted.operationId,
    leaseToken,
    organizationId: persisted.organizationId,
    requestId: persisted.requestKey,
    errorCode,
  });
}

async function previewImmediatePaidPlanChange(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; targetPlan: "business"; requestId: string },
): Promise<ProrationPreviewResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const targetPriceId = getConfiguredStripePriceId(configuration, args.targetPlan);
  if (!targetPriceId) return unavailable("price_unavailable");
  const context = await getAuthorizedContext(ctx, args.scope, "changePaidPlan");
  if (
    !context?.currentStripeSubscriptionId ||
    !context.currentStripePriceId ||
    context.billingState.state.kind !== "active" ||
    context.billingState.state.plan !== "pro"
  ) {
    return unavailable("not_allowed");
  }
  if (context.currentStripeSubscriptionLivemode !== configuration.livemode) {
    return unavailable("configuration_pending");
  }

  let operation: Awaited<ReturnType<ActionCtx["runMutation"]>> | undefined;
  let leaseToken: string | undefined;
  try {
    const stripe = createStripeClient(configuration.secretKey);
    const [targetPrice, subscription] = await Promise.all([
      retrieveAllowedPrice(stripe, targetPriceId, configuration.livemode),
      stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, { expand: ["latest_invoice"] }),
    ]);
    if (!targetPrice) return unavailable("price_unavailable");
    assertActionSubscription(subscription, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode: configuration.livemode,
    });
    const item = requireSingleLicensedSubscriptionItem(subscription);
    const currentCadence = getStripeBillingCadence(item.price);
    if (
      !currentCadence ||
      item.price.currency !== targetPrice.currency ||
      !hasSameBillingCadence(currentCadence, targetPrice) ||
      item.price.id === targetPriceId ||
      subscription.pending_update ||
      stripeObjectId(subscription.schedule)
    ) {
      return unavailable("not_allowed");
    }
    const prorationDate = Math.floor(Date.now() / 1000);
    if (prorationDate < item.current_period_start || prorationDate > item.current_period_end) {
      return unavailable("provider_unavailable");
    }
    operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: context.organizationId,
      kind: "previewPaidPlanChange",
      requestKey: args.requestId,
      livemode: configuration.livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration: context.providerGeneration,
      sourcePlan: "pro",
      targetPlan: "business",
      changeMode: "immediate",
      stripeSubscriptionIdSnapshot: subscription.id,
      stripeSubscriptionItemIdSnapshot: item.id,
      sourceStripePriceIdSnapshot: item.price.id,
      targetStripePriceIdSnapshot: targetPriceId,
      prorationDate,
      effectiveAt: Date.now(),
    });
    if (!operation.created) {
      return unavailable(operation.conflict ? "in_progress" : "request_already_used");
    }
    leaseToken = requireOperationLease(operation);
    const preview = await stripe.invoices.createPreview({
      customer: context.stripeCustomerId,
      subscription: subscription.id,
      subscription_details: {
        items: [{ id: item.id, price: targetPriceId, quantity: 1 }],
        proration_behavior: "always_invoice",
        proration_date: prorationDate,
        billing_cycle_anchor: "unchanged",
      },
    });
    if (preview.livemode !== configuration.livemode || preview.currency !== targetPrice.currency) {
      throw new Error("invoice_preview_invalid");
    }
    await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", preview.id);
    return {
      status: "available",
      currency: preview.currency,
      amountDue: preview.amount_due,
      currentPeriodEnd: item.current_period_end * 1000,
      prorationDate,
    };
  } catch (error) {
    if (operation?.operationId && leaseToken) {
      await finishOperation(ctx, operation.operationId, leaseToken, "failed", undefined, safeStripeErrorCode(error));
    }
    return unavailable("provider_unavailable");
  }
}

async function applyImmediatePaidPlanChange(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; targetPlan: "business"; requestId: string; prorationDate: number },
): Promise<ChangeResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  if (!Number.isSafeInteger(args.prorationDate) || args.prorationDate < 0) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const targetPriceId = getConfiguredStripePriceId(configuration, args.targetPlan);
  if (!targetPriceId) return unavailable("price_unavailable");
  const context = await getAuthorizedContext(ctx, args.scope, "changePaidPlan");
  if (
    !context?.currentStripeSubscriptionId ||
    !context.currentStripePriceId ||
    !context.stripeCustomerId ||
    !(
      (context.billingState.state.kind === "active" && context.billingState.state.plan === "pro") ||
      (context.billingState.state.kind === "pendingActivation" &&
        context.billingState.state.plan === "business" &&
        context.billingState.state.fallback === "pro")
    )
  ) {
    return unavailable("not_allowed");
  }
  if (context.currentStripeSubscriptionLivemode !== configuration.livemode) {
    return unavailable("configuration_pending");
  }

  let operation: Awaited<ReturnType<ActionCtx["runMutation"]>> | undefined;
  let leaseToken: string | undefined;
  try {
    const stripe = createStripeClient(configuration.secretKey);
    const [targetPrice, current] = await Promise.all([
      retrieveAllowedPrice(stripe, targetPriceId, configuration.livemode),
      stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, { expand: ["latest_invoice"] }),
    ]);
    if (!targetPrice) return unavailable("price_unavailable");
    assertActionSubscription(current, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode: configuration.livemode,
    });
    const currentItem = requireSingleLicensedSubscriptionItem(current);
    const currentCadence = getStripeBillingCadence(currentItem.price);
    if (
      !currentCadence ||
      currentItem.price.currency !== targetPrice.currency ||
      !hasSameBillingCadence(currentCadence, targetPrice) ||
      args.prorationDate < currentItem.current_period_start ||
      args.prorationDate > currentItem.current_period_end ||
      current.pending_update ||
      stripeObjectId(current.schedule)
    ) {
      return unavailable("not_allowed");
    }
    const preview = await ctx.runQuery(internal.organizationStripe.queries.getSuccessfulPaidPlanChangePreview, {
      organizationId: context.organizationId,
      requestKey: args.requestId,
      livemode: configuration.livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration: context.providerGeneration,
      stripeSubscriptionId: current.id,
      stripeSubscriptionItemId: currentItem.id,
      sourceStripePriceId: currentItem.price.id,
      targetStripePriceId: targetPriceId,
      prorationDate: args.prorationDate,
    });
    if (!preview) return unavailable("not_allowed");
    operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: context.organizationId,
      kind: "changePaidPlanNow",
      requestKey: args.requestId,
      livemode: configuration.livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration: context.providerGeneration,
      sourcePlan: "pro",
      targetPlan: "business",
      changeMode: "immediate",
      stripeSubscriptionIdSnapshot: current.id,
      stripeSubscriptionItemIdSnapshot: currentItem.id,
      sourceStripePriceIdSnapshot: currentItem.price.id,
      targetStripePriceIdSnapshot: targetPriceId,
      prorationDate: args.prorationDate,
      effectiveAt: Date.now(),
    });
    if (!operation.created) {
      return unavailable(operation.conflict ? "in_progress" : "request_already_used");
    }
    leaseToken = requireOperationLease(operation);

    let expectedBillingVersion = context.billingState.version;
    if (context.billingState.state.kind === "active") {
      const pending = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: context.organizationId,
        expectedVersion: expectedBillingVersion,
        state: { kind: "pendingActivation", plan: "business", fallback: "pro" },
        correlationId: `stripe:${operation.operationId}:pending-business-upgrade`,
      });
      if (!pending.changed) throw new Error("billing_version_conflict");
      expectedBillingVersion += 1;
    }

    const updated = await stripe.subscriptions.update(
      current.id,
      {
        items: [{ id: currentItem.id, price: targetPriceId, quantity: 1 }],
        proration_behavior: "always_invoice",
        payment_behavior: "pending_if_incomplete",
        proration_date: args.prorationDate,
        billing_cycle_anchor: "unchanged",
        expand: ["latest_invoice"],
      },
      { idempotencyKey: operation.stripeIdempotencyKey },
    );
    const updatedItem = requireSingleLicensedSubscriptionItem(updated);
    if (
      updated.id !== current.id ||
      updatedItem.id !== currentItem.id ||
      updated.billing_cycle_anchor !== current.billing_cycle_anchor ||
      updatedItem.current_period_end !== currentItem.current_period_end ||
      (updatedItem.price.id !== currentItem.price.id && updatedItem.price.id !== targetPriceId)
    ) {
      throw new Error("subscription_update_relationship_invalid");
    }
    await saveVerifiedSubscriptionSnapshot(ctx, context, updated, {
      plan: updatedItem.price.id === targetPriceId ? "business" : "pro",
    });
    const invoice =
      updated.latest_invoice && typeof updated.latest_invoice === "object" && !updated.latest_invoice.deleted
        ? updated.latest_invoice
        : null;
    if (updatedItem.price.id === targetPriceId && invoice?.status === "paid" && updated.status === "active") {
      const activated = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: context.organizationId,
        expectedVersion: expectedBillingVersion,
        state: { kind: "active", plan: "business" },
        notificationDetails: {
          targetPlan: "business",
          amountDue: invoice.amount_paid,
          currency: invoice.currency,
          effectiveAt: args.prorationDate * 1000,
        },
        correlationId: `stripe:${operation.operationId}:business-activated`,
      });
      if (!activated.changed) throw new Error("billing_version_conflict");
    }
    await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", updated.id);
    return { status: "accepted" };
  } catch (error) {
    if (operation?.operationId && leaseToken) {
      await ctx.runMutation(internal.organizationStripe.mutations.retryPaidPlanChangeOperation, {
        operationId: operation.operationId,
        leaseToken,
        organizationId: context.organizationId,
        requestId: args.requestId,
        errorCode: safeStripeErrorCode(error),
      });
    }
    return unavailable("provider_unavailable");
  }
}

async function scheduleBusinessToPro(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; targetPlan: "pro"; requestId: string },
): Promise<ChangeResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, args.scope, "schedulePaidPlanChange");
  if (
    !context?.stripeCustomerId ||
    !context.currentStripeSubscriptionId ||
    !context.currentStripePriceId ||
    context.billingState.state.kind !== "active" ||
    context.billingState.state.plan !== "business"
  ) {
    return unavailable("not_allowed");
  }
  if (context.currentStripeSubscriptionLivemode !== configuration.livemode) {
    return unavailable("configuration_pending");
  }

  let operation: Awaited<ReturnType<ActionCtx["runMutation"]>> | undefined;
  let leaseToken: string | undefined;
  let scheduleId: string | undefined;
  try {
    const stripe = createStripeClient(configuration.secretKey);
    const [proPrice, current] = await Promise.all([
      retrieveAllowedPrice(stripe, configuration.proPriceId, configuration.livemode),
      stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, { expand: ["latest_invoice"] }),
    ]);
    if (!proPrice) return unavailable("price_unavailable");
    assertActionSubscription(current, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode: configuration.livemode,
    });
    const currentItem = requireSingleLicensedSubscriptionItem(current);
    const currentCadence = getStripeBillingCadence(currentItem.price);
    if (
      !currentCadence ||
      currentItem.price.currency !== proPrice.currency ||
      !hasSameBillingCadence(currentCadence, proPrice) ||
      current.pending_update
    ) {
      return unavailable("not_allowed");
    }
    const effectiveAt = currentItem.current_period_end * 1000;
    operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: context.organizationId,
      kind: "schedulePaidPlanChange",
      requestKey: args.requestId,
      livemode: configuration.livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration: context.providerGeneration,
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: current.id,
      stripeSubscriptionItemIdSnapshot: currentItem.id,
      sourceStripePriceIdSnapshot: currentItem.price.id,
      targetStripePriceIdSnapshot: configuration.proPriceId,
      effectiveAt,
    });
    if (!operation.created) {
      return unavailable(operation.conflict ? "in_progress" : "request_already_used");
    }
    leaseToken = requireOperationLease(operation);
    scheduleId = operation.stripeObjectId ?? stripeObjectId(current.schedule) ?? undefined;
    let schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create(
          {
            from_subscription: current.id,
            metadata: stripeMetadata({
              organizationId: context.organizationId,
              operationId: operation.operationId,
              providerGeneration: context.providerGeneration,
              priceId: configuration.proPriceId,
            }),
          },
          { idempotencyKey: `${operation.stripeIdempotencyKey}:create` },
        );
    scheduleId = schedule.id;
    const expectedSchedule = {
      scheduleId,
      subscriptionId: current.id,
      organizationId: context.organizationId,
      sourceOperationId: operation.operationId,
      providerGeneration: context.providerGeneration,
      targetStripePriceId: configuration.proPriceId,
      livemode: configuration.livemode,
    };
    // 既存Scheduleはmetadataでこのoperationの所有物と確認できる場合だけ再利用する。
    assertPaidPlanChangeScheduleEvidence(schedule, expectedSchedule);
    if (schedule.status === "released") throw new Error("subscription_schedule_already_released");
    const bound = await ctx.runMutation(internal.organizationStripe.mutations.bindPlanChangeProviderObject, {
      operationId: operation.operationId,
      leaseToken,
      organizationId: context.organizationId,
      stripeObjectId: schedule.id,
    });
    if (!bound.changed) throw new Error("operation_object_bind_failed");
    const phaseStart = schedule.current_phase?.start_date ?? currentItem.current_period_start;
    schedule = await stripe.subscriptionSchedules.update(
      schedule.id,
      {
        end_behavior: "release",
        proration_behavior: "none",
        metadata: stripeMetadata({
          organizationId: context.organizationId,
          operationId: operation.operationId,
          providerGeneration: context.providerGeneration,
          priceId: configuration.proPriceId,
        }),
        phases: [
          {
            start_date: phaseStart,
            end_date: currentItem.current_period_end,
            items: [{ price: currentItem.price.id, quantity: 1 }],
            proration_behavior: "none",
          },
          {
            start_date: currentItem.current_period_end,
            duration: subscriptionScheduleDuration(proPrice),
            items: [{ price: configuration.proPriceId, quantity: 1 }],
            proration_behavior: "none",
          },
        ],
      },
      { idempotencyKey: `${operation.stripeIdempotencyKey}:configure` },
    );
    assertPaidPlanChangeScheduleEvidence(schedule, expectedSchedule);
    if (
      subscriptionScheduleSubscriptionId(schedule) !== current.id ||
      !schedule.phases.some(
        (phase) =>
          phase.start_date === currentItem.current_period_end &&
          phase.items.length === 1 &&
          stripeObjectId(phase.items[0]?.price) === configuration.proPriceId,
      )
    ) {
      throw new Error("subscription_schedule_not_confirmed");
    }
    await saveVerifiedSubscriptionSnapshot(ctx, context, current, {
      plan: "business",
      stripeSubscriptionScheduleId: schedule.id,
    });
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingState.version,
      state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt },
      correlationId: `stripe:${operation.operationId}:business-to-pro-scheduled`,
    });
    if (!transition.changed) throw new Error("billing_version_conflict");
    await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", schedule.id);
    return { status: "accepted" };
  } catch (error) {
    if (operation?.operationId && leaseToken) {
      await ctx.runMutation(internal.organizationStripe.mutations.retryPaidPlanChangeOperation, {
        operationId: operation.operationId,
        leaseToken,
        organizationId: context.organizationId,
        requestId: args.requestId,
        errorCode: safeStripeErrorCode(error),
      });
    }
    return unavailable("provider_unavailable");
  }
}

async function cancelAnyScheduledPlanChange(
  ctx: ActionCtx,
  args: { scope: BillingActionScope; requestId: string },
): Promise<ChangeResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const preliminary = await getAuthorizedContext(ctx, args.scope, "portal");
  if (preliminary?.billingState.state.kind !== "scheduledChange") {
    return unavailable("not_allowed");
  }
  if (preliminary.billingState.state.targetPlan === "free") {
    return await updateCancelAtPeriodEnd(ctx, {
      scope: args.scope,
      requestId: args.requestId,
      purpose: "cancelFreeSchedule",
      cancelAtPeriodEnd: false,
    });
  }

  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, args.scope, "cancelScheduledPlanChange");
  if (
    !context?.stripeCustomerId ||
    !context.currentStripeSubscriptionId ||
    !context.currentStripePriceId ||
    context.billingState.state.kind !== "scheduledChange" ||
    context.billingState.state.currentPlan !== "business" ||
    context.billingState.state.targetPlan !== "pro"
  ) {
    return unavailable("not_allowed");
  }

  let operation: Awaited<ReturnType<ActionCtx["runMutation"]>> | undefined;
  let leaseToken: string | undefined;
  try {
    const stripe = createStripeClient(configuration.secretKey);
    const current = await stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, {
      expand: ["latest_invoice"],
    });
    assertActionSubscription(current, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode: configuration.livemode,
    });
    const item = requireSingleLicensedSubscriptionItem(current);
    const scheduleId = stripeObjectId(current.schedule) ?? context.stripeSubscriptionScheduleId;
    if (!scheduleId) return unavailable("not_allowed");
    const source = await ctx.runQuery(internal.organizationStripe.queries.getScheduledPaidPlanChangeOperation, {
      organizationId: context.organizationId,
      stripeSubscriptionScheduleId: scheduleId,
      stripeSubscriptionId: current.id,
      stripeSubscriptionItemId: item.id,
      providerGeneration: context.providerGeneration,
      effectiveAt: context.billingState.state.effectiveAt,
      livemode: configuration.livemode,
    });
    if (!source || source.sourceStripePriceId !== item.price.id) {
      return unavailable("not_allowed");
    }
    operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: context.organizationId,
      kind: "cancelScheduledPlanChange",
      requestKey: args.requestId,
      livemode: configuration.livemode,
      expectedBillingVersion: context.billingState.version,
      providerGeneration: context.providerGeneration,
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: current.id,
      stripeSubscriptionItemIdSnapshot: item.id,
      sourceStripePriceIdSnapshot: item.price.id,
      targetStripePriceIdSnapshot: source.targetStripePriceId,
      effectiveAt: context.billingState.state.effectiveAt,
    });
    if (!operation.created) {
      return unavailable(operation.conflict ? "in_progress" : "request_already_used");
    }
    leaseToken = requireOperationLease(operation);
    const bound = await ctx.runMutation(internal.organizationStripe.mutations.bindPlanChangeProviderObject, {
      operationId: operation.operationId,
      leaseToken,
      organizationId: context.organizationId,
      stripeObjectId: scheduleId,
    });
    if (!bound.changed) throw new Error("operation_object_bind_failed");
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const expectedSchedule = {
      scheduleId,
      subscriptionId: current.id,
      organizationId: context.organizationId,
      sourceOperationId: source.operationId,
      providerGeneration: context.providerGeneration,
      targetStripePriceId: source.targetStripePriceId,
      livemode: configuration.livemode,
    };
    assertPaidPlanChangeScheduleEvidence(schedule, expectedSchedule);
    const released =
      schedule.status === "released"
        ? schedule
        : await stripe.subscriptionSchedules.release(
            schedule.id,
            { preserve_cancel_date: false },
            { idempotencyKey: operation.stripeIdempotencyKey },
          );
    assertPaidPlanChangeScheduleEvidence(released, expectedSchedule);
    if (released.status !== "released") {
      throw new Error("subscription_schedule_release_not_confirmed");
    }
    const verified = await stripe.subscriptions.retrieve(current.id, { expand: ["latest_invoice"] });
    const verifiedItem = requireSingleLicensedSubscriptionItem(verified);
    if (verifiedItem.price.id !== item.price.id) throw new Error("subscription_price_changed_during_cancel");
    await saveVerifiedSubscriptionSnapshot(ctx, context, verified, {
      plan: "business",
      clearStripeSubscriptionScheduleId: true,
    });
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingState.version,
      state: { kind: "scheduledChangeCanceled" },
      correlationId: `stripe:${operation.operationId}:business-to-pro-canceled`,
    });
    if (!transition.changed) throw new Error("billing_version_conflict");
    await finishOperation(ctx, operation.operationId, leaseToken, "succeeded", schedule.id);
    return { status: "accepted" };
  } catch (error) {
    if (operation?.operationId && leaseToken) {
      await ctx.runMutation(internal.organizationStripe.mutations.retryPaidPlanChangeOperation, {
        operationId: operation.operationId,
        leaseToken,
        organizationId: context.organizationId,
        requestId: args.requestId,
        errorCode: safeStripeErrorCode(error),
      });
    }
    return unavailable("provider_unavailable");
  }
}

async function updateCancelAtPeriodEnd(
  ctx: ActionCtx,
  args: {
    scope: BillingActionScope;
    requestId: string;
    purpose: "scheduleFree" | "cancelFreeSchedule";
    cancelAtPeriodEnd: boolean;
    restrictAtPeriodEnd?: true;
  },
): Promise<ChangeResult> {
  if (!isReleaseFeatureEnabled("billing")) return unavailable("not_allowed");
  const configuration = getStripeBillingConfiguration();
  if (configuration.status !== "ready") return unavailable("configuration_pending");
  const context = await getAuthorizedContext(ctx, args.scope, args.purpose);
  if (
    !context?.currentStripeSubscriptionId ||
    !context.currentStripeSubscriptionItemId ||
    !context.currentStripePriceId ||
    context.currentPeriodEndsAt === undefined
  ) {
    return unavailable("not_allowed");
  }
  const currentPlan =
    context.billingState.state.kind === "active" && context.billingState.state.plan !== "free"
      ? context.billingState.state.plan
      : context.billingState.state.kind === "scheduledChange" && context.billingState.state.targetPlan === "free"
        ? context.billingState.state.currentPlan
        : null;
  if (!currentPlan) return unavailable("not_allowed");
  const livemode = configuration.livemode;
  if (context.currentStripeSubscriptionLivemode !== livemode) return unavailable("configuration_pending");
  const kind = args.cancelAtPeriodEnd ? ("scheduleFree" as const) : ("cancelFreeSchedule" as const);
  const restrictAtPeriodEnd = args.cancelAtPeriodEnd
    ? args.restrictAtPeriodEnd
    : context.billingState.state.kind === "scheduledChange" &&
        context.billingState.state.targetPlan === "free" &&
        context.billingState.state.restrictAtPeriodEnd === true
      ? (true as const)
      : undefined;
  const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
    organizationId: context.organizationId,
    kind,
    requestKey: args.requestId,
    livemode,
    expectedBillingVersion: context.billingState.version,
    providerGeneration: context.providerGeneration,
    sourcePlan: currentPlan,
    targetPlan: "free",
    ...(restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
    changeMode: "periodEnd",
    stripeSubscriptionIdSnapshot: context.currentStripeSubscriptionId,
    stripeSubscriptionItemIdSnapshot: context.currentStripeSubscriptionItemId,
    sourceStripePriceIdSnapshot: context.currentStripePriceId,
    effectiveAt: context.currentPeriodEndsAt,
  });
  if (!operation.created) return unavailable(operation.conflict ? "in_progress" : "request_already_used");
  const operationLease = requireOperationLease(operation);

  try {
    const stripe = createStripeClient(configuration.secretKey);
    let current: Stripe.Subscription = await stripe.subscriptions.retrieve(context.currentStripeSubscriptionId, {
      expand: ["latest_invoice"],
    });
    assertActionSubscription(current, {
      organizationId: context.organizationId,
      customerId: context.stripeCustomerId,
      subscriptionId: context.currentStripeSubscriptionId,
      priceId: context.currentStripePriceId,
      providerGeneration: context.providerGeneration,
      livemode,
    });
    current = await cancelPausedSubscription(stripe, current, {
      organizationId: context.organizationId,
      providerGeneration: context.providerGeneration,
      livemode,
      idempotencyScope: operation.stripeIdempotencyKey,
    });
    if (["canceled", "incomplete_expired"].includes(current.status)) {
      const stripeCustomerId = stripeObjectId(current.customer);
      if (!stripeCustomerId) throw new Error("subscription_customer_invalid");
      await saveSubscriptionFromSafetyAction(
        ctx,
        {
          organizationId: context.organizationId,
          stripeCustomerId,
          livemode,
          subscription: { providerGeneration: context.providerGeneration },
        },
        current,
      );
      await convergeCancelledTrialContinuation(ctx, {
        organizationId: context.organizationId,
        stripeCustomerId,
        livemode,
        providerGeneration: context.providerGeneration,
        correlationId: `operation-${operation.operationId}-terminal`,
      });
      await finishOperation(
        ctx,
        operation.operationId,
        operationLease,
        "cancelled",
        current.id,
        "subscription_terminal",
      );
      return unavailable("not_allowed");
    }
    const subscription = await stripe.subscriptions.update(
      context.currentStripeSubscriptionId,
      { cancel_at_period_end: args.cancelAtPeriodEnd },
      { idempotencyKey: operation.stripeIdempotencyKey },
    );
    const periodEndsAt = subscriptionPeriodEnd(subscription);
    const item = requireSingleLicensedSubscriptionItem(subscription);
    if (
      subscription.livemode !== livemode ||
      subscription.cancel_at_period_end !== args.cancelAtPeriodEnd ||
      (args.cancelAtPeriodEnd && periodEndsAt === undefined)
    ) {
      throw new Error("subscription_schedule_not_confirmed");
    }
    if (item.price.id !== context.currentStripePriceId) throw new Error("subscription_price_changed_during_schedule");
    await saveVerifiedSubscriptionSnapshot(ctx, context, subscription, { plan: currentPlan });
    const nextState =
      args.cancelAtPeriodEnd && periodEndsAt !== undefined
        ? {
            kind: "scheduledChange" as const,
            currentPlan,
            targetPlan: "free" as const,
            effectiveAt: periodEndsAt,
            ...(restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
          }
        : { kind: "scheduledChangeCanceled" as const };
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingState.version,
      state: nextState,
      correlationId: `stripe:${operation.operationId}:${kind}`,
    });
    if (!transition.changed) throw new Error("billing_version_conflict");
    await finishOperation(ctx, operation.operationId, operationLease, "succeeded", subscription.id);
    return { status: "accepted" as const };
  } catch (error) {
    await retryCancelAtPeriodEndChange(
      ctx,
      {
        organizationId: context.organizationId,
        expectedBillingVersion: context.billingState.version,
        requestId: args.requestId,
        operationKind: kind,
      },
      operation.operationId,
      operationLease,
      safeStripeErrorCode(error),
    );
    return unavailable("provider_unavailable");
  }
}

async function resolveOrganizationForSubscription(
  ctx: ActionCtx,
  customerId: string,
  livemode: boolean,
): Promise<ResolvedOrganization | null> {
  return await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
    stripeCustomerId: customerId,
    livemode,
  });
}

function assertSafetySubscription(
  subscription: Stripe.Subscription,
  context: {
    stripeCustomerId: string;
    livemode: boolean;
    subscription: { stripeSubscriptionId: string; stripePriceId: string; providerGeneration: number };
  },
) {
  const item = subscription.items.data[0];
  if (
    subscription.id !== context.subscription.stripeSubscriptionId ||
    subscription.livemode !== context.livemode ||
    stripeObjectId(subscription.customer) !== context.stripeCustomerId ||
    subscription.items.data.length !== 1 ||
    !item ||
    item.price.id !== context.subscription.stripePriceId
  ) {
    throw new Error("subscription_relationship_invalid");
  }
}

async function stopRestrictedStripeCollection(
  ctx: ActionCtx,
  stripe: Stripe | null,
  context: StripeSafetyContext,
  args: { organizationId: Id<"organizations">; expectedBillingVersion: number; requestId: string },
) {
  let latestInvoiceId = context.subscription.latestInvoiceId;
  const cancelOperation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
    organizationId: args.organizationId,
    kind: "cancelSubscription",
    requestKey: args.requestId,
    livemode: context.livemode,
    expectedBillingVersion: args.expectedBillingVersion,
    providerGeneration: context.subscription.providerGeneration,
  });
  if (cancelOperation.status === "actionRequired") return;
  if (cancelOperation.status !== "succeeded" && !cancelOperation.created) return;
  if (cancelOperation.status !== "succeeded") {
    const leaseToken = requireOperationLease(cancelOperation);
    if (!stripe) {
      await retryExpiredGraceSafetyOperation(
        ctx,
        args,
        cancelOperation.operationId,
        leaseToken,
        "stripe_configuration_unavailable",
        "expiredGrace",
      );
      return;
    }
    try {
      const current = await stripe.subscriptions.retrieve(context.subscription.stripeSubscriptionId, {
        expand: ["latest_invoice"],
      });
      assertSafetySubscription(current, context);
      const latestInvoice = await retrieveLatestSubscriptionInvoice(stripe, current, context);
      if (latestInvoice.status === "paid" && current.status === "active") {
        const restricted = context.billingState.kind === "restricted" ? context.billingState : null;
        if (!restricted) throw new Error("billing_version_conflict");
        const targetPlan = paidPlanAfterVerifiedPayment(restricted);
        if (!targetPlan) throw new Error("billing_recovery_plan_missing");
        const recovered = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
          organizationId: args.organizationId,
          expectedVersion: args.expectedBillingVersion,
          state: { kind: "active", plan: targetPlan },
          restoreManagerPersonIds: restricted.recoveryManagerPersonIds,
          restoreShopIds: restricted.previousActiveShopIds,
          correlationId: `stripe:${cancelOperation.operationId}:late-payment-recovered`,
        });
        if (!recovered.changed) throw new Error("billing_version_conflict");
        await saveSubscriptionFromSafetyAction(ctx, context, current, { plan: targetPlan });
        await finishOperation(ctx, cancelOperation.operationId, leaseToken, "succeeded", current.id);
        return;
      }
      const subscription =
        current.status === "canceled"
          ? current
          : await stripe.subscriptions.cancel(current.id, undefined, {
              idempotencyKey: cancelOperation.stripeIdempotencyKey,
            });
      if (subscription.status !== "canceled") throw new Error("subscription_cancel_not_confirmed");
      await saveSubscriptionFromSafetyAction(ctx, context, subscription);
      latestInvoiceId = stripeObjectId(subscription.latest_invoice) ?? latestInvoiceId;
      await finishOperation(ctx, cancelOperation.operationId, leaseToken, "succeeded", subscription.id);
    } catch (error) {
      await retryExpiredGraceSafetyOperation(
        ctx,
        args,
        cancelOperation.operationId,
        leaseToken,
        safeStripeErrorCode(error),
        "expiredGrace",
      );
      return;
    }
  }

  const invoiceOperation = await ctx.runMutation(internal.organizationStripe.mutations.beginOperation, {
    organizationId: args.organizationId,
    kind: "stopInvoiceCollection",
    requestKey: args.requestId,
    livemode: context.livemode,
    expectedBillingVersion: args.expectedBillingVersion,
    providerGeneration: context.subscription.providerGeneration,
  });
  if (invoiceOperation.status === "succeeded" || invoiceOperation.status === "actionRequired") return;
  if (!invoiceOperation.created) return;
  const invoiceLease = requireOperationLease(invoiceOperation);
  if (!stripe) {
    await retryExpiredGraceSafetyOperation(
      ctx,
      args,
      invoiceOperation.operationId,
      invoiceLease,
      "stripe_configuration_unavailable",
      "expiredGrace",
    );
    return;
  }
  try {
    const [openInvoices, draftInvoices] = await Promise.all([
      stripe.invoices.list({ customer: context.stripeCustomerId, status: "open", limit: 100 }),
      stripe.invoices.list({ customer: context.stripeCustomerId, status: "draft", limit: 100 }),
    ]);
    if (openInvoices.has_more || draftInvoices.has_more) throw new Error("invoice_collection_unbounded");
    const invoices = [...openInvoices.data, ...draftInvoices.data].filter(
      (invoice) => invoiceSubscriptionId(invoice) === context.subscription.stripeSubscriptionId,
    );
    for (const candidate of invoices) {
      if (candidate.livemode !== context.livemode || stripeObjectId(candidate.customer) !== context.stripeCustomerId) {
        throw new Error("invoice_relationship_invalid");
      }
      const invoice =
        candidate.auto_advance === false
          ? candidate
          : await stripe.invoices.update(
              candidate.id,
              { auto_advance: false },
              { idempotencyKey: `${invoiceOperation.stripeIdempotencyKey}:${candidate.id}` },
            );
      if (invoice.auto_advance !== false) throw new Error("invoice_collection_not_stopped");
    }
    await finishOperation(
      ctx,
      invoiceOperation.operationId,
      invoiceLease,
      "succeeded",
      latestInvoiceId ?? invoices[0]?.id,
    );
  } catch (error) {
    await retryExpiredGraceSafetyOperation(
      ctx,
      args,
      invoiceOperation.operationId,
      invoiceLease,
      safeStripeErrorCode(error),
      "expiredGrace",
    );
  }
}

async function retrieveLatestSubscriptionInvoice(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  context: { stripeCustomerId: string; livemode: boolean; subscription: { stripeSubscriptionId: string } },
) {
  const expanded = subscription.latest_invoice;
  const invoice =
    expanded && typeof expanded === "object" && !expanded.deleted
      ? expanded
      : await stripe.invoices.retrieve(stripeObjectId(expanded) ?? "");
  if (
    !invoice.id ||
    invoice.livemode !== context.livemode ||
    stripeObjectId(invoice.customer) !== context.stripeCustomerId ||
    invoiceSubscriptionId(invoice) !== context.subscription.stripeSubscriptionId
  ) {
    throw new Error("invoice_relationship_invalid");
  }
  return invoice;
}

function isConfirmedUnpaid(subscription: Stripe.Subscription, invoice: Stripe.Invoice) {
  return (
    invoice.status === "open" &&
    invoice.amount_remaining > 0 &&
    ["incomplete", "past_due", "unpaid"].includes(subscription.status)
  );
}

/** Stripeが確定したinvoice時刻だけを猶予開始の根拠に使う。 */
function authoritativeInvoiceFailureAt(invoice: Stripe.Invoice, fallbackAt = Date.now()) {
  const finalizedAt = invoice.status_transitions?.finalized_at;
  const providerTimestamp = finalizedAt ?? invoice.created;
  return Number.isSafeInteger(providerTimestamp) ? providerTimestamp * 1000 : fallbackAt;
}

function matchesSubscriptionMetadata(
  subscription: Stripe.Subscription,
  organizationId: Id<"organizations">,
  providerGeneration: number,
  priceId?: string,
) {
  return (
    subscription.metadata.shiftori_organization_id === String(organizationId) &&
    subscription.metadata.shiftori_provider_generation === String(providerGeneration) &&
    (priceId === undefined || subscription.metadata.shiftori_price_id === priceId)
  );
}

function configuredPlanForPrice(
  priceId: string,
  configuration: { proPriceId?: string; businessPriceId?: string },
): StripePaidPlan | null {
  if (configuration.proPriceId === priceId) return "pro";
  if (configuration.businessPriceId === priceId) return "business";
  return null;
}

/** provider側のPrice差し替えは、先に永続化した業務状態が対象planを明示する場合だけ受け入れる。 */
function isAuthorizedProviderPlanChange(
  state: Doc<"organizationBillingStates">["state"],
  providerPriceId: string,
  configuration: { proPriceId?: string; businessPriceId?: string },
) {
  const providerPlan = configuredPlanForPrice(providerPriceId, configuration);
  if (!providerPlan) return false;
  if (state.kind === "pendingActivation") return state.plan === providerPlan;
  if (state.kind === "scheduledChange") return state.targetPlan === providerPlan;
  if (state.kind === "grace") return (state.targetPlan ?? state.plan) === providerPlan;
  if (state.kind === "restricted") return state.targetPlan === providerPlan;
  return state.kind === "active" && state.plan === providerPlan;
}

function resolveSubscriptionSnapshotPlan(
  organization: ResolvedOrganization,
  providerPriceId: string,
  configuration: { proPriceId?: string; businessPriceId?: string },
): StripePaidPlan | null {
  const configuredPlan = configuredPlanForPrice(providerPriceId, configuration);
  if (configuredPlan) return configuredPlan;
  if (providerPriceId === organization.latestStripePriceId) {
    // plan field追加前の保存済みSubscriptionは、Business再導入前のPro契約だけである。
    // TODO[narrow]: 全deploymentでSubscription planをprovider snapshotから補完し、
    //   verifyStripeSubscriptionsのmissingPlanが0件になった後に`?? "pro"`を削除する。
    return organization.latestStripePlan ?? "pro";
  }
  return null;
}

function assertActionSubscription(
  subscription: Stripe.Subscription,
  expected: {
    organizationId: Id<"organizations">;
    customerId?: string;
    subscriptionId: string;
    priceId?: string;
    providerGeneration: number;
    livemode: boolean;
  },
) {
  const item = subscription.items.data[0];
  if (
    subscription.id !== expected.subscriptionId ||
    subscription.livemode !== expected.livemode ||
    !expected.customerId ||
    stripeObjectId(subscription.customer) !== expected.customerId ||
    subscription.items.data.length !== 1 ||
    !item ||
    !expected.priceId ||
    item.price.id !== expected.priceId ||
    !matchesSubscriptionMetadata(subscription, expected.organizationId, expected.providerGeneration)
  ) {
    throw new Error("subscription_relationship_invalid");
  }
}

/** pausedは再開可能なので、取消確認前に新しい世代を開始できる終端状態として保存しない。 */
async function cancelPausedSubscription(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  expected: {
    organizationId: Id<"organizations">;
    providerGeneration: number;
    livemode: boolean;
    idempotencyScope: string;
  },
) {
  if (subscription.status !== "paused") return subscription;
  const item = subscription.items.data[0];
  const customerId = stripeObjectId(subscription.customer);
  if (!item || !customerId) throw new Error("subscription_relationship_invalid");
  const idempotencyKey = `shiftori:${expected.livemode ? "live" : "test"}:paused-cancel:${createHash("sha256")
    .update(`${subscription.id}:${expected.idempotencyScope}`)
    .digest("base64url")}`;
  const canceled = await stripe.subscriptions.cancel(subscription.id, undefined, { idempotencyKey });
  assertActionSubscription(canceled, {
    organizationId: expected.organizationId,
    customerId,
    subscriptionId: subscription.id,
    priceId: item.price.id,
    providerGeneration: expected.providerGeneration,
    livemode: expected.livemode,
  });
  if (canceled.status !== "canceled") throw new Error("paused_subscription_cancel_not_confirmed");
  return canceled;
}

/**
 * Price停止前に開始したTrial作成だけを回収する。
 * ローカル同期済み契約は継続し、未同期のprovider objectは取消す。停止後にcreateは再送しない。
 */
async function recoverTrialCreationAfterInactivePrice(
  ctx: ActionCtx,
  stripe: Stripe,
  organization: ResolvedOrganization,
  event: {
    stripeEventId: string;
    webhookLeaseToken: string;
    eventCreatedAt: number;
    livemode: boolean;
    proPriceId?: string;
  },
  customerId: string,
  expected: { providerGeneration: number; priceId: string; allowTerminalNotFoundRecheck?: boolean },
): Promise<WebhookProcessResult> {
  type RecoverySource = {
    operationId: Id<"organizationStripeOperations">;
    status: Doc<"organizationStripeOperations">["status"];
    leaseToken?: string;
    leaseExpiresAt?: number;
    stripeObjectId?: string;
    providerGeneration?: number;
    stripePriceIdSnapshot?: string;
    targetPlan?: StripePaidPlan;
    trialSubscriptionCreateSnapshot?: Doc<"organizationStripeOperations">["trialSubscriptionCreateSnapshot"];
    stripeIdempotencyKey: string;
    livemode: boolean;
    expectedBillingVersion?: number;
    attemptCount: number;
    lastErrorCode?: string;
    mappingState: "none" | "matching" | "conflict";
  };

  const resumePreservedSubscription = async (
    source: RecoverySource,
    operationLeaseToken: string,
    subscription?: Stripe.Subscription,
  ): Promise<WebhookProcessResult> => {
    // TODO[narrow]: 旧trialSetupCheckoutのtargetPlan欠損0と旧scheduler drainを確認後にfallbackを削除する。
    const targetPlan = source.targetPlan ?? "pro";
    const snapshot = source.trialSubscriptionCreateSnapshot;
    if (
      !source.stripeObjectId ||
      source.providerGeneration === undefined ||
      !source.stripePriceIdSnapshot ||
      !snapshot
    ) {
      return { kind: "actionRequired", errorCode: "price_inactive_recovery_invalid" };
    }
    const current =
      subscription ??
      (await stripe.subscriptions.retrieve(source.stripeObjectId, {
        expand: ["latest_invoice"],
      }));
    try {
      assertInvalidTrialSubscriptionOwnership(current, {
        stripeSubscriptionId: source.stripeObjectId,
        stripeCustomerId: customerId,
        stripePriceId: source.stripePriceIdSnapshot,
        livemode: event.livemode,
      });
      if (
        !matchesSubscriptionMetadata(
          current,
          organization.organizationId,
          source.providerGeneration,
          source.stripePriceIdSnapshot,
        ) ||
        current.metadata.shiftori_operation_id !== String(source.operationId)
      ) {
        throw new Error("subscription_metadata_invalid");
      }
    } catch {
      return { kind: "actionRequired", errorCode: "subscription_generation_invalid" };
    }

    const synchronized = await synchronizeSubscription(ctx, stripe, event, current, customerId, {
      expectedGeneration: source.providerGeneration,
      expectedPriceId: source.stripePriceIdSnapshot,
      expectedPlan: targetPlan,
      trialCreationOperationId: source.operationId,
      trialCreationOperationLeaseToken: operationLeaseToken,
    });
    if (!synchronized.ok) return synchronized.result;

    const rejectInvalidShape = async (errorCode: string): Promise<WebhookProcessResult> => {
      const rejected = await rejectCreatedTrialSubscription(ctx, stripe, current, {
        organizationId: organization.organizationId,
        customerId,
        providerGeneration: source.providerGeneration as number,
        priceId: source.stripePriceIdSnapshot as string,
        livemode: event.livemode,
        operationId: source.operationId,
        stripeSubscriptionId: source.stripeObjectId,
        operationLease: operationLeaseToken,
        errorCode,
      });
      return rejected
        ? { kind: "actionRequired", errorCode }
        : { kind: "retry", errorCode: "invalid_trial_cleanup_pending" };
    };

    if (["canceled", "incomplete_expired", "paused"].includes(current.status)) {
      const terminal = await reconcileAuthoritativeSubscriptionState(ctx, stripe, event, current, synchronized);
      return terminal.ok ? processedResult(terminal.synchronized) : terminal.result;
    }

    if (snapshot.trialEndsAt !== undefined) {
      if (
        (current.trial_end ?? 0) * 1000 !== snapshot.trialEndsAt ||
        (Date.now() < snapshot.trialEndsAt && current.status !== "trialing")
      ) {
        return await rejectInvalidShape("trial_subscription_invalid");
      }
    } else if (current.status === "trialing") {
      return await rejectInvalidShape("trial_subscription_invalid");
    }

    let recovered = synchronized;
    let billing = recovered.organization.billingState;
    if (billing.state.kind === "trial") {
      if (snapshot.trialEndsAt === undefined || billing.state.trialEndsAt !== snapshot.trialEndsAt) {
        return { kind: "actionRequired", errorCode: "trial_subscription_billing_state_invalid" };
      }
      if (!billing.state.selectedPaidPlan) {
        const selected = await ctx.runMutation(internal.organizationBilling.mutations.selectTrialPro, {
          organizationId: organization.organizationId,
          expectedVersion: billing.version,
          plan: targetPlan,
          correlationId: `stripe:${event.stripeEventId}:inactive-price-trial-pro-selected`,
        });
        if (!selected.changed && selected.stateKind !== "trial") {
          return { kind: "retry", errorCode: "billing_version_conflict" };
        }
        const refreshed = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
          stripeCustomerId: customerId,
          livemode: event.livemode,
        });
        if (!refreshed) return { kind: "retry", errorCode: "billing_version_conflict" };
        recovered = { ...recovered, organization: refreshed };
        billing = refreshed.billingState;
      }
      if (billing.state.kind === "trial" && billing.state.trialEndsAt <= Date.now()) {
        const deadline = await ctx.runMutation(internal.organizationBilling.mutations.processDeadline, {
          organizationId: organization.organizationId,
          expectedVersion: billing.version,
          expectedDeadlineAt: billing.state.trialEndsAt,
        });
        const refreshed = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
          stripeCustomerId: customerId,
          livemode: event.livemode,
        });
        if (!refreshed) return { kind: "retry", errorCode: "billing_version_conflict" };
        if (
          !deadline.changed &&
          refreshed.billingState.state.kind === "trial" &&
          refreshed.billingState.state.trialEndsAt <= Date.now()
        ) {
          return { kind: "retry", errorCode: "billing_version_conflict" };
        }
        recovered = { ...recovered, organization: refreshed };
        billing = refreshed.billingState;
      }
    }

    if (current.status === "trialing") {
      return billingStateReferencesPaidPlan(billing.state, targetPlan)
        ? processedResult(recovered)
        : await rejectInvalidShape("trial_subscription_billing_state_invalid");
    }

    const reconciliation = await reconcileAuthoritativeSubscriptionState(ctx, stripe, event, current, recovered);
    if (!reconciliation.ok) return reconciliation.result;
    const reconciled = reconciliation.synchronized;
    if (current.status !== "active") {
      return billingStateReferencesPaidPlan(reconciled.organization.billingState.state, targetPlan)
        ? processedResult(reconciled)
        : await rejectInvalidShape("subscription_billing_state_invalid");
    }

    const invoice = await retrieveLatestSubscriptionInvoice(stripe, current, {
      stripeCustomerId: customerId,
      livemode: event.livemode,
      subscription: { stripeSubscriptionId: current.id },
    });
    if (invoice.status !== "paid") {
      return billingStateReferencesPaidPlan(reconciled.organization.billingState.state, targetPlan)
        ? { kind: "actionRequired", errorCode: "active_subscription_payment_unverified" }
        : await rejectInvalidShape("active_subscription_payment_unverified");
    }
    let latestOrganization = reconciled.organization;
    const currentState = latestOrganization.billingState.state;
    if (billingStateReferencesPaidPlan(currentState, targetPlan)) {
      return processedResult(reconciled);
    }
    if ((currentState.kind === "active" && currentState.plan === "free") || currentState.kind === "restricted") {
      const fallback = currentState.kind === "restricted" ? ("restricted" as const) : ("free" as const);
      const pending = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: organization.organizationId,
        expectedVersion: latestOrganization.billingState.version,
        state: { kind: "pendingActivation", plan: targetPlan, fallback },
        correlationId: `stripe:${event.stripeEventId}:inactive-price-late-setup-pending`,
      });
      if (!pending.changed) return { kind: "retry", errorCode: "billing_version_conflict" };
      const refreshed = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
        stripeCustomerId: customerId,
        livemode: event.livemode,
      });
      if (!refreshed) return { kind: "retry", errorCode: "billing_version_conflict" };
      latestOrganization = refreshed;
    }
    if (
      (latestOrganization.billingState.state.kind !== "pendingActivation" &&
        latestOrganization.billingState.state.kind !== "initialPaymentPending" &&
        latestOrganization.billingState.state.kind !== "grace") ||
      !billingStateReferencesPaidPlan(latestOrganization.billingState.state, targetPlan)
    ) {
      return { kind: "actionRequired", errorCode: "subscription_billing_state_invalid" };
    }
    const activated = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: organization.organizationId,
      expectedVersion: latestOrganization.billingState.version,
      state: { kind: "active", plan: targetPlan },
      restoreManagerPersonIds: latestOrganization.restoreManagerPersonIds,
      restoreShopIds: latestOrganization.restoreShopIds,
      correlationId: `stripe:${event.stripeEventId}:inactive-price-late-setup-paid`,
    });
    if (!activated.changed) return { kind: "retry", errorCode: "billing_version_conflict" };
    return processedResult({ ...reconciled, organization: latestOrganization });
  };

  const rejectUncommittedSubscription = async (
    source: RecoverySource,
    subscription?: Stripe.Subscription,
    ownsActiveLease = false,
  ): Promise<WebhookProcessResult> => {
    if (
      !source.stripeObjectId ||
      source.providerGeneration === undefined ||
      !source.stripePriceIdSnapshot ||
      !["processing", "retrying", "succeeded", "actionRequired"].includes(source.status)
    ) {
      return { kind: "actionRequired", errorCode: "price_inactive_recovery_invalid" };
    }
    const requestKey = invalidTrialCleanupRequestKey(source.operationId, source.stripeObjectId);
    const resolution = await ctx.runMutation(
      internal.organizationStripe.mutations.resolveInactivePriceTrialSubscription,
      {
        organizationId: organization.organizationId,
        sourceOperationId: source.operationId,
        ...(source.leaseToken ? { sourceLeaseToken: source.leaseToken } : {}),
        ...(ownsActiveLease ? { allowActiveSourceLease: true } : {}),
        requestKey,
        stripeSubscriptionId: source.stripeObjectId,
        errorCode: "price_inactive",
        webhookLeaseToken: event.webhookLeaseToken,
      },
    );
    if (resolution.kind === "busy") {
      return { kind: "retry", errorCode: INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE };
    }
    if (resolution.kind === "conflict") {
      return { kind: "actionRequired", errorCode: "trial_subscription_mapping_conflict" };
    }
    if (resolution.kind === "preserved") {
      if (resolution.billingConverged) {
        return {
          kind: "processed",
          organizationId: organization.organizationId,
          providerGeneration: resolution.providerGeneration,
        };
      }
      if (!resolution.leaseToken) {
        return { kind: "retry", errorCode: "trial_subscription_operation_busy" };
      }
      const resumed = await resumePreservedSubscription(source, resolution.leaseToken, subscription);
      const operationStatus =
        resumed.kind === "processed"
          ? ("succeeded" as const)
          : resumed.kind === "retry"
            ? ("retrying" as const)
            : resumed.kind === "failed"
              ? ("failed" as const)
              : ("actionRequired" as const);
      await finishOperation(
        ctx,
        source.operationId,
        resolution.leaseToken,
        operationStatus,
        resumed.kind === "processed" ? source.stripeObjectId : undefined,
        "errorCode" in resumed ? resumed.errorCode : undefined,
      );
      return resumed;
    }
    const rejected = await executeInvalidTrialSubscriptionCleanup(ctx, stripe, subscription, {
      organizationId: organization.organizationId,
      customerId,
      providerGeneration: source.providerGeneration,
      priceId: source.stripePriceIdSnapshot,
      livemode: event.livemode,
      operationId: source.operationId,
      stripeSubscriptionId: source.stripeObjectId,
      requestKey,
      cleanupOperation: resolution.operation,
    });
    return rejected
      ? { kind: "actionRequired", errorCode: "price_inactive" }
      : { kind: "retry", errorCode: "invalid_trial_cleanup_pending" };
  };

  let source = await ctx.runQuery(internal.organizationStripe.queries.getTrialCreationRecoveryContext, {
    organizationId: organization.organizationId,
    requestKey: event.stripeEventId,
  });
  if (!source) return { kind: "actionRequired", errorCode: "price_invalid" };
  if (
    source.providerGeneration !== expected.providerGeneration ||
    source.stripePriceIdSnapshot !== expected.priceId ||
    source.livemode !== event.livemode
  ) {
    return { kind: "actionRequired", errorCode: "trial_subscription_operation_mismatch" };
  }
  if (source.stripeObjectId) return await rejectUncommittedSubscription(source);

  const snapshot = source.trialSubscriptionCreateSnapshot;
  if (!snapshot || snapshot.stripeCustomerId !== customerId) {
    return { kind: "actionRequired", errorCode: "trial_subscription_snapshot_invalid" };
  }

  const recovery = await ctx.runMutation(
    internal.organizationStripe.mutations.claimInactivePriceTrialSubscriptionRecovery,
    {
      organizationId: organization.organizationId,
      operationId: source.operationId,
      requestKey: event.stripeEventId,
      stripeIdempotencyKey: source.stripeIdempotencyKey,
      livemode: source.livemode,
      providerGeneration: source.providerGeneration,
      stripePriceIdSnapshot: source.stripePriceIdSnapshot,
      ...(expected.allowTerminalNotFoundRecheck ? { allowTerminalNotFoundRecheck: true } : {}),
      webhookLeaseToken: event.webhookLeaseToken,
    },
  );
  if (
    recovery.conflict ||
    recovery.operationId !== source.operationId ||
    recovery.stripeIdempotencyKey !== source.stripeIdempotencyKey
  ) {
    return { kind: "actionRequired", errorCode: "trial_subscription_operation_conflict" };
  }
  if (recovery.stripeObjectId) {
    source = await ctx.runQuery(internal.organizationStripe.queries.getTrialCreationRecoveryContext, {
      organizationId: organization.organizationId,
      requestKey: event.stripeEventId,
    });
    if (!source) return { kind: "actionRequired", errorCode: "trial_subscription_operation_missing" };
    return await rejectUncommittedSubscription(source, undefined, recovery.created);
  }
  if (!recovery.created) {
    return recovery.status === "failed" || recovery.status === "cancelled" || recovery.status === "actionRequired"
      ? { kind: "actionRequired", errorCode: "price_inactive_recovery_unavailable" }
      : { kind: "retry", errorCode: INACTIVE_PRICE_RECOVERY_BUSY_ERROR_CODE };
  }
  if (!source) return { kind: "retry", errorCode: "trial_subscription_operation_missing" };
  const sourceOperationId = source.operationId;

  const recoveryLease = requireOperationLease(recovery);
  let subscriptions: Stripe.ApiList<Stripe.Subscription>;
  try {
    subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  } catch (error) {
    const recoveryMarker =
      source.lastErrorCode === "price_inactive_subscription_not_found" ||
      source.lastErrorCode?.startsWith(INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX)
        ? source.lastErrorCode
        : `${INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX}0`;
    await finishOperation(ctx, source.operationId, recoveryLease, "retrying", undefined, recoveryMarker);
    const providerErrorCode = safeStripeErrorCode(error);
    return {
      kind: "retry",
      errorCode:
        providerErrorCode === "stripe_temporary_error"
          ? INACTIVE_PRICE_RECOVERY_PROVIDER_RETRY_ERROR_CODE
          : providerErrorCode,
    };
  }
  const candidates = subscriptions.data.filter(
    (subscription) => subscription.metadata.shiftori_operation_id === String(sourceOperationId),
  );
  if (subscriptions.has_more || candidates.length > 1) {
    await finishOperation(
      ctx,
      source.operationId,
      recoveryLease,
      "actionRequired",
      undefined,
      "trial_subscription_recovery_ambiguous",
    );
    return { kind: "actionRequired", errorCode: "trial_subscription_recovery_ambiguous" };
  }

  const candidate = candidates[0];
  if (!candidate) {
    if (source.lastErrorCode === "price_inactive_subscription_not_found") {
      await finishOperation(
        ctx,
        source.operationId,
        recoveryLease,
        "actionRequired",
        undefined,
        "price_inactive_subscription_not_found",
      );
      return { kind: "actionRequired", errorCode: "price_inactive_subscription_not_found" };
    }
    const completedRechecks = inactivePriceRecoveryCheckCount(source.lastErrorCode);
    const nextRecheck = completedRechecks + 1;
    if (nextRecheck >= INACTIVE_PRICE_RECOVERY_MAX_RECHECKS) {
      await finishOperation(
        ctx,
        source.operationId,
        recoveryLease,
        "actionRequired",
        undefined,
        "price_inactive_subscription_not_found",
      );
      return { kind: "actionRequired", errorCode: "price_inactive_subscription_not_found" };
    }
    await finishOperation(
      ctx,
      source.operationId,
      recoveryLease,
      "retrying",
      undefined,
      `${INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX}${nextRecheck}`,
    );
    return { kind: "retry", errorCode: "price_inactive_subscription_pending" };
  }

  try {
    assertInvalidTrialSubscriptionOwnership(candidate, {
      stripeSubscriptionId: candidate.id,
      stripeCustomerId: customerId,
      stripePriceId: expected.priceId,
      livemode: event.livemode,
    });
    if (
      !matchesSubscriptionMetadata(
        candidate,
        organization.organizationId,
        expected.providerGeneration,
        expected.priceId,
      ) ||
      candidate.metadata.shiftori_operation_id !== String(source.operationId)
    ) {
      throw new Error("subscription_metadata_invalid");
    }
  } catch {
    await finishOperation(
      ctx,
      source.operationId,
      recoveryLease,
      "actionRequired",
      undefined,
      "subscription_generation_invalid",
    );
    return { kind: "actionRequired", errorCode: "subscription_generation_invalid" };
  }

  const bound = await ctx.runMutation(internal.organizationStripe.mutations.bindTrialCreationSubscription, {
    operationId: source.operationId,
    leaseToken: recoveryLease,
    organizationId: organization.organizationId,
    stripeSubscriptionId: candidate.id,
  });
  if (!bound.changed) return { kind: "retry", errorCode: "trial_subscription_operation_conflict" };
  source = await ctx.runQuery(internal.organizationStripe.queries.getTrialCreationRecoveryContext, {
    organizationId: organization.organizationId,
    requestKey: event.stripeEventId,
  });
  if (!source) return { kind: "retry", errorCode: "trial_subscription_operation_missing" };
  return await rejectUncommittedSubscription(source, candidate, true);
}

async function executeInvalidTrialSubscriptionCleanup(
  ctx: ActionCtx,
  stripe: Stripe | undefined,
  subscription: Stripe.Subscription | undefined,
  expected: {
    organizationId: Id<"organizations">;
    customerId: string;
    providerGeneration: number;
    priceId: string;
    livemode: boolean;
    operationId: Id<"organizationStripeOperations">;
    stripeSubscriptionId: string;
    requestKey: string;
    cleanupOperation: {
      operationId: Id<"organizationStripeOperations">;
      stripeIdempotencyKey: string;
      status: Doc<"organizationStripeOperations">["status"];
      leaseToken?: string;
      created: boolean;
    };
  },
) {
  const operation = expected.cleanupOperation;
  if (!operation.created) return operation.status === "succeeded";
  const operationLease = requireOperationLease(operation);
  if (!stripe) {
    await retryInvalidTrialSubscriptionCleanup(
      ctx,
      {
        organizationId: expected.organizationId,
        expectedBillingVersion: 0,
        requestId: expected.requestKey,
      },
      operation.operationId,
      operationLease,
      "stripe_configuration_unavailable",
    );
    return false;
  }
  try {
    const current =
      subscription ??
      (await stripe.subscriptions.retrieve(expected.stripeSubscriptionId, { expand: ["latest_invoice"] }));
    await cancelInvalidTrialSubscription(
      ctx,
      stripe,
      current,
      {
        organizationId: expected.organizationId,
        sourceOperationId: expected.operationId,
        stripeSubscriptionId: expected.stripeSubscriptionId,
        stripeCustomerId: expected.customerId,
        stripePriceId: expected.priceId,
        providerGeneration: expected.providerGeneration,
        livemode: expected.livemode,
      },
      {
        operationId: operation.operationId,
        operationLease,
        stripeIdempotencyKey: operation.stripeIdempotencyKey,
      },
    );
    return true;
  } catch (error) {
    await retryInvalidTrialSubscriptionCleanup(
      ctx,
      {
        organizationId: expected.organizationId,
        expectedBillingVersion: 0,
        requestId: expected.requestKey,
      },
      operation.operationId,
      operationLease,
      safeStripeErrorCode(error),
    );
    return false;
  }
}

async function rejectCreatedTrialSubscription(
  ctx: ActionCtx,
  stripe: Stripe | undefined,
  subscription: Stripe.Subscription | undefined,
  expected: {
    organizationId: Id<"organizations">;
    customerId: string;
    providerGeneration: number;
    priceId: string;
    livemode: boolean;
    operationId: Id<"organizationStripeOperations">;
    stripeSubscriptionId?: string;
    operationLease?: string;
    errorCode: string;
  },
) {
  const stripeSubscriptionId = subscription?.id ?? expected.stripeSubscriptionId;
  if (!stripeSubscriptionId) throw new Error("created_subscription_id_missing");
  const requestKey = invalidTrialCleanupRequestKey(expected.operationId, stripeSubscriptionId);
  const operation = await ctx.runMutation(internal.organizationStripe.mutations.beginInvalidTrialSubscriptionCleanup, {
    organizationId: expected.organizationId,
    sourceOperationId: expected.operationId,
    ...(expected.operationLease ? { sourceLeaseToken: expected.operationLease } : {}),
    requestKey,
    stripeSubscriptionId,
    errorCode: expected.errorCode,
  });
  return await executeInvalidTrialSubscriptionCleanup(ctx, stripe, subscription, {
    organizationId: expected.organizationId,
    customerId: expected.customerId,
    providerGeneration: expected.providerGeneration,
    priceId: expected.priceId,
    livemode: expected.livemode,
    operationId: expected.operationId,
    stripeSubscriptionId,
    requestKey,
    cleanupOperation: operation,
  });
}

async function cancelInvalidTrialSubscription(
  ctx: ActionCtx,
  stripe: Stripe,
  subscription: Stripe.Subscription,
  expected: {
    organizationId: Id<"organizations">;
    sourceOperationId: Id<"organizationStripeOperations">;
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    providerGeneration: number;
    livemode: boolean;
  },
  operation: {
    operationId: Id<"organizationStripeOperations">;
    operationLease: string;
    stripeIdempotencyKey: string;
  },
) {
  assertInvalidTrialSubscriptionOwnership(subscription, expected);
  const cancelled =
    subscription.status === "canceled" || subscription.status === "incomplete_expired"
      ? subscription
      : await stripe.subscriptions.cancel(subscription.id, undefined, {
          idempotencyKey: operation.stripeIdempotencyKey,
        });
  assertInvalidTrialSubscriptionOwnership(cancelled, expected);
  if (cancelled.status !== "canceled" && cancelled.status !== "incomplete_expired") {
    throw new Error("created_subscription_cancel_not_confirmed");
  }
  await saveSubscriptionFromSafetyAction(
    ctx,
    {
      organizationId: expected.organizationId,
      stripeCustomerId: expected.stripeCustomerId,
      livemode: expected.livemode,
      subscription: { providerGeneration: expected.providerGeneration },
    },
    cancelled,
  );
  await convergeCancelledTrialContinuation(ctx, {
    organizationId: expected.organizationId,
    stripeCustomerId: expected.stripeCustomerId,
    livemode: expected.livemode,
    providerGeneration: expected.providerGeneration,
    correlationId: `invalid-trial:${operation.operationId}`,
  });
  await finishOperation(ctx, operation.operationId, operation.operationLease, "succeeded", cancelled.id);
}

function assertInvalidTrialSubscriptionOwnership(
  subscription: Stripe.Subscription,
  expected: {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
    stripePriceId: string;
    livemode: boolean;
  },
) {
  const item = subscription.items.data[0];
  if (
    subscription.id !== expected.stripeSubscriptionId ||
    subscription.livemode !== expected.livemode ||
    stripeObjectId(subscription.customer) !== expected.stripeCustomerId ||
    subscription.items.data.length !== 1 ||
    !item ||
    item.price.id !== expected.stripePriceId
  ) {
    throw new Error("created_subscription_relationship_invalid");
  }
}

function invalidTrialCleanupRequestKey(
  sourceOperationId: Id<"organizationStripeOperations">,
  stripeSubscriptionId: string,
) {
  return createHash("sha256").update(`invalid-trial:${sourceOperationId}:${stripeSubscriptionId}`).digest("base64url");
}

function inactivePriceRecoveryCheckCount(lastErrorCode?: string) {
  if (!lastErrorCode?.startsWith(INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX)) return 0;
  const count = Number(lastErrorCode.slice(INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX.length));
  return Number.isSafeInteger(count) && count > 0 ? count : 0;
}

function hasInactivePriceRecoveryMarker(lastErrorCode?: string) {
  return (
    lastErrorCode?.startsWith(INACTIVE_PRICE_RECOVERY_PENDING_CODE_PREFIX) === true ||
    lastErrorCode === "price_inactive_subscription_not_found"
  );
}

function billingStateReferencesPaidPlan(state: Doc<"organizationBillingStates">["state"], targetPlan: StripePaidPlan) {
  switch (state.kind) {
    case "trial":
      return state.selectedPaidPlan === targetPlan;
    case "initialPaymentPending":
    case "pendingActivation":
      return state.plan === targetPlan;
    case "grace":
      return (state.targetPlan ?? state.plan) === targetPlan;
    case "scheduledChange":
      return state.currentPlan === targetPlan || state.targetPlan === targetPlan;
    case "active":
      return state.plan === targetPlan;
    case "restricted":
      return state.previousPlan === targetPlan || state.targetPlan === targetPlan;
    case "complimentary":
      return false;
  }
}

async function saveSubscriptionFromSafetyAction(
  ctx: ActionCtx,
  context: {
    organizationId: Id<"organizations">;
    stripeCustomerId: string;
    livemode: boolean;
    subscription: { providerGeneration: number };
  },
  subscription: Stripe.Subscription,
  options: {
    plan?: StripePaidPlan;
    stripeSubscriptionScheduleId?: string;
    clearStripeSubscriptionScheduleId?: boolean;
  } = {},
) {
  const item = subscription.items.data[0];
  if (!item) throw new Error("subscription_item_missing");
  const latestInvoiceId = stripeObjectId(subscription.latest_invoice);
  const periodEndsAt = subscriptionPeriodEnd(subscription);
  await ctx.runMutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
    organizationId: context.organizationId,
    stripeCustomerId: context.stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionItemId: item.id,
    stripePriceId: item.price.id,
    ...(options.plan ? { plan: options.plan } : {}),
    livemode: context.livemode,
    status: subscription.status,
    providerGeneration: context.subscription.providerGeneration,
    ...(subscription.trial_end ? { trialEndsAt: subscription.trial_end * 1000 } : {}),
    ...(item.current_period_start ? { currentPeriodStartsAt: item.current_period_start * 1000 } : {}),
    ...(periodEndsAt !== undefined ? { currentPeriodEndsAt: periodEndsAt } : {}),
    ...(subscription.billing_cycle_anchor ? { billingCycleAnchor: subscription.billing_cycle_anchor * 1000 } : {}),
    ...(options.stripeSubscriptionScheduleId
      ? { stripeSubscriptionScheduleId: options.stripeSubscriptionScheduleId }
      : {}),
    ...(options.clearStripeSubscriptionScheduleId ? { clearStripeSubscriptionScheduleId: true } : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(latestInvoiceId ? { latestInvoiceId } : {}),
    syncedAt: Date.now(),
  });
}

function requireSingleLicensedSubscriptionItem(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  if (
    subscription.items.data.length !== 1 ||
    !item ||
    (item.quantity ?? 1) !== 1 ||
    !getStripeBillingCadence(item.price)
  ) {
    throw new Error("subscription_item_invalid");
  }
  return item;
}

async function saveVerifiedSubscriptionSnapshot(
  ctx: ActionCtx,
  context: Pick<
    AuthorizedActionContext,
    "organizationId" | "stripeCustomerId" | "providerGeneration" | "currentStripeSubscriptionLivemode"
  >,
  subscription: Stripe.Subscription,
  options: {
    plan: StripePaidPlan;
    stripeSubscriptionScheduleId?: string;
    clearStripeSubscriptionScheduleId?: boolean;
  },
) {
  const item = requireSingleLicensedSubscriptionItem(subscription);
  const stripeCustomerId = stripeObjectId(subscription.customer);
  const livemode = context.currentStripeSubscriptionLivemode;
  if (
    !context.stripeCustomerId ||
    !stripeCustomerId ||
    stripeCustomerId !== context.stripeCustomerId ||
    livemode === undefined
  ) {
    throw new Error("subscription_snapshot_relationship_invalid");
  }
  const latestInvoiceId = stripeObjectId(subscription.latest_invoice);
  await ctx.runMutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
    organizationId: context.organizationId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionItemId: item.id,
    stripePriceId: item.price.id,
    plan: options.plan,
    livemode,
    status: subscription.status,
    providerGeneration: context.providerGeneration,
    ...(subscription.trial_end ? { trialEndsAt: subscription.trial_end * 1000 } : {}),
    currentPeriodStartsAt: item.current_period_start * 1000,
    currentPeriodEndsAt: item.current_period_end * 1000,
    billingCycleAnchor: subscription.billing_cycle_anchor * 1000,
    ...(options.stripeSubscriptionScheduleId
      ? { stripeSubscriptionScheduleId: options.stripeSubscriptionScheduleId }
      : {}),
    ...(options.clearStripeSubscriptionScheduleId ? { clearStripeSubscriptionScheduleId: true } : {}),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    ...(latestInvoiceId ? { latestInvoiceId } : {}),
    syncedAt: Date.now(),
  });
}

async function preservePaidTrialContinuation(
  ctx: ActionCtx,
  stripe: Stripe,
  context: StripeSafetyContext,
  subscription: Stripe.Subscription,
  operation: {
    operationId: Id<"organizationStripeOperations">;
    operationLease: string;
  },
) {
  if (subscription.status !== "active") return false;
  const invoice = await retrieveLatestSubscriptionInvoice(stripe, subscription, context);
  if (invoice.status !== "paid" || invoice.amount_remaining !== 0) return false;

  const billingPlan =
    context.billingState.kind === "trial"
      ? context.billingState.selectedPaidPlan
      : context.billingState.kind === "initialPaymentPending"
        ? context.billingState.plan
        : undefined;
  // TODO[narrow]: Subscription plan補完と旧trial operationのtargetPlan欠損0を確認後、Pro fallbackを削除する。
  const targetPlan = context.subscription.plan ?? billingPlan ?? "pro";
  if (billingPlan && billingPlan !== targetPlan) throw new Error("subscription_plan_mismatch");

  await saveSubscriptionFromSafetyAction(ctx, context, subscription, { plan: targetPlan });
  let converged = context.billingState.kind === "active" && context.billingState.plan === targetPlan;
  if (context.billingState.kind === "trial") {
    const providerTrialEndsAt = subscription.trial_end ? subscription.trial_end * 1000 : undefined;
    if (providerTrialEndsAt !== context.billingState.trialEndsAt) {
      throw new Error("trial_boundary_mismatch");
    }
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
      organizationId: context.organizationId,
      expectedVersion: context.billingVersion,
      trialEndsAt: context.billingState.trialEndsAt,
      result: "paid",
      correlationId: `stripe:${operation.operationId}:trial-cancel-already-paid`,
    });
    converged = await billingMutationConverged(
      ctx,
      context.organizationId,
      transition.changed,
      (state) => state.kind === "active" && state.plan === targetPlan,
    );
  } else if (context.billingState.kind === "initialPaymentPending") {
    const transition = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: context.organizationId,
      expectedVersion: context.billingVersion,
      state: { kind: "active", plan: targetPlan },
      correlationId: `stripe:${operation.operationId}:trial-cancel-already-paid`,
    });
    converged = await billingMutationConverged(
      ctx,
      context.organizationId,
      transition.changed,
      (state) => state.kind === "active" && state.plan === targetPlan,
    );
  }
  if (!converged) throw new Error("billing_version_conflict");

  await finishOperation(
    ctx,
    operation.operationId,
    operation.operationLease,
    "succeeded",
    subscription.id,
    "trial_continuation_already_paid",
  );
  return true;
}

async function convergeCancelledTrialContinuation(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    stripeCustomerId: string;
    livemode: boolean;
    providerGeneration: number;
    correlationId: string;
  },
) {
  const organization = await ctx.runQuery(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
    stripeCustomerId: args.stripeCustomerId,
    livemode: args.livemode,
  });
  if (!organization) return;
  const result = await applySubscriptionCancellation(
    ctx,
    { stripeEventId: args.correlationId, eventCreatedAt: Date.now() },
    { organization, providerGeneration: args.providerGeneration },
  );
  if (result.kind === "retry" || result.kind === "actionRequired") {
    throw new Error(result.errorCode);
  }
}

async function retryTrialContinuationCancellation(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action: "trialContinuation",
  });
}

async function retryInvalidTrialSubscriptionCleanup(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action: "invalidTrialSubscription",
  });
}

async function retryScheduledFreeDeadline(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action: "scheduledFree",
  });
}

async function retryScheduledPaidPlanDeadline(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action: "scheduledPaid",
  });
}

async function retryCancelAtPeriodEndChange(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
    operationKind: "scheduleFree" | "cancelFreeSchedule";
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action: "cancelAtPeriodEnd",
    operationKind: args.operationKind,
  });
}

async function convergeCancelAtPeriodEndState(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    operationId: Id<"organizationStripeOperations">;
    billingState: Doc<"organizationBillingStates">["state"];
    cancelAtPeriodEnd: boolean;
    periodEndsAt?: number;
    restrictAtPeriodEnd?: true;
  },
) {
  const currentPlan =
    args.billingState.kind === "active" && args.billingState.plan !== "free"
      ? args.billingState.plan
      : args.billingState.kind === "scheduledChange" && args.billingState.targetPlan === "free"
        ? args.billingState.currentPlan
        : null;
  if (!currentPlan) throw new Error("billing_version_conflict");

  if (args.cancelAtPeriodEnd) {
    if (args.periodEndsAt === undefined) throw new Error("subscription_schedule_not_confirmed");
    if (
      args.billingState.kind === "scheduledChange" &&
      args.billingState.currentPlan === currentPlan &&
      args.billingState.targetPlan === "free" &&
      args.billingState.effectiveAt === args.periodEndsAt &&
      (args.billingState.restrictAtPeriodEnd === true) === (args.restrictAtPeriodEnd === true)
    ) {
      return;
    }
    if (!(args.billingState.kind === "active" && args.billingState.plan === currentPlan)) {
      throw new Error("billing_version_conflict");
    }
    const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: args.organizationId,
      expectedVersion: args.expectedBillingVersion,
      state: {
        kind: "scheduledChange",
        currentPlan,
        targetPlan: "free",
        effectiveAt: args.periodEndsAt,
        ...(args.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
      },
      correlationId: `stripe:${args.operationId}:scheduleFree-recovered`,
    });
    if (
      !(await billingMutationConverged(
        ctx,
        args.organizationId,
        changed.changed,
        (state) =>
          state.kind === "scheduledChange" &&
          state.currentPlan === currentPlan &&
          state.targetPlan === "free" &&
          state.effectiveAt === args.periodEndsAt &&
          (state.restrictAtPeriodEnd === true) === (args.restrictAtPeriodEnd === true),
      ))
    ) {
      throw new Error("billing_version_conflict");
    }
    return;
  }

  if (args.billingState.kind === "active" && args.billingState.plan === currentPlan) return;
  if (
    args.billingState.kind !== "scheduledChange" ||
    args.billingState.currentPlan !== currentPlan ||
    args.billingState.targetPlan !== "free"
  ) {
    throw new Error("billing_version_conflict");
  }
  const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
    organizationId: args.organizationId,
    expectedVersion: args.expectedBillingVersion,
    state: { kind: "scheduledChangeCanceled" },
    correlationId: `stripe:${args.operationId}:cancelFreeSchedule-recovered`,
  });
  if (
    !(await billingMutationConverged(
      ctx,
      args.organizationId,
      changed.changed,
      (state) => state.kind === "active" && state.plan === currentPlan,
    ))
  ) {
    throw new Error("billing_version_conflict");
  }
}

async function retryExpiredGraceSafetyOperation(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    expectedBillingVersion: number;
    requestId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  errorCode: string,
  action: "expiredGrace" | "initialPayment",
) {
  await ctx.runMutation(internal.organizationStripe.mutations.retryExpiredGraceSafetyOperation, {
    operationId,
    leaseToken,
    organizationId: args.organizationId,
    expectedBillingVersion: args.expectedBillingVersion,
    requestId: args.requestId,
    errorCode,
    action,
  });
}

async function getAuthorizedContext(
  ctx: ActionCtx,
  scope: BillingActionScope,
  purpose: ActionPurpose,
): Promise<AuthorizedActionContext | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Unauthenticated");
  return "organizationId" in scope
    ? await ctx.runQuery(internal.organizationStripe.queries.getActionContextForOrganization, {
        tokenIdentifier: identity.tokenIdentifier,
        organizationId: scope.organizationId,
        purpose,
      })
    : await ctx.runQuery(internal.organizationStripe.queries.getActionContext, {
        tokenIdentifier: identity.tokenIdentifier,
        shopId: scope.shopId,
        purpose,
      });
}

async function ensureStripeCustomer(
  stripe: Stripe,
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    organizationName: string;
    billingEmail: string;
    existingCustomerId?: string;
    livemode: boolean;
    idempotencyKey: string;
  },
) {
  if (args.existingCustomerId) {
    await verifyMappedCustomer(stripe, args.existingCustomerId, args.organizationId, args.livemode);
    return args.existingCustomerId;
  }
  const customer = await stripe.customers.create(
    {
      name: args.organizationName,
      email: args.billingEmail,
      metadata: { shiftori_organization_id: String(args.organizationId) },
    },
    { idempotencyKey: args.idempotencyKey },
  );
  if (customer.livemode !== args.livemode) throw new Error("customer_livemode_mismatch");
  await ctx.runMutation(internal.organizationStripe.mutations.saveCustomerMapping, {
    organizationId: args.organizationId,
    stripeCustomerId: customer.id,
    livemode: args.livemode,
  });
  return customer.id;
}

async function verifyMappedCustomer(
  stripe: Stripe,
  customerId: string,
  organizationId: Id<"organizations">,
  livemode: boolean,
) {
  const customer = await stripe.customers.retrieve(customerId);
  if (
    customer.deleted ||
    customer.livemode !== livemode ||
    customer.metadata.shiftori_organization_id !== String(organizationId)
  ) {
    throw new Error("customer_mapping_invalid");
  }
}

function assertCheckoutSession(
  session: Stripe.Checkout.Session,
  expected: {
    organizationId: Id<"organizations">;
    operationId: Id<"organizationStripeOperations">;
    stripeSessionId: string;
    providerGeneration: number;
    livemode: boolean;
    customerId?: string;
    priceId: string;
    mode?: "setup" | "subscription";
  },
) {
  if (
    session.id !== expected.stripeSessionId ||
    session.livemode !== expected.livemode ||
    session.client_reference_id !== String(expected.organizationId) ||
    session.metadata?.shiftori_organization_id !== String(expected.organizationId) ||
    session.metadata?.shiftori_operation_id !== String(expected.operationId) ||
    session.metadata?.shiftori_provider_generation !== String(expected.providerGeneration) ||
    session.metadata?.shiftori_price_id !== expected.priceId ||
    (expected.mode !== undefined && session.mode !== expected.mode) ||
    (expected.customerId !== undefined && stripeObjectId(session.customer) !== expected.customerId)
  ) {
    throw new Error("checkout_session_relationship_invalid");
  }
}

async function expireOpenCheckoutSession(stripe: Stripe, session: Stripe.Checkout.Session) {
  try {
    return await stripe.checkout.sessions.expire(session.id);
  } catch (error) {
    // 完了との競合ではexpireが拒否されるため、providerの現在値を再取得して成功扱いを誤らせない。
    const latest = await stripe.checkout.sessions.retrieve(session.id);
    if (latest.status === "complete" || latest.status === "expired") return latest;
    throw error;
  }
}

async function convergeExpiredPendingCheckout(
  ctx: ActionCtx,
  args: {
    organizationId: Id<"organizations">;
    billingVersion: number;
    fallback: "free" | "pro" | "restricted";
    operationId: Id<"organizationStripeOperations">;
    stripeSessionId: string;
    livemode: boolean;
    correlationSuffix: "checkout-cancelled" | "checkout-expired";
    releaseReason: "checkout_session_cancelled" | "checkout_session_expired";
  },
): Promise<{ status: "cancelled" } | { status: "pending" }> {
  const changed = await ctx.runMutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
    organizationId: args.organizationId,
    expectedVersion: args.billingVersion,
    state: { kind: "paymentFailed" },
    correlationId: `stripe:${args.operationId}:${args.correlationSuffix}`,
  });
  const converged = await billingMutationConverged(ctx, args.organizationId, changed.changed, (state) =>
    args.fallback === "pro"
      ? state.kind === "active" && state.plan === "pro"
      : args.fallback === "free"
        ? (state.kind === "active" && state.plan === "free") || state.kind === "restricted"
        : state.kind === "restricted",
  );
  if (!converged) return { status: "pending" };

  const released = await ctx.runMutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
    operationId: args.operationId,
    stripeSessionId: args.stripeSessionId,
    reason: args.releaseReason,
  });
  if (!released.changed) {
    const latestOperation = await ctx.runQuery(internal.organizationStripe.queries.getCheckoutOperationBySession, {
      organizationId: args.organizationId,
      stripeSessionId: args.stripeSessionId,
      livemode: args.livemode,
    });
    if (latestOperation?.status !== "cancelled") return { status: "pending" };
  }
  return { status: "cancelled" };
}

async function retrieveAllowedPrice(stripe: Stripe, priceId: string, livemode: boolean) {
  const result = await retrieveConfiguredPrice(stripe, priceId, livemode);
  return result.status === "available" ? result.price : null;
}

function getDisplayedPaidPlanForCurrentSubscriptionPrice(
  state: Doc<"organizationBillingStates">["state"],
): StripePaidPlan | null {
  switch (state.kind) {
    case "active":
      return state.plan === "pro" || state.plan === "business" ? state.plan : null;
    case "scheduledChange":
      return state.currentPlan;
    case "grace":
      return state.plan;
    case "restricted": {
      if (
        state.reason !== "paymentGraceExpired" &&
        state.reason !== "paymentActivationFailed" &&
        state.reason !== "unexpectedCancellation"
      ) {
        return null;
      }
      const displayPlan = deriveOrganizationBillingPolicy(state).displayPlan;
      return displayPlan === "pro" || displayPlan === "business" ? displayPlan : null;
    }
    case "trial":
    case "initialPaymentPending":
    case "pendingActivation":
    case "complimentary":
      return null;
  }
}

/**
 * 既存契約または開始済みoperationが参照するPriceは、販売終了後も照合に必要なためactiveを要求しない。
 * Price IDは認可済みのsubscriptionまたはoperation snapshotからのみ受け取る。
 */
async function retrieveExistingRecurringPrice(stripe: Stripe, priceId: string, livemode: boolean) {
  const price = await stripe.prices.retrieve(priceId);
  const cadence = getStripeBillingCadence(price);
  if (price.id !== priceId || price.livemode !== livemode || !cadence || price.unit_amount === null) {
    return null;
  }
  const taxBehavior =
    price.tax_behavior === "inclusive" || price.tax_behavior === "exclusive" ? price.tax_behavior : undefined;
  return {
    currency: price.currency,
    unitAmount: price.unit_amount,
    ...cadence,
    ...(taxBehavior ? { taxBehavior } : {}),
  };
}

async function retrieveConfiguredPrice(stripe: Stripe, priceId: string, livemode: boolean) {
  const price = await stripe.prices.retrieve(priceId);
  const cadence = getStripeBillingCadence(price);
  if (
    price.id !== priceId ||
    price.livemode !== livemode ||
    !cadence ||
    price.unit_amount === null ||
    (price.tax_behavior !== "inclusive" && price.tax_behavior !== "exclusive")
  ) {
    return { status: "invalid" as const };
  }
  if (!price.active) return { status: "inactive" as const };
  return {
    status: "available" as const,
    price: {
      currency: price.currency,
      unitAmount: price.unit_amount,
      ...cadence,
      taxBehavior: price.tax_behavior,
    },
  };
}

function getStripeBillingCadence(price: Stripe.Price): StripeBillingCadence | null {
  const recurring = price.recurring;
  if (
    !recurring ||
    !isStripeBillingInterval(recurring.interval) ||
    !Number.isSafeInteger(recurring.interval_count) ||
    recurring.interval_count < 1
  ) {
    return null;
  }
  return { interval: recurring.interval, intervalCount: recurring.interval_count };
}

function isStripeBillingInterval(value: unknown): value is StripeBillingCadence["interval"] {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function hasSameBillingCadence(left: StripeBillingCadence, right: StripeBillingCadence) {
  return left.interval === right.interval && left.intervalCount === right.intervalCount;
}

function subscriptionScheduleDuration(cadence: StripeBillingCadence) {
  return { interval: cadence.interval, interval_count: cadence.intervalCount };
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
}

function billingSettingsUrl(organizationId: Id<"organizations">) {
  const url = new URL("/manage/billing", getAppUrl());
  url.searchParams.set("org", organizationId);
  return url.toString();
}

function withStripeResult(settingsUrl: string, result: "returned" | "cancelled") {
  const url = new URL(settingsUrl);
  url.searchParams.set("stripe", result);
  return url.toString();
}

function stripeMetadata(args: {
  organizationId: Id<"organizations">;
  operationId: Id<"organizationStripeOperations">;
  providerGeneration: number;
  priceId?: string;
}) {
  return {
    shiftori_organization_id: String(args.organizationId),
    shiftori_operation_id: String(args.operationId),
    shiftori_provider_generation: String(args.providerGeneration),
    ...(args.priceId ? { shiftori_price_id: args.priceId } : {}),
  };
}

function trialSubscriptionCreateParams(args: {
  organizationId: Id<"organizations">;
  operationId: Id<"organizationStripeOperations">;
  providerGeneration: number;
  priceId: string;
  snapshot: {
    stripeCustomerId: string;
    stripePaymentMethodId: string;
    trialEndsAt?: number;
  };
}): Stripe.SubscriptionCreateParams {
  return {
    customer: args.snapshot.stripeCustomerId,
    items: [{ price: args.priceId }],
    default_payment_method: args.snapshot.stripePaymentMethodId,
    ...(args.snapshot.trialEndsAt !== undefined ? { trial_end: Math.floor(args.snapshot.trialEndsAt / 1000) } : {}),
    expand: ["latest_invoice"],
    payment_settings: {
      payment_method_types: ["card"],
      save_default_payment_method: "on_subscription",
    },
    metadata: stripeMetadata({
      organizationId: args.organizationId,
      operationId: args.operationId,
      providerGeneration: args.providerGeneration,
      priceId: args.priceId,
    }),
  };
}

function stripeObjectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

function subscriptionScheduleSubscriptionId(schedule: Stripe.SubscriptionSchedule) {
  return stripeObjectId(schedule.subscription) ?? stripeObjectId(schedule.released_subscription);
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const parent = asRecord((invoice as unknown as Record<string, unknown>).parent);
  const subscriptionDetails = asRecord(parent?.subscription_details);
  return stripeObjectId(subscriptionDetails?.subscription);
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const periodEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => Number.isSafeInteger(value));
  if (periodEnds.length === 0) return undefined;
  return Math.max(...periodEnds) * 1000;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unavailable(reason: UnavailableReason): UnavailableResult {
  return { status: "unavailable" as const, reason };
}

async function finishOperation(
  ctx: ActionCtx,
  operationId: Id<"organizationStripeOperations">,
  leaseToken: string,
  status: "succeeded" | "failed" | "retrying" | "actionRequired" | "cancelled",
  stripeObjectIdValue?: string,
  errorCode?: string,
) {
  await ctx.runMutation(internal.organizationStripe.mutations.finishOperation, {
    operationId,
    leaseToken,
    status,
    ...(stripeObjectIdValue ? { stripeObjectId: stripeObjectIdValue } : {}),
    ...(errorCode ? { errorCode } : {}),
  });
}

function requireOperationLease(operation: { leaseToken?: string }) {
  if (!operation.leaseToken) throw new Error("operation_lease_missing");
  return operation.leaseToken;
}

async function finishWebhook(
  ctx: ActionCtx,
  claim: { stripeEventId: string; leaseToken: string },
  result:
    | { kind: "processed"; organizationId?: Id<"organizations">; providerGeneration?: number }
    | { kind: "ignored"; errorCode?: string }
    | { kind: "retry" | "failed" | "actionRequired"; errorCode: string },
) {
  await ctx.runMutation(internal.organizationStripe.mutations.finishWebhookEvent, {
    stripeEventId: claim.stripeEventId,
    leaseToken: claim.leaseToken,
    result,
  });
}

function processedResult(synchronized: {
  organization: { organizationId: Id<"organizations"> };
  providerGeneration: number;
}) {
  return {
    kind: "processed" as const,
    organizationId: synchronized.organization.organizationId,
    providerGeneration: synchronized.providerGeneration,
  };
}

async function billingMutationConverged(
  ctx: ActionCtx,
  organizationId: Id<"organizations">,
  changed: boolean,
  isTargetState: (state: Doc<"organizationBillingStates">["state"]) => boolean,
) {
  if (changed) return true;
  const latest = await ctx.runQuery(internal.organizationStripe.queries.getBillingStateForConvergence, {
    organizationId,
  });
  return latest !== null && isTargetState(latest.state);
}

function isSafeAfterSubscriptionCancellation(state: Doc<"organizationBillingStates">["state"]) {
  return (
    state.kind === "restricted" ||
    (state.kind === "active" && state.plan === "free") ||
    (state.kind === "trial" && state.selectedPaidPlan === undefined)
  );
}

function isGraceOrRestricted(state: Doc<"organizationBillingStates">["state"]) {
  return state.kind === "grace" || state.kind === "restricted";
}

function safeStripeErrorCode(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    if (
      error.statusCode !== undefined &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 409 &&
      error.statusCode !== 429
    ) {
      return "stripe_request_rejected";
    }
    if (
      ["StripeConnectionError", "StripeRateLimitError", "StripeAPIError"].includes(error.type) ||
      error.statusCode === 409 ||
      error.statusCode === 429 ||
      (error.statusCode ?? 0) >= 500
    ) {
      return "stripe_temporary_error";
    }
    return "stripe_request_rejected";
  }
  return "stripe_processing_error";
}
