import { createHash } from "node:crypto";
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
  recipientUserFingerprint: string | null;
  isResend: boolean;
  hasRecognizedCta: boolean;
  ctaTokenMatchesTarget: boolean | null;
  ctaShopMatchesTarget: boolean | null;
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

export type NotificationProbeArgs = {
  shopId: string;
  recruitmentId?: string;
  staffEmail?: string;
  notificationContext?: string;
  channel?: "email" | "line";
};

type NotificationWaitOptions = {
  expectedOutboxCount?: number;
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

/** 通知probeの宛先をPIIなしで完全一致させるための識別子。 */
export function fingerprintNotificationRecipient(userId: string): string {
  return `sha256:${createHash("sha256").update(userId).digest("hex")}`;
}

export async function waitForNotificationOutbox(
  args: NotificationProbeArgs,
  options: NotificationWaitOptions = {},
): Promise<NotificationProbeResult> {
  const expectedOutboxCount = options.expectedOutboxCount ?? 1;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const result = getNotificationProbe(args);
    if (result.duplicateDedupeKeyCount > 0) {
      throw new Error(`Duplicate notification dedupe keys detected for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.some((job) => job.status === "failed")) {
      throw new Error(`Notification outbox reached final failure for: ${args.notificationContext ?? "any"}`);
    }
    if (
      result.outbox.some(
        (job) => !job.hasRecognizedCta || job.ctaTokenMatchesTarget === false || job.ctaShopMatchesTarget === false,
      )
    ) {
      throw new Error(`Notification CTA integrity failed for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.length > expectedOutboxCount) {
      throw new Error(
        `Notification outbox exceeded expected count for ${args.notificationContext ?? "any"}: ${result.outbox.length}/${expectedOutboxCount}`,
      );
    }
    if (result.outbox.length === expectedOutboxCount) return result;
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

export type OrganizationNotificationProbeJob = {
  organizationId: string;
  organizationInvitationId: string | null;
  purpose: "business" | "billing" | null;
  channel: "email" | "line";
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  notificationContext: string;
  /** PIIを返さず同一性だけを比較するsha256 fingerprint。 */
  dedupeKey: string;
  attemptCount: number;
  deliverySuppressed: boolean;
  recipientUserFingerprint: string | null;
  invitationVersionMatchesTarget: boolean | null;
  hasRecognizedCta: boolean;
  ctaTokenMatchesTarget: boolean | null;
  ctaShopMatchesTarget: boolean | null;
};

export type OrganizationNotificationProbeResult = {
  outbox: OrganizationNotificationProbeJob[];
  duplicateDedupeKeyCount: number;
};

export type OrganizationNotificationProbeArgs = {
  organizationId: string;
  organizationInvitationId?: string;
  expectedShopId?: string;
  notificationContext?: string;
  channel?: "email" | "line";
};

export function getOrganizationNotificationProbe(
  args: OrganizationNotificationProbeArgs,
): OrganizationNotificationProbeResult {
  return convexRunJson<OrganizationNotificationProbeResult>("testing:getOrganizationNotificationProbe", args);
}

export async function waitForOrganizationNotificationOutbox(
  args: OrganizationNotificationProbeArgs,
  options: NotificationWaitOptions = {},
): Promise<OrganizationNotificationProbeResult> {
  const expectedOutboxCount = options.expectedOutboxCount ?? 1;
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const result = getOrganizationNotificationProbe(args);
    if (result.duplicateDedupeKeyCount > 0) {
      throw new Error(
        `Duplicate organization notification dedupe keys detected for: ${args.notificationContext ?? "any"}`,
      );
    }
    if (result.outbox.some((job) => job.status === "failed" || job.status === "cancelled")) {
      throw new Error(`Organization notification outbox did not complete for: ${args.notificationContext ?? "any"}`);
    }
    if (
      result.outbox.some(
        (job) =>
          !job.hasRecognizedCta ||
          job.ctaTokenMatchesTarget === false ||
          job.ctaShopMatchesTarget === false ||
          job.invitationVersionMatchesTarget === false,
      )
    ) {
      throw new Error(`Organization notification CTA integrity failed for: ${args.notificationContext ?? "any"}`);
    }
    if (result.outbox.length > expectedOutboxCount) {
      throw new Error(
        `Organization notification outbox exceeded expected count for ${args.notificationContext ?? "any"}: ${result.outbox.length}/${expectedOutboxCount}`,
      );
    }
    if (result.outbox.length === expectedOutboxCount) return result;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Organization notification outbox was not accepted for: ${args.notificationContext ?? "any"}`);
}
