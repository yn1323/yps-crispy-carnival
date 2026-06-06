import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { EnqueueNotificationInput, NotificationEmailPayload, NotificationLinePayload } from "./types";

type EnqueueCtx = Pick<ActionCtx, "runMutation">;

export function emailPayload(input: Omit<NotificationEmailPayload, "kind">): NotificationEmailPayload {
  return { kind: "email", ...input };
}

export function linePayload(input: Omit<NotificationLinePayload, "kind">): NotificationLinePayload {
  return { kind: "line", ...input };
}

export async function enqueueEmail(
  ctx: EnqueueCtx,
  input: EnqueueNotificationInput & { payload: NotificationEmailPayload },
) {
  return await enqueueNotification(ctx, input);
}

export async function enqueueLine(
  ctx: EnqueueCtx,
  input: EnqueueNotificationInput & { payload: NotificationLinePayload },
) {
  return await enqueueNotification(ctx, input);
}

async function enqueueNotification(ctx: EnqueueCtx, input: EnqueueNotificationInput) {
  return await ctx.runMutation(internal.notificationOutbox.mutations.enqueue, {
    channel: input.payload.kind,
    shopId: input.shopId,
    ...(input.staffId ? { staffId: input.staffId } : {}),
    dedupeKey: input.dedupeKey,
    payload: input.payload,
  });
}
