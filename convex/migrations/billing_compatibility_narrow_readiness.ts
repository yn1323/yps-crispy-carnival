import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";

const MAX_PAGE_SIZE = 100;

function requireBoundedPagination(paginationOpts: PaginationOptions) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError(`numItems must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

/** restricted stateと旧plan markerが0件になったことを、課金互換のNarrow前に全pageで確認する。 */
export const verifyBillingStates = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    totals: v.object({
      restricted: v.number(),
      restrictedFallback: v.number(),
      legacyPlanId: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationBillingStates").paginate(paginationOpts);
    let restricted = 0;
    let restrictedFallback = 0;
    let legacyPlanId = 0;
    for (const row of result.page) {
      if (row.state.kind === "restricted") restricted += 1;
      if (row.state.kind === "pendingActivation" && row.state.fallback === "restricted") restrictedFallback += 1;
      if (!("planIdVersion" in row.state)) legacyPlanId += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: {
        restricted,
        restrictedFallback,
        legacyPlanId,
        blocking: restricted + restrictedFallback + legacyPlanId,
      },
    };
  },
});

/** restrictedの復旧権限としてだけ残り得るreadOnly管理者を全pageで確認する。 */
export const verifyReadOnlyMembers = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    totals: v.object({ readOnly: v.number(), blocking: v.number() }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationMembers").paginate(paginationOpts);
    const readOnly = result.page.filter((member) => member.status === "readOnly").length;
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: { readOnly, blocking: readOnly },
    };
  },
});
