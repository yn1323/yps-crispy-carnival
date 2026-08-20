import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { dateJST } from "../_lib/dateFormat";
import {
  observedInternalAction as internalAction,
  observedInternalMutation as internalMutation,
} from "../_lib/errorObservability";
import {
  aggregateDailyNotificationPage,
  aggregateDailyOrganizationPage,
  aggregateDailySegmentsAndServicePage,
  aggregateDailyShopPage,
} from "./aggregation";
import { getAnalyticsNightlyCronEnabled } from "./config";
import { analyticsInvariantRollupValidator, assertNoDueCyclesAtCutoff, inspectDailyOutputPage } from "./invariants";
import { formatAnalyticsLog, safeAnalyticsErrorCode } from "./observability";
import { applySourceEventPage, finalizeCycleAtCutoff, parseAnalyticsSourceProjectionSubstage } from "./projection";
import {
  type AnalyticsStepArgs,
  markAnalyticsRunFailedRef,
  processAnalyticsStepRef,
  processDailyPageRef,
  processMaintenancePageRef,
  processResetPageRef,
} from "./refs";
import {
  advanceRun,
  createDailyRun,
  getLatestCompleteResetRun,
  getLatestRun,
  previousJstDate,
  runFenceMatches,
} from "./runs";

const stepArgs = {
  runId: v.id("analyticsRuns"),
  kind: v.union(v.literal("daily"), v.literal("reset"), v.literal("maintenance")),
  stepVersion: v.number(),
  stage: v.string(),
  cursor: v.optional(v.string()),
  substage: v.optional(v.string()),
  sourceEventId: v.optional(v.id("analyticsSourceEvents")),
  sourceCursor: v.optional(v.string()),
  auditRollup: v.optional(analyticsInvariantRollupValidator),
};

async function scheduleNext(
  ctx: MutationCtx,
  run: Doc<"analyticsRuns">,
  next: {
    stage: Doc<"analyticsRuns">["stage"];
    cursor?: string;
    substage?: string;
    sourceEventId?: Doc<"analyticsSourceEvents">["_id"];
    sourceCursor?: string;
    auditRollup?: AnalyticsStepArgs["auditRollup"];
  },
) {
  const stepVersion = await advanceRun(ctx, run, { stage: next.stage });
  await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
    runId: run._id,
    kind: "daily",
    stepVersion,
    stage: next.stage,
    ...(next.cursor !== undefined ? { cursor: next.cursor } : {}),
    ...(next.substage !== undefined ? { substage: next.substage } : {}),
    ...(next.sourceEventId ? { sourceEventId: next.sourceEventId } : {}),
    ...(next.sourceCursor !== undefined ? { sourceCursor: next.sourceCursor } : {}),
    ...(next.auditRollup ? { auditRollup: next.auditRollup } : {}),
  });
}

async function continueSourceEventProjection(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  if (!args.sourceEventId || args.sourceCursor === undefined) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const event = await ctx.db.get(args.sourceEventId);
  if (!event || event.occurredAt < run.inputFromAt || event.occurredAt >= run.cutoffAt) {
    throw new Error("analytics_projection_source_event_invalid");
  }
  const result = await applySourceEventPage(
    ctx,
    event,
    run.dataStartAt,
    parseAnalyticsSourceProjectionSubstage(args.substage),
    args.cursor,
  );
  if (!result.done) {
    await scheduleNext(ctx, run, {
      stage: "sourceFacts",
      substage: result.substage,
      ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
      sourceEventId: event._id,
      sourceCursor: args.sourceCursor,
    });
    return;
  }
  await scheduleNext(ctx, run, { stage: "sourceFacts", substage: "events", cursor: args.sourceCursor });
}

async function processSourceEvents(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  if (args.sourceEventId) {
    await continueSourceEventProjection(ctx, run, args);
    return;
  }
  const page = await ctx.db
    .query("analyticsSourceEvents")
    .withIndex("by_occurredAt", (q) => q.gte("occurredAt", run.inputFromAt).lt("occurredAt", run.cutoffAt))
    .paginate({ numItems: 1, cursor: args.cursor ?? null, maximumRowsRead: 1 });
  const event = page.page[0];
  if (page.page.length > 1) throw new Error("analytics_source_page_overflow");
  if (event) {
    const result = await applySourceEventPage(ctx, event, run.dataStartAt);
    if (!result.done) {
      await scheduleNext(ctx, run, {
        stage: "sourceFacts",
        substage: result.substage,
        ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
        sourceEventId: event._id,
        sourceCursor: page.continueCursor,
      });
      return;
    }
  }
  if (page.isDone) {
    await scheduleNext(ctx, run, { stage: "sourceFacts", substage: "cycles" });
  } else {
    await scheduleNext(ctx, run, {
      stage: "sourceFacts",
      substage: "events",
      cursor: page.continueCursor,
    });
  }
}

async function processDueCycle(ctx: MutationCtx, run: Doc<"analyticsRuns">) {
  const cycle = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_needsFinalizationAt", (q) =>
      q.gte("needsFinalizationAt", 0).lte("needsFinalizationAt", run.cutoffAt),
    )
    .first();
  if (cycle) {
    await finalizeCycleAtCutoff(ctx, cycle, run.dataStartAt, run.cutoffAt);
    await scheduleNext(ctx, run, { stage: "sourceFacts", substage: "cycles" });
  } else {
    await scheduleNext(ctx, run, { stage: "notifications", substage: "sent" });
  }
}

