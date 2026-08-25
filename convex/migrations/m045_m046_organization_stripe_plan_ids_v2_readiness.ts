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

export const verify = internalQuery({
  args: {
    scope: v.union(v.literal("subscriptions"), v.literal("operations")),
    phase: v.union(v.literal("pre"), v.literal("post")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    totals: v.object({
      legacy: v.number(),
      canonical: v.number(),
      canonicalPlanWithoutVersion: v.number(),
      legacyPlanWithVersion: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { scope, phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const totals = {
      legacy: 0,
      canonical: 0,
      canonicalPlanWithoutVersion: 0,
      legacyPlanWithVersion: 0,
      blocking: 0,
    };
    let scannedCount: number;
    let isDone: boolean;
    let continueCursor: string;
    if (scope === "subscriptions") {
      const result = await ctx.db.query("organizationStripeSubscriptions").paginate(paginationOpts);
      for (const row of result.page) countRow(totals, row.planIdVersion, [row.plan]);
      scannedCount = result.page.length;
      isDone = result.isDone;
      continueCursor = result.continueCursor;
    } else {
      const result = await ctx.db.query("organizationStripeOperations").paginate(paginationOpts);
      for (const row of result.page) countRow(totals, row.planIdVersion, [row.sourcePlan, row.targetPlan]);
      scannedCount = result.page.length;
      isDone = result.isDone;
      continueCursor = result.continueCursor;
    }
    totals.blocking =
      totals.canonicalPlanWithoutVersion + totals.legacyPlanWithVersion + (phase === "post" ? totals.legacy : 0);
    return { scannedCount, isDone, continueCursor, totals };
  },
});

function countRow(
  totals: {
    legacy: number;
    canonical: number;
    canonicalPlanWithoutVersion: number;
    legacyPlanWithVersion: number;
  },
  planIdVersion: 2 | undefined,
  plans: readonly (string | undefined)[],
) {
  if (planIdVersion === 2) {
    if (plans.includes("business")) totals.legacyPlanWithVersion += 1;
    else totals.canonical += 1;
  } else if (plans.includes("standard")) {
    totals.canonicalPlanWithoutVersion += 1;
  } else {
    totals.legacy += 1;
  }
}
