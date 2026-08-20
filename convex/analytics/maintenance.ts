import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, dateJST, jstDayRangeMs, subtractCalendarMonths } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { DAY_MS } from "../constants";
import { getAnalyticsNightlyCronEnabled } from "./config";
import {
  type AnalyticsInvariantRollup,
  analyticsInvariantRollupValidator,
  inspectCanonicalFactsPage,
  inspectDailyOutputPage,
} from "./invariants";
import { formatAnalyticsLog } from "./observability";
import { type AnalyticsStepArgs, processAnalyticsStepRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";
import { advanceRun, createMaintenanceRun, getLatestCompleteResetRun, runFenceMatches } from "./runs";

type AnalyticsRun = Doc<"analyticsRuns">;

const PAGE_SIZE = ANALYTICS_POLICY.batch.cleanup;
const AUDIT_DAYS = 7;
const REDACTION_LEAD_DAYS = 14;

const FAILED_OUTPUT_TABLES = [
  "analyticsDailyServiceKpis",
  "analyticsDailyNotificationKpis",
  "analyticsDailyOrganizationKpis",
  "analyticsDailyShopKpis",
  "analyticsDailySegmentKpis",
] as const;

const DETAIL_TABLES = [
  "analyticsDailyNotificationKpis",
  "analyticsDailyOrganizationKpis",
  "analyticsDailyShopKpis",
  "analyticsDailySegmentKpis",
] as const;

type FailedOutputTable = (typeof FAILED_OUTPUT_TABLES)[number];
type DetailTable = (typeof DETAIL_TABLES)[number];

const CLEANUP_STEPS = [
  "opportunityPii",
  ...FAILED_OUTPUT_TABLES.map((table) => `failed:${table}` as const),
  "sourceEvents",
  ...DETAIL_TABLES.map((table) => `detail:${table}` as const),
  "service",
  "runManifests",
] as const;

type CleanupStep = (typeof CLEANUP_STEPS)[number];

function auditFirstDate(run: AnalyticsRun): string {
  return addDays(dateJST(run.cutoffAt), -AUDIT_DAYS);
}

function auditLastDate(run: AnalyticsRun): string {
  return addDays(dateJST(run.cutoffAt), -1);
}

function auditSubstage(date: string, phase = "service"): string {
  return `daily:${date}:${phase}`;
}

function parseDailyAuditSubstage(run: AnalyticsRun, substage: string | undefined): { date: string; phase: string } {
  const firstDate = auditFirstDate(run);
  if (substage === undefined) return { date: firstDate, phase: "service" };
  const matched = /^daily:(\d{4}-\d{2}-\d{2}):(.+)$/.exec(substage);
  const date = matched?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < firstDate || date > auditLastDate(run)) {
    throw new Error("analytics_run_invariant_failed");
  }
  return { date, phase: matched?.[2] ?? "" };
}

async function scheduleNext(
  ctx: MutationCtx,
  run: AnalyticsRun,
  next: {
    stage: AnalyticsRun["stage"];
    cursor?: string;
    substage?: string;
    auditRollup?: AnalyticsInvariantRollup;
  },
): Promise<void> {
  const stepVersion = await advanceRun(ctx, run, { stage: next.stage });
  await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
    runId: run._id,
    kind: "maintenance",
    stepVersion,
    stage: next.stage,
    ...(next.cursor !== undefined ? { cursor: next.cursor } : {}),
    ...(next.substage ? { substage: next.substage } : {}),
    ...(next.auditRollup ? { auditRollup: next.auditRollup } : {}),
  });
}

async function findCompleteDailyRun(ctx: MutationCtx, targetDate: string): Promise<AnalyticsRun | null> {
  const rows = await ctx.db
    .query("analyticsRuns")
    .withIndex("by_kind_and_status_and_targetDate", (q) =>
      q.eq("kind", "daily").eq("status", "complete").eq("targetDate", targetDate),
    )
    .take(2);
  if (rows.length > 1) throw new Error("analytics_run_invariant_failed");
  return rows[0] ?? null;
}

export async function assertOpportunityRedactionReady(ctx: MutationCtx, cutoffAt: number): Promise<void> {
  const oldestUnredacted = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_identityState_and_expiresAt", (q) => q.eq("identityState", "active"))
    .first();
  if (oldestUnredacted && oldestUnredacted.expiresAt <= cutoffAt + REDACTION_LEAD_DAYS * DAY_MS) {
    throw new Error("analytics_opportunity_redaction_incomplete");
  }
}

