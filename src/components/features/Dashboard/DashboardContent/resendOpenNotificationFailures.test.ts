import { describe, expect, it } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import { resendAllOpenNotificationFailuresBatches } from "./resendOpenNotificationFailures";

const failureId = (value: string) => value as Id<"notificationFailureInbox">;

describe("resendAllOpenNotificationFailuresBatches", () => {
  it("hasMoreが続く場合は次のバッチも再通知する", async () => {
    const batches = [
      { scheduledFailureIds: [failureId("failure-1")], hasMore: true },
      { scheduledFailureIds: [failureId("failure-2")], hasMore: false },
    ];
    const resendBatch = async () => {
      const batch = batches.shift();
      if (!batch) throw new Error("unexpected extra batch");
      return batch;
    };

    await expect(resendAllOpenNotificationFailuresBatches(resendBatch)).resolves.toEqual({
      scheduledFailureIds: [failureId("failure-1"), failureId("failure-2")],
      hasRemainingFailures: false,
    });
  });

  it("次バッチで進捗がない場合は残件ありとして止める", async () => {
    const result = await resendAllOpenNotificationFailuresBatches(async () => ({
      scheduledFailureIds: [],
      hasMore: true,
    }));

    expect(result).toEqual({
      scheduledFailureIds: [],
      hasRemainingFailures: true,
    });
  });
});
