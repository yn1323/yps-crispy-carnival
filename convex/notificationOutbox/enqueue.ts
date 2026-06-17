import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { EnqueueNotificationInput, NotificationEmailPayload, NotificationLinePayload } from "./types";

type EnqueueCtx = Pick<ActionCtx, "runMutation">;
type EnqueueResult = { outboxId: Id<"notificationOutbox">; deduped: boolean } | null;

export function emailPayload(input: Omit<NotificationEmailPayload, "kind">): NotificationEmailPayload {
  return { kind: "email", ...input };
}

export function linePayload(input: Omit<NotificationLinePayload, "kind">): NotificationLinePayload {
  return { kind: "line", ...input };
}

export async function enqueueEmail(
  ctx: EnqueueCtx,
  input: EnqueueNotificationInput & { payload: NotificationEmailPayload },
): Promise<EnqueueResult> {
  return await enqueueNotification(ctx, input);
}

export async function enqueueLine(
  ctx: EnqueueCtx,
  input: EnqueueNotificationInput & { payload: NotificationLinePayload },
): Promise<EnqueueResult> {
  return await enqueueNotification(ctx, input);
}

async function enqueueNotification(ctx: EnqueueCtx, input: EnqueueNotificationInput): Promise<EnqueueResult> {
  try {
    return await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
      channel: input.payload.kind,
      shopId: input.shopId,
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      dedupeKey: input.dedupeKey,
      payload: input.payload,
    });
  } catch (e) {
    await recordEnqueueFailure(ctx, input, e);
    return null;
  }
}

async function recordEnqueueFailure(ctx: EnqueueCtx, input: EnqueueNotificationInput, e: unknown) {
  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId: input.shopId,
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      channel: input.payload.kind,
      dedupeKey: input.dedupeKey,
      notificationContext: notificationContext(input),
      errorMessage: errorMessage(e),
      ...(errorName(e) ? { errorName: errorName(e) } : {}),
    });
  } catch (logError) {
    console.error("Notification enqueue failure logging failed", logError);
  }
}

function notificationContext(input: EnqueueNotificationInput) {
  if (input.payload.kind === "email") return input.payload.context;
  return input.payload.fallbackEmail?.payload.context ?? input.dedupeKey.split(":").slice(0, 2).join(":");
}

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

function errorName(e: unknown) {
  return e instanceof Error ? e.name : undefined;
}