async function completeMaintenance(ctx: MutationCtx, run: AnalyticsRun): Promise<void> {
  const oldestUnredacted = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_identityState_and_expiresAt", (q) => q.eq("identityState", "active"))
    .first();
  await assertOpportunityRedactionReady(ctx, run.cutoffAt);
  const stepVersion = await advanceRun(ctx, run, { terminal: "complete" });
  const now = Date.now();
  console.info(
    formatAnalyticsLog({
      event: "analytics_maintenance_complete",
      kind: "maintenance",
      runId: run._id,
      stage: run.stage,
      step: stepVersion,
      durationMs: now - run.startedAt,
      ...(oldestUnredacted ? { oldestUnredactedExpiresAt: oldestUnredacted.expiresAt } : {}),
    }),
  );
}

async function scheduleNextAuditDate(ctx: MutationCtx, run: AnalyticsRun, targetDate: string): Promise<void> {
  const nextDate = addDays(targetDate, 1);
  if (nextDate <= auditLastDate(run)) {
    await scheduleNext(ctx, run, { stage: "maintenanceAudit", substage: auditSubstage(nextDate) });
  } else {
    await scheduleNext(ctx, run, { stage: "maintenanceAudit", substage: "canonical:organizations" });
  }
}

async function auditDailyStep(ctx: MutationCtx, run: AnalyticsRun, args: AnalyticsStepArgs): Promise<void> {
  const { date: targetDate, phase } = parseDailyAuditSubstage(run, args.substage);
  const daily = await findCompleteDailyRun(ctx, targetDate);
  if (!daily) {
    await scheduleNextAuditDate(ctx, run, targetDate);
    return;
  }
  const result = await inspectDailyOutputPage(ctx, daily, {
    substage: phase,
    cursor: args.cursor,
    rollup: args.auditRollup,
  });
  if (result.status === "continue") {
    await scheduleNext(ctx, run, {
      stage: "maintenanceAudit",
      substage: auditSubstage(targetDate, result.substage),
      ...(result.cursor ? { cursor: result.cursor } : {}),
      ...(result.rollup ? { auditRollup: result.rollup } : {}),
    });
    return;
  }
  if (result.status === "invalid") {
    const failedAt = Date.now();
    await ctx.db.patch(daily._id, { status: "failed", terminalAt: failedAt, updatedAt: failedAt });
    console.error(
      formatAnalyticsLog({
        event: "analytics_run_failed",
        kind: "daily",
        runId: daily._id,
        targetDate,
        stage: daily.stage,
        step: daily.stepVersion,
        errorCode: "analytics_run_invariant_failed",
      }),
    );
  }
  await scheduleNextAuditDate(ctx, run, targetDate);
}

async function auditCanonicalStep(ctx: MutationCtx, run: AnalyticsRun, args: AnalyticsStepArgs): Promise<void> {
  const phase = args.substage?.startsWith("canonical:") ? args.substage.slice("canonical:".length) : "";
  const result = await inspectCanonicalFactsPage(ctx, { substage: phase, cursor: args.cursor });
  if (result.status === "invalid") throw new Error("analytics_run_invariant_failed");
  if (result.status === "valid") {
    await completeMaintenance(ctx, run);
    return;
  }
  await scheduleNext(ctx, run, {
    stage: "maintenanceAudit",
    substage: `canonical:${result.substage}`,
    ...(result.cursor ? { cursor: result.cursor } : {}),
  });
}

async function auditStep(ctx: MutationCtx, run: AnalyticsRun, args: AnalyticsStepArgs): Promise<void> {
  if (args.substage?.startsWith("canonical:")) await auditCanonicalStep(ctx, run, args);
  else await auditDailyStep(ctx, run, args);
}

function parseFailedTable(step: string): FailedOutputTable | null {
  return FAILED_OUTPUT_TABLES.find((table) => step === `failed:${table}`) ?? null;
}

function parseDetailTable(step: string): DetailTable | null {
  return DETAIL_TABLES.find((table) => step === `detail:${table}`) ?? null;
}

function requireCleanupStep(substage: string | undefined): CleanupStep {
  const step = substage ?? CLEANUP_STEPS[0];
  const matched = CLEANUP_STEPS.find((candidate) => candidate === step);
  if (!matched) throw new Error("analytics_run_invariant_failed");
  return matched;
}

async function advanceCleanupStep(ctx: MutationCtx, run: AnalyticsRun, current: CleanupStep): Promise<void> {
  const next = CLEANUP_STEPS[CLEANUP_STEPS.indexOf(current) + 1];
  if (next) {
    await scheduleNext(ctx, run, { stage: "maintenanceCleanup", substage: next });
    return;
  }
  await scheduleNext(ctx, run, {
    stage: "maintenanceAudit",
    substage: auditSubstage(auditFirstDate(run)),
  });
}

