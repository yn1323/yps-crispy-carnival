import type { PaginationOptions } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { observedInternalQuery as internalQuery } from "../_lib/errorObservability";
import { ANALYTICS_CALCULATION_VERSION, ANALYTICS_PAYLOAD_VERSION, ANALYTICS_SCHEMA_VERSION } from "../analytics/model";
import { findRunningRun, getLatestCompleteResetRun } from "../analytics/runs";

const MAX_PAGE_SIZE = 100;
const phaseValidator = v.union(v.literal("pre"), v.literal("post"));
const pageMetadataValidator = {
  scannedCount: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
};
const planTotalsFields = {
  noPlan: v.number(),
  trialOrFree: v.number(),
  standard: v.number(),
  pro: v.number(),
  business: v.number(),
  blocking: v.number(),
};
const planTotalsValidator = v.object(planTotalsFields);

function requireBoundedPagination(paginationOpts: PaginationOptions) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > MAX_PAGE_SIZE
  ) {
    throw new ConvexError(`numItems must be between 1 and ${MAX_PAGE_SIZE}`);
  }
}

function emptyPlanTotals() {
  return { noPlan: 0, trialOrFree: 0, standard: 0, pro: 0, business: 0, blocking: 0 };
}

function countPlan(totals: ReturnType<typeof emptyPlanTotals>, plan: string | undefined) {
  if (plan === undefined) totals.noPlan += 1;
  else if (plan === "trial" || plan === "free") totals.trialOrFree += 1;
  else if (plan === "standard") totals.standard += 1;
  else if (plan === "pro") totals.pro += 1;
  else if (plan === "business") totals.business += 1;
  else totals.blocking += 1;
}

function materializedBlocking(totals: ReturnType<typeof emptyPlanTotals>, phase: "pre" | "post") {
  // materialized tablesはresetで全件再構築する。preは値を観測し、postだけbusiness残件を拒否する。
  return totals.blocking + (phase === "post" ? totals.business : 0);
}

/** source payloadのversionとplan値を全pageで確認する。m043後は旧version/businessを一件も許可しない。 */
export const verifySourceEvents = internalQuery({
  args: { phase: phaseValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({
    ...pageMetadataValidator,
    totals: v.object({
      ...planTotalsFields,
      legacyVersion: v.number(),
      canonicalVersion: v.number(),
      unknownVersion: v.number(),
      legacyStandard: v.number(),
      canonicalBusiness: v.number(),
    }),
  }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("analyticsSourceEvents").paginate(paginationOpts);
    const totals = {
      ...emptyPlanTotals(),
      legacyVersion: 0,
      canonicalVersion: 0,
      unknownVersion: 0,
      legacyStandard: 0,
      canonicalBusiness: 0,
    };
    for (const event of result.page) {
      const isV2 =
        event.schemaVersion === ANALYTICS_SCHEMA_VERSION && event.payloadVersion === ANALYTICS_PAYLOAD_VERSION;
      const isLegacy = event.schemaVersion === 1 && event.payloadVersion === 1;
      if (isV2) totals.canonicalVersion += 1;
      else if (isLegacy) totals.legacyVersion += 1;
      else totals.unknownVersion += 1;
      const plan =
        event.payload.kind === "organization"
          ? event.payload.currentPlan
          : event.payload.kind === "plan"
            ? event.payload.plan
            : undefined;
      countPlan(totals, plan);
      if (isLegacy && plan === "standard") totals.legacyStandard += 1;
      if (isV2 && plan === "business") totals.canonicalBusiness += 1;
    }
    totals.blocking +=
      totals.unknownVersion +
      totals.legacyStandard +
      totals.canonicalBusiness +
      (phase === "post" ? totals.legacyVersion : 0);
    return {
      scannedCount: result.page.length,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      totals,
    };
  },
});

/** reset対象のorganization projectionをpage走査する。 */
export const verifyOrganizations = internalQuery({
  args: { phase: phaseValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageMetadataValidator, totals: planTotalsValidator }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("analyticsOrganizations").paginate(paginationOpts);
    const totals = emptyPlanTotals();
    for (const row of result.page) countPlan(totals, row.currentPlan);
    totals.blocking = materializedBlocking(totals, phase);
    return { scannedCount: result.page.length, isDone: result.isDone, continueCursor: result.continueCursor, totals };
  },
});

/** reset対象のshop projectionをpage走査する。 */
export const verifyShops = internalQuery({
  args: { phase: phaseValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageMetadataValidator, totals: planTotalsValidator }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("analyticsShops").paginate(paginationOpts);
    const totals = emptyPlanTotals();
    for (const row of result.page) countPlan(totals, row.currentPlan);
    totals.blocking = materializedBlocking(totals, phase);
    return { scannedCount: result.page.length, isDone: result.isDone, continueCursor: result.continueCursor, totals };
  },
});

/** resetで削除される日次organization KPIも全pageでlegacy business残件を確認する。 */
export const verifyDailyOrganizationKpis = internalQuery({
  args: { phase: phaseValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({ ...pageMetadataValidator, totals: planTotalsValidator }),
  handler: async (ctx, { phase, paginationOpts }) => {
    requireBoundedPagination(paginationOpts);
    const result = await ctx.db.query("analyticsDailyOrganizationKpis").paginate(paginationOpts);
    const totals = emptyPlanTotals();
    for (const row of result.page) countPlan(totals, row.currentPlan);
    totals.blocking = materializedBlocking(totals, phase);
    return { scannedCount: result.page.length, isDone: result.isDone, continueCursor: result.continueCursor, totals };
  },
});

/** post flightではv2 sourceへ変換後にcalculationVersion=2 resetが完走したことも必須証跡にする。 */
export const verifyResetGeneration = internalQuery({
  args: {},
  returns: v.object({
    expectedCalculationVersion: v.number(),
    runningRun: v.boolean(),
    completedReset: v.boolean(),
    completedResetCalculationVersion: v.union(v.number(), v.null()),
    blocking: v.number(),
  }),
  handler: async (ctx) => {
    const [running, reset] = await Promise.all([findRunningRun(ctx), getLatestCompleteResetRun(ctx)]);
    const completedReset =
      reset?.calculationVersion === ANALYTICS_CALCULATION_VERSION && reset.resetWatermarkAt !== undefined;
    return {
      expectedCalculationVersion: ANALYTICS_CALCULATION_VERSION,
      runningRun: running !== null,
      completedReset,
      completedResetCalculationVersion: reset?.calculationVersion ?? null,
      blocking: Number(running !== null) + Number(!completedReset),
    };
  },
});