async function processNotifications(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  const status = args.substage === "failed" ? "failed" : "sent";
  const page = await aggregateDailyNotificationPage(ctx, run, {
    status,
    cursor: args.cursor ?? null,
  });
  if (!page.isDone) {
    await scheduleNext(ctx, run, {
      stage: "notifications",
      substage: status,
      cursor: page.continueCursor ?? undefined,
    });
  } else if (status === "sent") {
    await scheduleNext(ctx, run, { stage: "notifications", substage: "failed" });
  } else {
    await scheduleNext(ctx, run, { stage: "shops" });
  }
}

async function processShops(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor: string | undefined) {
  const page = await aggregateDailyShopPage(ctx, run, cursor ?? null);
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "shops", cursor: page.continueCursor ?? undefined });
  } else {
    await scheduleNext(ctx, run, { stage: "organizations" });
  }
}

async function processOrganizations(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor: string | undefined) {
  const page = await aggregateDailyOrganizationPage(ctx, run, cursor ?? null);
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "organizations", cursor: page.continueCursor ?? undefined });
  } else {
    await scheduleNext(ctx, run, { stage: "segmentsAndService" });
  }
}

async function processSegmentsAndService(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor: string | undefined) {
  const page = await aggregateDailySegmentsAndServicePage(ctx, run, cursor ?? null);
  if (!page.isDone) {
    await scheduleNext(ctx, run, {
      stage: "segmentsAndService",
      cursor: page.continueCursor ?? undefined,
    });
  } else {
    await scheduleNext(ctx, run, { stage: "publish" });
  }
}

async function publish(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  const result = await inspectDailyOutputPage(ctx, run, {
    substage: args.substage,
    cursor: args.cursor,
    rollup: args.auditRollup,
  });
  if (result.status === "invalid") throw new Error("analytics_run_invariant_failed");
  if (result.status === "continue") {
    await scheduleNext(ctx, run, {
      stage: "publish",
      substage: result.substage,
      ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
      ...(result.rollup ? { auditRollup: result.rollup } : {}),
    });
    return;
  }
  await assertNoDueCyclesAtCutoff(ctx, run);
  const now = Date.now();
  await ctx.db.patch(run._id, {
    status: "complete",
    terminalAt: now,
    stepVersion: run.stepVersion + 1,
    updatedAt: now,
  });
  console.info(
    formatAnalyticsLog({
      event: "analytics_run_complete",
      kind: "daily",
      runId: run._id,
      ...(run.targetDate ? { targetDate: run.targetDate } : {}),
      stage: run.stage,
      step: run.stepVersion + 1,
      durationMs: now - run.startedAt,
    }),
  );
}

export const processPage = internalMutation({
  args: stepArgs,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (args.kind !== "daily" || !runFenceMatches(run, args)) return null;
    switch (run.stage) {
      case "sourceFacts":
        if (args.substage === "cycles") await processDueCycle(ctx, run);
        else await processSourceEvents(ctx, run, args);
        break;
      case "notifications":
        await processNotifications(ctx, run, args);
        break;
      case "shops":
        await processShops(ctx, run, args.cursor);
        break;
      case "organizations":
        await processOrganizations(ctx, run, args.cursor);
        break;
      case "segmentsAndService":
        await processSegmentsAndService(ctx, run, args.cursor);
        break;
      case "publish":
        await publish(ctx, run, args);
        break;
      default:
        throw new Error("analytics_run_fence_rejected");
    }
    return null;
  },
});

async function startDaily(
  ctx: MutationCtx,
  targetDate: string,
  now: number,
  options: { initialPartial?: boolean } = {},
) {
  const run = await createDailyRun(ctx, targetDate, now, options);
  if (!run) return null;
  await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
    runId: run._id,
    kind: "daily",
    stepVersion: run.stepVersion,
    stage: run.stage,
    substage: "events",
  });
  console.info(
    formatAnalyticsLog({
      event: "analytics_run_started",
      kind: "daily",
      runId: run._id,
      targetDate,
      stage: run.stage,
      step: run.stepVersion,
    }),
  );
  return run._id;
}

export const schedulePreviousDay = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!getAnalyticsNightlyCronEnabled()) return null;
    const now = Date.now();
    await startDaily(ctx, previousJstDate(now), now);
    return null;
  },
});

// 初回切替確認専用。日次runは同日再実行も過去日のbackfillも許さない。
export const startForDate = internalMutation({
  args: { targetDate: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const [reset, latestDaily] = await Promise.all([getLatestCompleteResetRun(ctx), getLatestRun(ctx, "daily")]);
    const initialPartial = reset !== null && args.targetDate === dateJST(now) && args.targetDate < reset.dataStartDate;
    const initialComplete = reset !== null && args.targetDate === reset.dataStartDate && args.targetDate < dateJST(now);
    if (!reset || latestDaily || (!initialPartial && !initialComplete)) {
      throw new ConvexError("Only the first analytics date can be started manually");
    }
    await startDaily(ctx, args.targetDate, now, { initialPartial });
    return null;
  },
});

export const processStep = internalAction({
  args: stepArgs,
  handler: async (ctx, args) => {
    const target =
      args.kind === "daily"
        ? processDailyPageRef
        : args.kind === "reset"
          ? processResetPageRef
          : processMaintenancePageRef;
    try {
      await ctx.runMutation(target, args);
    } catch (error) {
      await ctx.runMutation(markAnalyticsRunFailedRef, {
        runId: args.runId,
        stepVersion: args.stepVersion,
        stage: args.stage,
        errorCode: safeAnalyticsErrorCode(error),
      });
    }
    return null;
  },
});