async function deleteFailedOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  table: FailedOutputTable,
  step: CleanupStep,
  cursor: string | undefined,
): Promise<void> {
  const inputCursor = cursor ?? null;
  const threshold = run.cutoffAt - ANALYTICS_POLICY.retention.failedOutputDays * DAY_MS;
  const page = await ctx.db
    .query("analyticsRuns")
    .withIndex("by_status_and_terminalAt", (q) =>
      q.eq("status", "failed").gt("terminalAt", 0).lt("terminalAt", threshold),
    )
    .paginate({ numItems: PAGE_SIZE, cursor: inputCursor, maximumRowsRead: PAGE_SIZE });
  let deleted = 0;
  for (const failedRun of page.page) {
    if (deleted === PAGE_SIZE) break;
    const rows = await ctx.db
      .query(table)
      .withIndex("by_runId", (q) => q.eq("runId", failedRun._id))
      .take(PAGE_SIZE - deleted);
    for (const row of rows) await ctx.db.delete(row._id);
    deleted += rows.length;
  }
  if (deleted > 0) {
    await scheduleNext(ctx, run, {
      stage: "maintenanceCleanup",
      substage: step,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    return;
  }
  if (page.isDone) await advanceCleanupStep(ctx, run, step);
  else {
    await scheduleNext(ctx, run, {
      stage: "maintenanceCleanup",
      substage: step,
      cursor: page.continueCursor,
    });
  }
}

async function deleteSourceEventPage(ctx: MutationCtx, run: AnalyticsRun, step: CleanupStep): Promise<void> {
  // inputFromAt is the latest successful daily cutoff captured when this run starts.
  // A series of failed dailies must not let wall-clock time delete their unreplayed input.
  const threshold = run.inputFromAt - ANALYTICS_POLICY.retention.sourceEventsDays * DAY_MS;
  const rows = await ctx.db
    .query("analyticsSourceEvents")
    .withIndex("by_occurredAt", (q) => q.lt("occurredAt", threshold))
    .take(PAGE_SIZE);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length > 0) {
    await scheduleNext(ctx, run, { stage: "maintenanceCleanup", substage: step });
  } else {
    await advanceCleanupStep(ctx, run, step);
  }
}

async function redactOpportunityPage(ctx: MutationCtx, run: AnalyticsRun, step: CleanupStep): Promise<void> {
  // 一回のweekly失敗を許容してもhard deadlineを越えないよう、二週間先まで先にredactする。
  const threshold = run.cutoffAt + REDACTION_LEAD_DAYS * DAY_MS;
  const due = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_identityState_and_expiresAt", (q) => q.eq("identityState", "active").lte("expiresAt", threshold))
    .first();
  if (!due) {
    await advanceCleanupStep(ctx, run, step);
    return;
  }
  // dailyがmaintenanceをpreemptしても一つのcycle内をactive/redacted混在にしない。
  const rows = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", due.recruitmentId))
    .take(ANALYTICS_POLICY.batch.scopeReadLimit + 1);
  if (rows.length > ANALYTICS_POLICY.batch.scopeReadLimit) throw new Error("analytics_scope_limit_exceeded");
  for (const row of rows) {
    if (row.identityState === "redacted") continue;
    await ctx.db.patch(row._id, {
      staffId: undefined,
      organizationPersonId: undefined,
      identityState: "redacted",
    });
  }
  await scheduleNext(ctx, run, { stage: "maintenanceCleanup", substage: step });
}

async function deleteDatedOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  table: DetailTable | "analyticsDailyServiceKpis",
  thresholdDate: string,
  step: CleanupStep,
): Promise<void> {
  const rows = await (async () => {
    switch (table) {
      case "analyticsDailyServiceKpis":
        return await ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_snapshotDate", (q) => q.lt("snapshotDate", thresholdDate))
          .take(PAGE_SIZE);
      case "analyticsDailyNotificationKpis":
        return await ctx.db
          .query("analyticsDailyNotificationKpis")
          .withIndex("by_snapshotDate", (q) => q.lt("snapshotDate", thresholdDate))
          .take(PAGE_SIZE);
      case "analyticsDailyOrganizationKpis":
        return await ctx.db
          .query("analyticsDailyOrganizationKpis")
          .withIndex("by_snapshotDate", (q) => q.lt("snapshotDate", thresholdDate))
          .take(PAGE_SIZE);
      case "analyticsDailyShopKpis":
        return await ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_snapshotDate", (q) => q.lt("snapshotDate", thresholdDate))
          .take(PAGE_SIZE);
      case "analyticsDailySegmentKpis":
        return await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_snapshotDate_and_dimension_and_bucket", (q) => q.lt("snapshotDate", thresholdDate))
          .take(PAGE_SIZE);
    }
  })();
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length > 0) {
    await scheduleNext(ctx, run, { stage: "maintenanceCleanup", substage: step });
  } else {
    await advanceCleanupStep(ctx, run, step);
  }
}

