import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

type RecordFailureCtx = Pick<ActionCtx, "runMutation">;

export type NotificationPreparationFailureInput = {
  shopId: Id<"shops">;
  recruitmentId?: Id<"recruitments">;
  staffId?: Id<"staffs">;
  userId?: Id<"users">;
  channel: "email" | "line";
  dedupeKey: string;
  notificationContext: string;
};

export async function recordNotificationPreparationFailure(
  ctx: RecordFailureCtx,
  input: NotificationPreparationFailureInput,
  error: unknown,
  logMessage: string,
) {
  console.error(logMessage, error);

  try {
    await ctx.runMutation(internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_preparation_failed",
      shopId: input.shopId,
      ...(input.recruitmentId ? { recruitmentId: input.recruitmentId } : {}),
      ...(input.staffId ? { staffId: input.staffId } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      channel: input.channel,
      dedupeKey: input.dedupeKey,
      notificationContext: input.notificationContext,
      errorMessage: errorMessage(error),
      ...(errorName(error) ? { errorName: errorName(error) } : {}),
    });
  } catch (recordError) {
    console.error("Notification preparation failure logging failed", recordError);
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : undefined;
}
