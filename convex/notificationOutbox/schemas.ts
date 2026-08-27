import { v } from "convex/values";
import {
  RESEND_PROVIDER_DELIVERY_STATUSES,
  RESEND_PROVIDER_EVENT_TYPES,
  RESEND_PROVIDER_ISSUE_EVENT_TYPES,
} from "./resendProviderEvents";

export const notificationChannelValidator = v.union(v.literal("email"), v.literal("line"));

export const NOTIFICATION_OUTBOX_ACTIVE_STATUSES = ["pending", "processing"] as const;
export const NOTIFICATION_OUTBOX_TERMINAL_STATUSES = ["sent", "failed", "cancelled"] as const;
export const NOTIFICATION_OUTBOX_STATUSES = [
  ...NOTIFICATION_OUTBOX_ACTIVE_STATUSES,
  ...NOTIFICATION_OUTBOX_TERMINAL_STATUSES,
] as const;

export const notificationOutboxStatusValidator = v.union(
  ...NOTIFICATION_OUTBOX_STATUSES.map((status) => v.literal(status)),
);

export const notificationPurposeValidator = v.union(v.literal("business"), v.literal("billing"));

// 永続化する理由は監査・運用に必要な安全な分類だけに限定し、宛先やtokenを含めない。
export const notificationCancelReasonValidator = v.union(
  v.literal("organization_billing_changed"),
  v.literal("organization_usage_limit_exceeded"),
  v.literal("organization_inactive"),
  v.literal("shop_inactive"),
  v.literal("recruitment_inactive"),
  v.literal("notification_superseded"),
  v.literal("recipient_inactive"),
  v.literal("invitation_inactive"),
  v.literal("unsupported_channel"),
  v.literal("invalid_scope"),
);

export const notificationDeliveryEventTypeValidator = v.union(
  v.literal("enqueue_failed"),
  v.literal("enqueue_preparation_failed"),
  v.literal("retry_scheduled"),
  v.literal("final_failed"),
  v.literal("fallback_enqueued"),
  v.literal("worker_failed"),
  v.literal("provider_delivery_issue"),
  v.literal("provider_delivery_update"),
);

// errorMessageを必須にする既存event専用。成功系provider eventは別mutationから記録する。
export const notificationDeliveryErrorEventTypeValidator = v.union(
  v.literal("enqueue_failed"),
  v.literal("enqueue_preparation_failed"),
  v.literal("retry_scheduled"),
  v.literal("final_failed"),
  v.literal("fallback_enqueued"),
  v.literal("worker_failed"),
  v.literal("provider_delivery_issue"),
);

export const resendProviderEventTypeValidator = v.union(
  v.literal(RESEND_PROVIDER_EVENT_TYPES[0]),
  v.literal(RESEND_PROVIDER_EVENT_TYPES[1]),
  v.literal(RESEND_PROVIDER_EVENT_TYPES[2]),
  v.literal(RESEND_PROVIDER_EVENT_TYPES[3]),
  v.literal(RESEND_PROVIDER_EVENT_TYPES[4]),
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

export const notificationHistoryInputValidator = v.object({
  notificationKind: v.string(),
  displayTitle: v.string(),
});

export const notificationHistorySendStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const notificationHistoryDeliveryStatusValidator = v.union(
  v.literal("not_supported"),
  v.literal("unknown"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("failed"),
  v.literal("bounced"),
  v.literal("suppressed"),
);

export const notificationHistoryDisplayStatusValidator = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("delivered"),
  v.literal("delayed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const notificationRenderedEmailPayloadValidator = v.object({
  kind: v.literal("email"),
  from: v.string(),
  to: v.string(),
  subject: v.string(),
  html: v.string(),
  context: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
});

export const notificationOrganizationManagerInvitationEmailPayloadValidator = v.object({
  kind: v.literal("organizationManagerInvitationEmail"),
  from: v.string(),
  to: v.string(),
  context: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
});

export const notificationEmailPayloadValidator = v.union(
  notificationRenderedEmailPayloadValidator,
  notificationOrganizationManagerInvitationEmailPayloadValidator,
);

export const notificationLineMessageValidator = v.union(
  v.object({
    type: v.literal("text"),
    text: v.string(),
  }),
  v.object({
    type: v.literal("flex"),
    altText: v.string(),
    contents: v.any(),
  }),
);

export const notificationLinePayloadValidator = v.object({
  kind: v.literal("line"),
  toUserId: v.string(),
  text: v.string(),
  message: v.optional(notificationLineMessageValidator),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
  fallbackEmail: v.optional(
    v.object({
      dedupeKey: v.string(),
      payload: notificationEmailPayloadValidator,
      history: v.optional(notificationHistoryInputValidator),
    }),
  ),
});

export const notificationOrganizationManagerInvitationLinePayloadValidator = v.object({
  kind: v.literal("organizationManagerInvitationLine"),
  toUserId: v.string(),
  context: v.string(),
  suppressDelivery: v.optional(v.boolean()),
  suppressFailureInbox: v.optional(v.boolean()),
  fallbackEmail: v.object({
    dedupeKey: v.string(),
    payload: notificationOrganizationManagerInvitationEmailPayloadValidator,
    history: v.optional(notificationHistoryInputValidator),
  }),
});

export const notificationPayloadValidator = v.union(
  notificationRenderedEmailPayloadValidator,
  notificationOrganizationManagerInvitationEmailPayloadValidator,
  notificationLinePayloadValidator,
  notificationOrganizationManagerInvitationLinePayloadValidator,
);
