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

/** 旧plan markerが0件になったことを、plan IDのNarrow前に全pageで確認する。 */
export const verifyBillingStates = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    totals: v.object({
      legacyPlanId: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("organizationBillingStates").paginate(paginationOpts);
    let legacyPlanId = 0;
    for (const row of result.page) {
      if (!("planIdVersion" in row.state)) legacyPlanId += 1;
    }
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals: {
        legacyPlanId,
        blocking: legacyPlanId,
      },
    };
  },
});
