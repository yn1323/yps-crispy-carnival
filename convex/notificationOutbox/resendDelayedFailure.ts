import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ResendDelayedFailureReadCtx = Pick<QueryCtx, "db">;

export async function getResendDelayedFailureDeadline(
  ctx: ResendDelayedFailureReadCtx,
  outboxId: Id<"notificationOutbox">,
) {
  return await ctx.db
    .query("notificationResendDelayedFailureDeadlines")
    .withIndex("by_outboxId", (q) => q.eq("outboxId", outboxId))
    .unique();
}

export async function ensureResendDelayedFailureDeadline(
  ctx: MutationCtx,
  input: { outboxId: Id<"notificationOutbox">; dueAt: number; createdAt: number },
) {
  const existing = await getResendDelayedFailureDeadline(ctx, input.outboxId);
  if (existing) return existing._id;

  return await ctx.db.insert("notificationResendDelayedFailureDeadlines", input);
}

export async function clearResendDelayedFailureDeadline(ctx: MutationCtx, outboxId: Id<"notificationOutbox">) {
  const deadline = await getResendDelayedFailureDeadline(ctx, outboxId);
  if (!deadline) return false;

  await ctx.db.delete(deadline._id);
  return true;
}
