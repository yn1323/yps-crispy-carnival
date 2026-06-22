import { migrations } from "./index";

export const migration = migrations.define({
  table: "notificationOutbox",
  migrateOne: async (ctx, doc) => {
    if (doc.status !== "failed") return;
    if (doc.lastError === "LINE quota exceeded; fallback email enqueued") return;

    const failureKey = `outbox:${doc._id}`;
    const existing = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_failureKey", (q) => q.eq("failureKey", failureKey))
      .first();
    if (existing) return;

    const failedAt = doc.failedAt ?? doc.updatedAt;
    const now = Date.now();
    await ctx.db.insert("notificationFailureInbox", {
      failureKey,
      sourceType: "outbox",
      status: "open",
      shopId: doc.shopId,
      ...(doc.recruitmentId ? { recruitmentId: doc.recruitmentId } : {}),
      ...(doc.staffId ? { staffId: doc.staffId } : {}),
      ...(doc.userId ? { userId: doc.userId } : {}),
      outboxId: doc._id,
      channel: doc.channel,
      dedupeKey: doc.dedupeKey,
      notificationContext: notificationContextForPayload(doc.payload, doc.dedupeKey),
      firstFailedAt: failedAt,
      lastFailedAt: failedAt,
      attemptCount: doc.attemptCount,
      lastError: doc.lastError ?? "notificationOutbox failed before failure inbox backfill",
      createdAt: now,
      updatedAt: now,
    });
  },
});

function notificationContextForPayload(
  payload:
    | { kind: "email"; context: string }
    | { kind: "line"; fallbackEmail?: { payload: { context: string } } | undefined },
  dedupeKey: string,
) {
  if (payload.kind === "email") return payload.context;
  return payload.fallbackEmail?.payload.context ?? dedupeKey.split(":").slice(0, 2).join(":");
}
