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

/** comma targetをPIIなしの件数でpre/post確認する。 */
export const verify = internalQuery({
  args: {
    phase: v.union(v.literal("pre"), v.literal("post")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    scannedCount: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
    totals: v.object({
      noTargets: v.number(),
      legacy: v.number(),
      canonical: v.number(),
      canonicalTargetWithoutVersion: v.number(),
      legacyTargetWithVersion: v.number(),
      versionWithoutTargets: v.number(),
      emptyTargets: v.number(),
      unknownTargets: v.number(),
      blocking: v.number(),
    }),
  }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("dashboardAnnouncements").paginate(paginationOpts);
    const totals = {
      noTargets: 0,
      legacy: 0,
      canonical: 0,
      canonicalTargetWithoutVersion: 0,
      legacyTargetWithVersion: 0,
      versionWithoutTargets: 0,
      emptyTargets: 0,
      unknownTargets: 0,
      blocking: 0,
    };
    for (const row of result.page) {
      if (row.organizationPlan === undefined) {
        if (row.planIdVersion === 2) totals.versionWithoutTargets += 1;
        else totals.noTargets += 1;
        continue;
      }
      const targets = [
        ...new Set(
          row.organizationPlan
            .split(",")
            .map((target) => target.trim())
            .filter(Boolean),
        ),
      ];
      if (targets.length === 0) {
        totals.emptyTargets += 1;
        continue;
      }
      if (row.planIdVersion === 2) {
        if (targets.some((target) => target === "business")) totals.legacyTargetWithVersion += 1;
        else if (targets.every(isCanonicalTarget)) totals.canonical += 1;
        else totals.unknownTargets += 1;
      } else if (targets.some((target) => target === "standard")) {
        totals.canonicalTargetWithoutVersion += 1;
      } else if (targets.every(isLegacyTarget)) {
        totals.legacy += 1;
      } else {
        totals.unknownTargets += 1;
      }
    }
    totals.blocking =
      totals.canonicalTargetWithoutVersion +
      totals.legacyTargetWithVersion +
      totals.versionWithoutTargets +
      totals.emptyTargets +
      totals.unknownTargets +
      (phase === "post" ? totals.legacy : 0);
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals,
    };
  },
});

function isLegacyTarget(target: string) {
  return target === "trial" || target === "free" || target === "pro" || target === "business";
}

function isCanonicalTarget(target: string) {
  return target === "trial" || target === "free" || target === "standard" || target === "pro";
}
