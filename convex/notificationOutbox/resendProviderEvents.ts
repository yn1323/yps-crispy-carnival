export const RESEND_PROVIDER_ISSUE_EVENT_TYPES = [
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.suppressed",
] as const;

export type ResendProviderIssueEventType = (typeof RESEND_PROVIDER_ISSUE_EVENT_TYPES)[number];

export const RESEND_PROVIDER_DELIVERY_STATUSES = ["delivery_delayed", "failed", "bounced", "suppressed"] as const;

export type ResendProviderDeliveryStatus = (typeof RESEND_PROVIDER_DELIVERY_STATUSES)[number];

export const RESEND_PROVIDER_DELIVERY_STATUS_BY_EVENT = {
  "email.delivery_delayed": "delivery_delayed",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.suppressed": "suppressed",
} satisfies Record<ResendProviderIssueEventType, ResendProviderDeliveryStatus>;

export function isResendProviderIssueEventType(value: string): value is ResendProviderIssueEventType {
  return RESEND_PROVIDER_ISSUE_EVENT_TYPES.includes(value as ResendProviderIssueEventType);
}

export function resendProviderDeliveryStatus(eventType: ResendProviderIssueEventType): ResendProviderDeliveryStatus {
  return RESEND_PROVIDER_DELIVERY_STATUS_BY_EVENT[eventType];
}

export function resendProviderIssueErrorMessage(eventType: ResendProviderIssueEventType): string {
  switch (eventType) {
    case "email.delivery_delayed":
      return "Resend reported email delivery delayed";
    case "email.failed":
      return "Resend reported email failed";
    case "email.bounced":
      return "Resend reported email bounced";
    case "email.suppressed":
      return "Resend reported email suppressed";
  }
}
