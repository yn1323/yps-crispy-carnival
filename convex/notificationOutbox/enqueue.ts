import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { safeNotificationError } from "./safeError";
import type {
  EnqueueNotificationInput,
  NotificationEmailPayload,
  NotificationLinePayload,
  NotificationOrganizationManagerInvitationEmailPayload,
  NotificationOrganizationManagerInvitationLinePayload,
  NotificationRenderedEmailPayload,
  NotificationRenderedLinePayload,
} from "./types";
import { notificationChannelForPayload } from "./types";

type EnqueueCtx = Pick<ActionCtx, "runMutation">;
type EnqueueResult = { outboxId: Id<"notificationOutbox">; deduped: boolean } | null;

export function emailPayload(input: Omit<NotificationRenderedEmailPayload, "kind">): NotificationRenderedEmailPayload {
  return { kind: "email", ...input };
}

export function organizationManagerInvitationEmailPayload(
  input: Omit<NotificationOrganizationManagerInvitationEmailPayload, "kind">,
): NotificationOrganizationManagerInvitationEmailPayload {
  return { kind: "organizationManagerInvitationEmail", ...input };
}

export function linePayload(input: Omit<NotificationRenderedLinePayload, "kind">): NotificationRenderedLinePayload {
  return { kind: "line", ...input };
}

export function organizationManagerInvitationLinePayload(
  input: Omit<NotificationOrganizationManagerInvitationLinePayload, "kind">,
): NotificationOrganizationManagerInvitationLinePayload {
  return { kind: "organizationManagerInvitationLine", ...input };
}

export async function enqueueEmail(
  ctx: EnqueueCtx,
  input: EnqueueNotificationInput<NotificationEmailPayload>,
): Promise<EnqueueResult> {
  return await enqueueNotification(ctx, input);
}

export async function enqueueLine(
  ctx: EnqueueCtx,
  input:
    | (EnqueueNotificationInput<Extract<NotificationLinePayload, { kind: "line" }>> & {
        purpose: "business";
        organizationInvitationId?: never;
        organizationInvitationVersion?: never;
      })
    | (EnqueueNotificationInput<NotificationOrganizationManagerInvitationLinePayload> & {
        purpose: "business";
        organizationInvitationId: Id<"organizationInvitations">;
        organizationInvitationVersion: number;
      }),
): Promise<EnqueueResult> {
  return await enqueueNotification(ctx, input);
}

async function enqueueNotification(ctx: EnqueueCtx, input: EnqueueNotificationInput): Promise<EnqueueResult> {
  try {
    return await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
      channel: notificationChannelForPayload(input.payload),
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.organizationBillingVersionAtOrigin !== undefined
        ? { organizationBillingVersionAtOrigin: input.organizationBillingVersionAtOrigin }
        : {}),
      ...(input.organizationInvitationId ? { organizationInvitationId: input.organizationInvitationId } : {}),
      ...(input.organizationInvitationVersion !== undefined
        ? { organizationInvitationVersion: input.organizationInvitationVersion }
        : {}),
      purpose: input.purpose,
      ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.history ? { history: input.history } : {}),
      ...(input.historyMode ? { historyMode: input.historyMode } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      ...(input.dedupeAcrossTerminal ? { dedupeAcrossTerminal: true } : {}),
      ...(input.fanoutTargetKey ? { fanoutTargetKey: input.fanoutTargetKey } : {}),
      ...(input.fanoutOperationId ? { fanoutOperationId: input.fanoutOperationId } : {}),
      ...(input.fanoutLeaseToken ? { fanoutLeaseToken: input.fanoutLeaseToken } : {}),
      ...(input.confirmationSnapshot ? { confirmationSnapshot: input.confirmationSnapshot } : {}),
      ...(input.legacyFanoutDedupeKeys ? { legacyFanoutDedupeKeys: [...input.legacyFanoutDedupeKeys] } : {}),
      dedupeKey: input.dedupeKey,
      payload: input.payload,
    });
  } catch (e) {
    await recordEnqueueFailure(ctx, input, e);
    return null;
  }
}

async function recordEnqueueFailure(ctx: EnqueueCtx, input: EnqueueNotificationInput, e: unknown) {
  const safeError = safeNotificationError(e, "notification_enqueue_failed");
  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      ...(input.shopId ? { shopId: input.shopId } : {}),
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.organizationInvitationId ? { organizationInvitationId: input.organizationInvitationId } : {}),
      ...(input.organizationInvitationVersion !== undefined
        ? { organizationInvitationVersion: input.organizationInvitationVersion }
        : {}),
      ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      channel: notificationChannelForPayload(input.payload),
      dedupeKey: input.dedupeKey,
      notificationContext: notificationContext(input),
      errorMessage: safeError.code,
    });
  } catch {
    console.error("Notification enqueue failure logging failed", { errorCode: "notification_worker_failed" });
  }
}

function notificationContext(input: EnqueueNotificationInput) {
  if (input.payload.kind === "organizationManagerInvitationLine") return input.payload.context;
  if (input.payload.kind !== "line") return input.payload.context;
  return input.payload.fallbackEmail?.payload.context ?? input.dedupeKey.split(":").slice(0, 2).join(":");
}
