import { v } from "convex/values";
import { RESEND_PROVIDER_DELIVERY_STATUSES, RESEND_PROVIDER_ISSUE_EVENT_TYPES } from "./resendProviderEvents";

export const notificationChannelValidator = v.union(v.literal("email"), v.literal("line"));

export const notificationOutboxStatusValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("sent"),
  v.literal("failed"),
);

export const notificationDeliveryEventTypeValidator = v.union(
  v.literal("enqueue_failed"),
  v.literal("enqueue_preparation_failed"),
  v.literal("retry_scheduled"),
  v.literal("final_failed"),
  v.literal("fallback_enqueued"),
  v.literal("worker_failed"),
  v.literal("provider_delivery_issue"),
);

export const resendProviderIssueEventTypeValidator = v.union(
  v.literal(RESEND_PROVIDER_ISSUE_EVENT_TYPES[0]),
  v.literal(RESEND_PROVIDER_ISSUE_EVENT_TYPES[1]),
  v.literal(RESEND_PROVIDER_ISSUE_EVENT_TYPES[2]),
  v.literal(RESEND_PROVIDER_ISSUE_EVENT_TYPES[3]),
);

export const resendProviderDeliveryStatusValidator = v.union(
  v.literal(RESEND_PROVIDER_DELIVERY_STATUSES[0]),
  v.literal(RESEND_PROVIDER_DELIVERY_STATUSES[1]),
  v.literal(RESEND_PROVIDER_DELIVERY_STATUSES[2]),
  v.literal(RESEND_PROVIDER_DELIVERY_STATUSES[3]),
);

export const notificationFailureInboxSourceTypeValidator = v.union(
  v.literal("outbox"),
  v.literal("enqueue"),
  v.literal("enqueue_preparation"),
  v.literal("provider"),
);

export const notificationFailureInboxStatusValidator = v.union(
  v.literal("open"),
  v.literal("retrying"),
  v.literal("resolved"),
);

export const notificationFailureResolutionKindValidator = v.union(
  v.literal("sent"),
  v.literal("dismissed"),
  v.literal("superseded"),
  v.literal("expired"),
);

export const notificationEmailPayloadValidator = v.object({
  kind: v.literal("email"),
  from: v.string(),
  to: v.string(),
  subject: v.string(),
  html: v.string(),
  context: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
});

export const notificationLinePayloadValidator = v.object({
  kind: v.literal("line"),
  toUserId: v.string(),
  text: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
  fallbackEmail: v.optional(
    v.object({
      dedupeKey: v.string(),
      payload: notificationEmailPayloadValidator,
    }),
  ),
});

export const notificationPayloadValidator = v.union(
  notificationEmailPayloadValidator,
  notificationLinePayloadValidator,
);
