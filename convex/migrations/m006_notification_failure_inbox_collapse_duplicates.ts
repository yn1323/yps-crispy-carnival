import type { Doc } from "../_generated/dataModel";
import { getNotificationFailureIdentityForDoc, supersededFailureKey } from "../notificationOutbox/failureIdentity";
import { migrations } from "./index";

const DUPLICATE_SCAN_LIMIT = 50;

export const migration = migrations.define({
  table: "notificationFailureInbox",
  migrateOne: async (ctx, failure) => {
    if (failure.status !== "open" || !failure.staffId) return;

    const identity = getNotificationFailureIdentityForDoc(failure);
    if (!identity) return;

    const openFailures = await ctx.db
      .query("notificationFailureInbox")
      .withIndex("by_staffId_status_lastFailedAt", (q) => q.eq("staffId", failure.staffId).eq("status", "open"))
      .order("desc")
      .take(DUPLICATE_SCAN_LIMIT);

    const duplicates = openFailures
      .filter((candidate) => getNotificationFailureIdentityForDoc(candidate)?.failureKey === identity.failureKey)
      .sort(sortFailureByRecencyDesc);
    if (duplicates.length === 0) return;

    const [latest, ...olderFailures] = duplicates;
    const now = Date.now();
    for (const olderFailure of olderFailures) {
      await ctx.db.patch(olderFailure._id, {
        ...(olderFailure.failureKey === identity.failureKey ? { failureKey: supersededFailureKey(olderFailure) } : {}),
        status: "resolved",
        resolvedAt: now,
        resolutionKind: "superseded",
        updatedAt: now,
      });
    }

    if (latest.failureKey !== identity.failureKey) {
      await ctx.db.patch(latest._id, {
        failureKey: identity.failureKey,
        updatedAt: now,
      });
    }
  },
});

function sortFailureByRecencyDesc(a: Doc<"notificationFailureInbox">, b: Doc<"notificationFailureInbox">) {
  return (
    b.lastFailedAt - a.lastFailedAt ||
    b.updatedAt - a.updatedAt ||
    b._creationTime - a._creationTime ||
    b._id.localeCompare(a._id)
  );
}
