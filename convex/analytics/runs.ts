import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { addDays, dateJST, getMondayWeekStart, jstDayRangeMs } from "../_lib/dateFormat";
import { HOUR_MS } from "../constants";
import { ANALYTICS_CALCULATION_VERSION } from "./model";
import { formatAnalyticsLog, safeAnalyticsErrorCode } from "./observability";
import { ANALYTICS_POLICY } from "./registry";

type Run = Doc<"analyticsRuns">;
type RunKind = Run["kind"];
type RunStatus = Run["status"];

const RUN_STATUSES = ["running", "complete", "failed"] as const satisfies readonly RunStatus[];
const RUN_SCAN_LIMIT = 20;

export async function getRunByKey(ctx: QueryCtx | MutationCtx, runKey: string): Promise<Run | null> {
  return await ctx.db
    .query("analyticsRuns")
    .withIndex("by_runKey", (q) => q.eq("runKey", runKey))
    .unique();
}

async function latestRunWithStatus(ctx: QueryCtx | MutationCtx, kind: RunKind, status: RunStatus): Promise<Run | null> {
  return await ctx.db
    .query("analyticsRuns")
    .withIndex("by_kind_and_status_and_targetDate", (q) => q.eq("kind", kind).eq("status", status))
    .order("desc")
    .first();
}

export async function getLatestRun(ctx: QueryCtx | MutationCtx, kind: RunKind): Promise<Run | null> {
  const candidates = await Promise.all(RUN_STATUSES.map((status) => latestRunWithStatus(ctx, kind, status)));
  return (
    candidates.filter((run): run is Run => run !== null).sort((left, right) => right.startedAt - left.startedAt)[0] ??
    null
  );
}

export async function getLatestCompleteDailyRun(
  ctx: QueryCtx | MutationCtx,
  beforeTargetDate?: string,
): Promise<Run | null> {
  return await ctx.db
    .query("analyticsRuns")
    .withIndex("by_kind_and_status_and_targetDate", (q) => {
      const complete = q.eq("kind", "daily").eq("status", "complete");
      return beforeTargetDate ? complete.lt("targetDate", beforeTargetDate) : complete;
    })
    .order("desc")
    .first();
}

export async function getLatestCompleteResetRun(ctx: QueryCtx | MutationCtx): Promise<Run | null> {
  return await latestRunWithStatus(ctx, "reset", "complete");
}

function staleAfterMs(run: Run): number {
  switch (run.kind) {
    case "daily":
      return ANALYTICS_POLICY.runs.staleDailyHours * HOUR_MS;
    case "reset":
      return ANALYTICS_POLICY.runs.staleResetHours * HOUR_MS;
    case "maintenance":
      return ANALYTICS_POLICY.runs.staleMaintenanceHours * HOUR_MS;
  }
}

export async function failStaleRunningRuns(ctx: MutationCtx, now: number): Promise<void> {
  const running = await ctx.db
    .query("analyticsRuns")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .take(RUN_SCAN_LIMIT + 1);
  if (running.length > RUN_SCAN_LIMIT) throw new Error("analytics_scope_limit_exceeded");
  for (const run of running) {
    if (now - run.updatedAt < staleAfterMs(run)) continue;
    await ctx.db.patch(run._id, { status: "failed", terminalAt: now, updatedAt: now });
    console.error(
      formatAnalyticsLog({
        event: "analytics_run_failed",
        kind: run.kind,
        runId: run._id,
        ...(run.targetDate ? { targetDate: run.targetDate } : {}),
        stage: run.stage,
        step: run.stepVersion,
        errorCode: "analytics_run_stale",
      }),
    );
  }
}

export async function findRunningRun(ctx: QueryCtx | MutationCtx): Promise<Run | null> {
  return await ctx.db
    .query("analyticsRuns")
    .withIndex("by_status", (q) => q.eq("status", "running"))
    .first();
}

async function existingDailyRun(ctx: QueryCtx | MutationCtx, targetDate: string): Promise<Run | null> {
  const candidates = await Promise.all(
    RUN_STATUSES.map((status) =>
      ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", status).eq("targetDate", targetDate),
        )
        .unique(),
    ),
  );
  return candidates.find((run): run is Run => run !== null) ?? null;
}

