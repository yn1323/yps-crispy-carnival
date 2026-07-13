import { convexRunJson } from "./convex";

export type NotificationProbeJob = {
  channel: "email" | "line";
  status: "pending" | "processing" | "sent" | "failed";
  notificationContext: string;
  attemptCount: number;
  deliverySuppressed: boolean;
  hasRecruitmentTarget: boolean;
  hasStaffTarget: boolean;
  hasUserTarget: boolean;
  isResend: boolean;
  hasRecognizedCta: boolean;
  ctaTokenMatchesTarget: boolean | null;
};

export type NotificationProbeFailure = {
  channel: "email" | "line" | null;
  status: "open" | "retrying" | "resolved";
  sourceType: "outbox" | "enqueue" | "enqueue_preparation" | "provider";
  notificationContext: string;
};

export type NotificationProbeResult = {
  outbox: NotificationProbeJob[];
  failureInbox: NotificationProbeFailure[];
  duplicateDedupeKeyCount: number;
};

type NotificationProbeArgs = {
  shopId: string;
  recruitmentId?: string;
  staffEmail?: string;
  notificationContext?: string;
  channel?: "email" | "line";
};

type NotificationShopSafetyState = {
  notificationDeliverySuppressed: boolean;
};

const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getNotificationProbe(args: NotificationProbeArgs): NotificationProbeResult {
  return convexRunJson<NotificationProbeResult>("testing:getNotificationProbe", args);
}

export function assertNotificationDeliverySuppressed(shopId: string) {
  const state = convexRunJson<NotificationShopSafetyState>("testing:getE2EShopSafetyState", { shopId });
  if (!state.notificationDeliverySuppressed) {
    throw new Error("Notification delivery is not suppressed for the E2E shop");
  }
}

export function assertNotificationRecipientSuppressed(email: string) {
  const state = convexRunJson<NotificationShopSafetyState>("testing:getE2ERecipientSafetyState", { email });
  if (!state.notificationDeliverySuppressed) {
    throw new Error("Notification delivery is not suppressed for the E2E recipient");
  }
}

export async function waitForNotificationOutbox(args: NotificationProbeArgs): Promise<NotificationProbeResult> {
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const result = getNotificationProbe(args);
    if (result.duplicateDedupeKeyCount > 0) {
      throw new Error(`Duplicate notification dedupe keys detected for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.some((job) => job.status === "failed")) {
      throw new Error(`Notification outbox reached final failure for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.some((job) => !job.hasRecognizedCta || job.ctaTokenMatchesTarget === false)) {
      throw new Error(`Notification CTA integrity failed for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.length > 0) return result;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Notification outbox was not accepted for context: ${args.notificationContext ?? "any"}`);
}

export async function assertNoNotificationOutbox(args: NotificationProbeArgs): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const result = getNotificationProbe(args);
    if (result.outbox.length > 0) {
      throw new Error(`Unexpected notification channel was enqueued for: ${args.notificationContext ?? "any"}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}