async function runHasOutput(ctx: MutationCtx, runId: AnalyticsRun["_id"]): Promise<boolean> {
  const rows = await Promise.all([
    ctx.db
      .query("analyticsDailyServiceKpis")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first(),
    ctx.db
      .query("analyticsDailyNotificationKpis")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first(),
    ctx.db
      .query("analyticsDailyOrganizationKpis")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first(),
    ctx.db
      .query("analyticsDailyShopKpis")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first(),
    ctx.db
      .query("analyticsDailySegmentKpis")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first(),
  ]);
  return rows.some((row) => row !== null);
}

async function deleteRunManifestPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  step: CleanupStep,
  cursor: string | undefined,
): Promise<void> {
  const thresholdDate = subtractCalendarMonths(dateJST(run.cutoffAt), ANALYTICS_POLICY.retention.runManifestYears * 12);
  const thresholdAt = jstDayRangeMs(thresholdDate).startMs;
  const page = await ctx.db
    .query("analyticsRuns")
    .withIndex("by_terminalAt", (q) => q.gt("terminalAt", 0).lt("terminalAt", thresholdAt))
    .paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null, maximumRowsRead: PAGE_SIZE });
  const latestReset = await getLatestCompleteResetRun(ctx);
  for (const candidate of page.page) {
    if (candidate._id === run._id || candidate._id === latestReset?._id || (await runHasOutput(ctx, candidate._id))) {
      continue;
    }
    await ctx.db.delete(candidate._id);
  }
  if (page.isDone) {
    await advanceCleanupStep(ctx, run, step);
    return;
  }
  await scheduleNext(ctx, run, {
    stage: "maintenanceCleanup",
    substage: step,
    cursor: page.continueCursor,
  });
}

async function cleanupStep(ctx: MutationCtx, run: AnalyticsRun, args: AnalyticsStepArgs): Promise<void> {
  const step = requireCleanupStep(args.substage);
  const failedTable = parseFailedTable(step);
  if (failedTable) {
    await deleteFailedOutputPage(ctx, run, failedTable, step, args.cursor);
    return;
  }
  if (step === "sourceEvents") {
    await deleteSourceEventPage(ctx, run, step);
    return;
  }
  if (step === "opportunityPii") {
    await redactOpportunityPage(ctx, run, step);
    return;
  }
  const detailTable = parseDetailTable(step);
  // inputFromAtはmaintenance開始時のlatest complete daily cutoff（対象日の翌日00:00 JST）。
  const latestCompleteSnapshotDate = addDays(dateJST(run.inputFromAt), -1);
  if (detailTable) {
    const thresholdDate = subtractCalendarMonths(latestCompleteSnapshotDate, ANALYTICS_POLICY.retention.detailMonths);
    await deleteDatedOutputPage(ctx, run, detailTable, thresholdDate, step);
    return;
  }
  if (step === "service") {
    const thresholdDate = subtractCalendarMonths(
      latestCompleteSnapshotDate,
      ANALYTICS_POLICY.retention.serviceYears * 12,
    );
    await deleteDatedOutputPage(ctx, run, "analyticsDailyServiceKpis", thresholdDate, step);
    return;
  }
  await deleteRunManifestPage(ctx, run, step, args.cursor);
}

export const scheduleWeekly = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!getAnalyticsNightlyCronEnabled()) return null;
    const run = await createMaintenanceRun(ctx, Date.now());
    if (!run) return null;
    await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
      runId: run._id,
      kind: "maintenance",
      stepVersion: run.stepVersion,
      stage: run.stage,
      substage: CLEANUP_STEPS[0],
    });
    console.info(
      formatAnalyticsLog({
        event: "analytics_run_started",
        kind: "maintenance",
        runId: run._id,
        stage: run.stage,
        step: run.stepVersion,
      }),
    );
    return null;
  },
});

export const processPage = internalMutation({
  args: {
    runId: v.id("analyticsRuns"),
    kind: v.union(v.literal("daily"), v.literal("reset"), v.literal("maintenance")),
    stepVersion: v.number(),
    stage: v.string(),
    cursor: v.optional(v.string()),
    substage: v.optional(v.string()),
    auditRollup: v.optional(analyticsInvariantRollupValidator),
  },
  handler: async (ctx, args: AnalyticsStepArgs) => {
    const run = await ctx.db.get(args.runId);
    if (args.kind !== "maintenance" || !runFenceMatches(run, args)) return null;
    if (run.stage === "maintenanceAudit") {
      await auditStep(ctx, run, args);
    } else if (run.stage === "maintenanceCleanup") {
      await cleanupStep(ctx, run, args);
    } else {
      throw new Error("analytics_run_invariant_failed");
    }
    return null;
  },
});
