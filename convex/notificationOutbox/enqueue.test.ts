import { describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { emailPayload, enqueueEmail } from "./enqueue";
import { NOTIFICATION_FAILURE_REMINDER_CONTEXT } from "./failureSuppress";

describe("notificationOutbox/enqueue", () => {
  it("suppressFailureInboxつきpayloadでもenqueue失敗イベントを記録する", async () => {
    const shopId = "shop_test" as Id<"shops">;
    const userId = "user_test" as Id<"users">;
    const dedupeKey = "email:notificationFailureReminder:shop_test:user_test";
    const runMutation = vi.fn().mockRejectedValueOnce(new Error("enqueue failed")).mockResolvedValueOnce(null);

    const result = await enqueueEmail({ runMutation } as unknown as Parameters<typeof enqueueEmail>[0], {
      shopId,
      userId,
      dedupeKey,
      payload: emailPayload({
        from: "シフトリ <noreply@example.com>",
        to: "manager@example.com",
        subject: "通知エラーがあります",
        html: "<p>test</p>",
        context: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
        suppressDelivery: true,
        suppressFailureInbox: true,
      }),
    });

    expect(result).toBeNull();
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation).toHaveBeenNthCalledWith(2, internal.notificationOutbox.mutations.recordDeliveryEvent, {
      eventType: "enqueue_failed",
      shopId,
      userId,
      channel: "email",
      dedupeKey,
      notificationContext: NOTIFICATION_FAILURE_REMINDER_CONTEXT,
      errorMessage: "enqueue failed",
      errorName: "Error",
    });
  });
});
