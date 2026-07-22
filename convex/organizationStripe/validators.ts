import { v } from "convex/values";

export const trialSubscriptionCreateSnapshotValidator = v.object({
  stripeCustomerId: v.string(),
  stripePaymentMethodId: v.string(),
  trialEndsAt: v.optional(v.number()),
});

export const organizationStripeSubscriptionStatusValidator = v.union(
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("unpaid"),
  v.literal("paused"),
);

export const organizationStripeOperationKindValidator = v.union(
  v.literal("createCustomer"),
  v.literal("trialSetupCheckout"),
  v.literal("createTrialSubscription"),
  v.literal("immediateProCheckout"),
  v.literal("immediatePaidCheckout"),
  v.literal("previewPaidPlanChange"),
  v.literal("changePaidPlanNow"),
  v.literal("schedulePaidPlanChange"),
  v.literal("cancelScheduledPlanChange"),
  v.literal("scheduleFree"),
  v.literal("cancelFreeSchedule"),
  v.literal("cancelSubscription"),
  v.literal("stopInvoiceCollection"),
  v.literal("syncBillingEmail"),
  v.literal("portalSession"),
  v.literal("reconcileSubscription"),
);

export const organizationStripeOperationStatusValidator = v.union(
  v.literal("queued"),
  v.literal("processing"),
  v.literal("retrying"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("actionRequired"),
  v.literal("cancelled"),
);

export const stripeWebhookEventTypeValidator = v.union(
  v.literal("checkout.session.completed"),
  v.literal("checkout.session.expired"),
  v.literal("customer.subscription.created"),
  v.literal("customer.subscription.updated"),
  v.literal("customer.subscription.deleted"),
  v.literal("customer.subscription.pending_update_applied"),
  v.literal("customer.subscription.pending_update_expired"),
  v.literal("subscription_schedule.updated"),
  v.literal("subscription_schedule.released"),
  v.literal("subscription_schedule.canceled"),
  v.literal("invoice.paid"),
  v.literal("invoice.payment_failed"),
  v.literal("invoice.payment_action_required"),
);

export const stripeWebhookEventStatusValidator = v.union(
  v.literal("received"),
  v.literal("processing"),
  v.literal("retrying"),
  v.literal("processed"),
  v.literal("ignored"),
  v.literal("failed"),
  v.literal("actionRequired"),
);

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "checkout.session.expired"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "customer.subscription.pending_update_applied"
  | "customer.subscription.pending_update_expired"
  | "subscription_schedule.updated"
  | "subscription_schedule.released"
  | "subscription_schedule.canceled"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "invoice.payment_action_required";

const supportedStripeWebhookEventTypes: ReadonlySet<string> = new Set<StripeWebhookEventType>([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "subscription_schedule.updated",
  "subscription_schedule.released",
  "subscription_schedule.canceled",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);

export function isSupportedStripeWebhookEventType(value: string): value is StripeWebhookEventType {
  return supportedStripeWebhookEventTypes.has(value);
}
