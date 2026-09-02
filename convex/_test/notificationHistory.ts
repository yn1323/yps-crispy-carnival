import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type NotificationHistoryFixture = {
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
  notificationKind: string;
  requestedAt: number;
  sendStatus?: Doc<"notificationHistory">["sendStatus"];
  deliveryStatus?: Doc<"notificationHistory">["deliveryStatus"];
};

export async function seedNotificationHistory(
  ctx: Pick<MutationCtx, "db">,
  {
    shopId,
    staffId,
    notificationKind,
    requestedAt,
    sendStatus = "queued",
    deliveryStatus = "unknown",
  }: NotificationHistoryFixture,
) {
  const outboxId = await ctx.db.insert("notificationOutbox", {
    channel: "email",
    status: "sent",
    dedupeKey: `email:test:resendCooldown:${staffId}:${notificationKind}:${requestedAt}`,
    shopId,
    staffId,
    payload: {
      kind: "email",
      from: "シフトリ <noreply@example.com>",
      to: "cooldown-test@example.com",
      subject: "通知クールダウンテスト",
      html: "<p>本文</p>",
      context: "test.notificationResendCooldown",
    },
    attemptCount: 1,
    nextRunAt: requestedAt,
    createdAt: requestedAt,
    updatedAt: requestedAt,
  });

  return await ctx.db.insert("notificationHistory", {
    outboxId,
    shopId,
    staffId,
    channel: "email",
    notificationKind,
    displayTitle: "通知クールダウンテスト",
    sendStatus,
    deliveryStatus,
    requestedAt,
    updatedAt: requestedAt,
  });
}
