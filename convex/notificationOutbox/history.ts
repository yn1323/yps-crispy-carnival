import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { ResendProviderEventType } from "./resendProviderEvents";
import type { NotificationChannel, NotificationHistoryInput } from "./types";

export const NOTIFICATION_HISTORY_DISPLAY_TITLE_MAX_LENGTH = 120;
export const NOTIFICATION_HISTORY_DELETE_BATCH_SIZE = 100;

const NOTIFICATION_KIND_PATTERN = /^[a-z][a-zA-Z0-9._-]{0,79}$/;

type HistoryDbCtx = Pick<MutationCtx, "db">;

export type NotificationHistoryDeliveryUpdateResult = "updated" | "stale" | "missing";

export function normalizeNotificationHistoryInput(input: NotificationHistoryInput): NotificationHistoryInput {
  if (!NOTIFICATION_KIND_PATTERN.test(input.notificationKind)) {
    throw new ConvexError("Invalid notification history metadata");
  }

  const displayTitle = input.displayTitle.trim();
  if (!displayTitle) {
    throw new ConvexError("Invalid notification history metadata");
  }

  return {
    notificationKind: input.notificationKind,
    displayTitle: Array.from(displayTitle).slice(0, NOTIFICATION_HISTORY_DISPLAY_TITLE_MAX_LENGTH).join(""),
  };
}

export async function insertNotificationHistory(
  ctx: HistoryDbCtx,
  input: {
    outboxId: Id<"notificationOutbox">;
    shopId: Id<"shops">;
    staffId: Id<"staffs">;
    channel: NotificationChannel;
    history: NotificationHistoryInput;
    requestedAt: number;
  },
) {
  const existing = await findNotificationHistory(ctx, input.outboxId);
  if (existing) throw new ConvexError("Notification history already exists");

  return await ctx.db.insert("notificationHistory", {
    outboxId: input.outboxId,
    shopId: input.shopId,
    staffId: input.staffId,
    channel: input.channel,
    ...input.history,
    sendStatus: "queued",
    deliveryStatus: input.channel === "email" ? "unknown" : "not_supported",
    requestedAt: input.requestedAt,
    updatedAt: input.requestedAt,
  });
}

export async function updateNotificationHistorySendStatus(
  ctx: HistoryDbCtx,
  outboxId: Id<"notificationOutbox">,
  transition:
    | { sendStatus: "queued"; occurredAt: number }
    | { sendStatus: "sent"; occurredAt: number }
    | { sendStatus: "failed"; occurredAt: number }
    | { sendStatus: "cancelled"; occurredAt: number },
) {
  const history = await findNotificationHistory(ctx, outboxId);
  if (!history) return false;

  switch (transition.sendStatus) {
    case "queued":
      await ctx.db.patch(history._id, {
        sendStatus: "queued",
        sentAt: undefined,
        failedAt: undefined,
        updatedAt: transition.occurredAt,
      });
      break;
    case "sent":
      await ctx.db.patch(history._id, {
        sendStatus: "sent",
        sentAt: transition.occurredAt,
        failedAt: undefined,
        updatedAt: transition.occurredAt,
      });
      break;
    case "failed":
      await ctx.db.patch(history._id, {
        sendStatus: "failed",
        failedAt: transition.occurredAt,
        updatedAt: transition.occurredAt,
      });
      break;
    case "cancelled":
      await ctx.db.patch(history._id, {
        sendStatus: "cancelled",
        updatedAt: transition.occurredAt,
      });
      break;
  }

  return true;
}

export async function updateNotificationHistoryDeliveryStatus(
  ctx: HistoryDbCtx,
  input: {
    outboxId: Id<"notificationOutbox">;
    providerEventType: ResendProviderEventType;
    occurredAt: number;
    updatedAt: number;
  },
): Promise<NotificationHistoryDeliveryUpdateResult> {
  const history = await findNotificationHistory(ctx, input.outboxId);
  if (!history) return "missing";
  if (history.deliveryStatusAt !== undefined && input.occurredAt < history.deliveryStatusAt) return "stale";

  const deliveryStatus = notificationHistoryDeliveryStatus(input.providerEventType);
  await ctx.db.patch(history._id, {
    deliveryStatus,
    deliveryStatusAt: input.occurredAt,
    ...(deliveryStatus === "delivered" ? { deliveredAt: input.occurredAt } : {}),
    updatedAt: input.updatedAt,
  });
  return "updated";
}

export function notificationHistoryDisplayStatus(
  history: Pick<Doc<"notificationHistory">, "sendStatus" | "deliveryStatus">,
): "queued" | "sent" | "delivered" | "delayed" | "failed" | "cancelled" {
  if (history.sendStatus === "cancelled") return "cancelled";
  if (history.deliveryStatus === "delivered") return "delivered";
  if (history.deliveryStatus === "delayed") return "delayed";
  if (["failed", "bounced", "suppressed"].includes(history.deliveryStatus)) return "failed";
  if (history.sendStatus === "failed") return "failed";
  if (history.sendStatus === "sent") return "sent";
  return "queued";
}

async function findNotificationHistory(ctx: HistoryDbCtx, outboxId: Id<"notificationOutbox">) {
  return await ctx.db
    .query("notificationHistory")
    .withIndex("by_outboxId", (q) => q.eq("outboxId", outboxId))
    .unique();
}

function notificationHistoryDeliveryStatus(
  providerEventType: ResendProviderEventType,
): Doc<"notificationHistory">["deliveryStatus"] {
  switch (providerEventType) {
    case "email.delivered":
      return "delivered";
    case "email.delivery_delayed":
      return "delayed";
    case "email.failed":
      return "failed";
    case "email.bounced":
      return "bounced";
    case "email.suppressed":
      return "suppressed";
  }
}
