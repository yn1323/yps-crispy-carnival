import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { buildNotificationFanoutTargetKey } from "./fanout";

type PreviousConfirmationDelivery = {
  state: "delivered" | "queued" | "undelivered" | "processing";
  summary: "sent" | "pending" | "failed" | "unknown";
};

function belongsToConfirmationOperation(
  outbox: Doc<"notificationOutbox"> | null,
  operation: Doc<"notificationFanoutOperations">,
  staffId: Id<"staffs">,
) {
  return (
    outbox?.fanoutOperationId === operation._id &&
    outbox.recruitmentId === operation.recruitmentId &&
    outbox.shopId === operation.shopId &&
    outbox.staffId === staffId
  );
}

/** 再通知判定と帳票が同じfallback配送を読む。summaryは送信抑止と証拠欠落を成功へ倒さない。 */
export async function getPreviousConfirmationDelivery(
  ctx: { db: DatabaseReader },
  operation: Doc<"notificationFanoutOperations">,
  staffId: Id<"staffs">,
): Promise<PreviousConfirmationDelivery> {
  const emailDedupeKey = `email:confirmation:${operation.recruitmentId}:${staffId}:${operation.dedupeSuffix}`;
  const [primaryOutbox, sentEmail, processingEmail, pendingEmail] = await Promise.all([
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_fanoutTargetKey", (q) =>
        q.eq("fanoutTargetKey", buildNotificationFanoutTargetKey(operation.operationKey, staffId)),
      )
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "sent"))
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "processing"))
      .first(),
    ctx.db
      .query("notificationOutbox")
      .withIndex("by_dedupeKey_status", (q) => q.eq("dedupeKey", emailDedupeKey).eq("status", "pending"))
      .first(),
  ]);
  const primary = belongsToConfirmationOperation(primaryOutbox, operation, staffId) ? primaryOutbox : null;
  const sent =
    primary?.status === "sent"
      ? primary
      : belongsToConfirmationOperation(sentEmail, operation, staffId)
        ? sentEmail
        : null;
  if (sent) {
    return { state: "delivered", summary: sent.deliverySuppressed ? "unknown" : "sent" };
  }
  if (primary?.status === "processing" || belongsToConfirmationOperation(processingEmail, operation, staffId)) {
    return { state: "processing", summary: "pending" };
  }
  if (primary?.status === "pending" || belongsToConfirmationOperation(pendingEmail, operation, staffId)) {
    return { state: "queued", summary: "pending" };
  }
  return { state: "undelivered", summary: primary?.status === "failed" ? "failed" : "unknown" };
}