export async function createDailyRun(ctx: MutationCtx, targetDate: string, now: number): Promise<Run | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || targetDate >= dateJST(now)) {
    throw new ConvexError("Invalid analytics target date");
  }
  await failStaleRunningRuns(ctx, now);
  const running = await findRunningRun(ctx);
  if (running?.kind === "maintenance") {
    await ctx.db.patch(running._id, { status: "failed", terminalAt: now, updatedAt: now });
    console.error(
      formatAnalyticsLog({
        event: "analytics_run_failed",
        kind: "maintenance",
        runId: running._id,
        stage: running.stage,
        step: running.stepVersion,
        errorCode: "analytics_maintenance_preempted",
      }),
    );
  } else if (running) {
    return null;
  }
  if (await existingDailyRun(ctx, targetDate)) return null;

  const reset = await getLatestRun(ctx, "reset");
  if (reset?.status !== "complete" || reset.sourceCaptureStartAt === undefined) return null;
  if (targetDate < reset.dataStartDate) return null;

  const previous = await getLatestCompleteDailyRun(ctx, targetDate);
  const inputFromAt = previous?.cutoffAt ?? reset.sourceCaptureStartAt;
  const cutoffAt = jstDayRangeMs(targetDate).endMs;
  const runKey = `daily:${targetDate}`;
  const runId = await ctx.db.insert("analyticsRuns", {
    runKey,
    kind: "daily",
    status: "running",
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    dataStartDate: reset.dataStartDate,
    dataStartAt: reset.dataStartAt,
    targetDate,
    inputFromAt,
    cutoffAt,
    stage: "sourceFacts",
    stepVersion: 0,
    startedAt: now,
    updatedAt: now,
  });
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("analytics_run_create_failed");
  return run;
}

export async function createMaintenanceRun(ctx: MutationCtx, now: number): Promise<Run | null> {
  await failStaleRunningRuns(ctx, now);
  if (await findRunningRun(ctx)) return null;
  const reset = await getLatestCompleteResetRun(ctx);
  const latestDaily = await getLatestCompleteDailyRun(ctx);
  if (!reset || !latestDaily) return null;
  const week = getMondayWeekStart(dateJST(now));
  const runKey = `maintenance:${week}`;
  if (await getRunByKey(ctx, runKey)) return null;
  const runId = await ctx.db.insert("analyticsRuns", {
    runKey,
    kind: "maintenance",
    status: "running",
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    dataStartDate: reset.dataStartDate,
    dataStartAt: reset.dataStartAt,
    inputFromAt: latestDaily.cutoffAt,
    cutoffAt: now,
    stage: "maintenanceCleanup",
    stepVersion: 0,
    startedAt: now,
    updatedAt: now,
  });
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("analytics_run_create_failed");
  return run;
}

export function runFenceMatches(
  run: Run | null,
  expected: { kind: RunKind; stepVersion: number; stage: string },
): run is Run {
  return (
    run !== null &&
    run.kind === expected.kind &&
    run.status === "running" &&
    run.stepVersion === expected.stepVersion &&
    run.stage === expected.stage
  );
}

export async function advanceRun(
  ctx: MutationCtx,
  run: Run,
  next: { stage?: Run["stage"]; terminal?: "complete" },
): Promise<number> {
  const now = Date.now();
  const stepVersion = run.stepVersion + 1;
  await ctx.db.patch(run._id, {
    ...(next.stage ? { stage: next.stage } : {}),
    ...(next.terminal ? { status: next.terminal, terminalAt: now } : {}),
    stepVersion,
    updatedAt: now,
  });
  return stepVersion;
}

export const markFailed = internalMutation({
  args: {
    runId: v.id("analyticsRuns"),
    stepVersion: v.number(),
    stage: v.string(),
    errorCode: v.string(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run?.status !== "running" || run.stepVersion !== args.stepVersion || run.stage !== args.stage) {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(run._id, { status: "failed", terminalAt: now, updatedAt: now });
    console.error(
      formatAnalyticsLog({
        event: "analytics_run_failed",
        kind: run.kind,
        runId: run._id,
        ...(run.targetDate ? { targetDate: run.targetDate } : {}),
        stage: run.stage,
        step: run.stepVersion,
        errorCode: safeAnalyticsErrorCode(new Error(args.errorCode)),
      }),
    );
    return null;
  },
});

export const getStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [daily, reset, maintenance] = await Promise.all([
      getLatestRun(ctx, "daily"),
      getLatestRun(ctx, "reset"),
      getLatestRun(ctx, "maintenance"),
    ]);
    const project = (run: Run | null) =>
      run
        ? {
            runKey: run.runKey,
            kind: run.kind,
            status: run.status,
            targetDate: run.targetDate,
            dataStartDate: run.dataStartDate,
            stage: run.stage,
            stepVersion: run.stepVersion,
            startedAt: run.startedAt,
            terminalAt: run.terminalAt,
            updatedAt: run.updatedAt,
          }
        : null;
    return { daily: project(daily), reset: project(reset), maintenance: project(maintenance) };
  },
});

export function previousJstDate(now: number): string {
  return addDays(dateJST(now), -1);
}

export type AnalyticsRunId = Id<"analyticsRuns">;
