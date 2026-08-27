import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, dateJST, getDeadlineCutoff, getSubmitLinkCutoff, jstDayRangeMs } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { resolveStaffLineRecipient } from "../line/service";
import { getAnalyticsResetConfiguration, parseAnalyticsSourceCaptureStartAt } from "./config";
import { inspectCanonicalFactsPage } from "./invariants";
import { ANALYTICS_CALCULATION_VERSION } from "./model";
import { formatAnalyticsLog } from "./observability";
import { applySourceEventPage, parseAnalyticsSourceProjectionSubstage } from "./projection";
import { type AnalyticsStepArgs, processAnalyticsStepRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";
import { advanceRun, failStaleRunningRuns, findRunningRun, getRunByKey, runFenceMatches } from "./runs";
import { analyticsPlanForBillingState } from "./sourceEvents";

const PAGE_SIZE = ANALYTICS_POLICY.batch.cleanup;
const COUNT_SAMPLE_LIMIT = 100;

const CLEANUP_TABLES = [
  "analyticsDailyNotificationKpis",
  "analyticsDailyServiceKpis",
  "analyticsDailyOrganizationKpis",
  "analyticsDailyShopKpis",
  "analyticsDailySegmentKpis",
  "analyticsShiftCycleOpportunities",
  "analyticsShiftCycles",
  "analyticsMemberships",
  "analyticsPeople",
  "analyticsShops",
  "analyticsOrganizations",
] as const;

type CleanupTable = (typeof CLEANUP_TABLES)[number];

type ResetInputArgs = {
  confirmed: true;
  deploymentLabel: string;
  revision: string;
  sourceCaptureStartAt: string;
  calculationVersion: number;
};

type ResetArgs = Omit<ResetInputArgs, "sourceCaptureStartAt"> & {
  sourceCaptureStartAt: number;
};

function normalizeResetArgs(args: ResetInputArgs): ResetArgs {
  const sourceCaptureStartAt = parseAnalyticsSourceCaptureStartAt(args.sourceCaptureStartAt);
  if (sourceCaptureStartAt === undefined) {
    throw new ConvexError("analytics_source_capture_start_invalid");
  }
  return { ...args, sourceCaptureStartAt };
}

function checkResetGuard(args: ResetArgs, now: number) {
  const configured = getAnalyticsResetConfiguration();
  const matches =
    configured.enabledUntil !== undefined &&
    now <= configured.enabledUntil &&
    !configured.nightlyCronEnabled &&
    configured.deploymentLabel.length > 0 &&
    configured.revision.length > 0 &&
    configured.sourceCaptureStartAt !== undefined &&
    args.sourceCaptureStartAt <= now &&
    jstDayRangeMs(dateJST(args.sourceCaptureStartAt)).startMs === args.sourceCaptureStartAt &&
    args.deploymentLabel === configured.deploymentLabel &&
    args.revision === configured.revision &&
    args.sourceCaptureStartAt === configured.sourceCaptureStartAt &&
    args.calculationVersion === ANALYTICS_CALCULATION_VERSION;
  return { configured, matches };
}

function requireSourceCaptureStartAt(run: Doc<"analyticsRuns">): number {
  if (run.sourceCaptureStartAt === undefined) throw new Error("analytics_reset_scope_invalid");
  return run.sourceCaptureStartAt;
}

async function sampledCount(ctx: MutationCtx, table: CleanupTable) {
  const rows = await ctx.db.query(table).take(COUNT_SAMPLE_LIMIT + 1);
  return { count: Math.min(rows.length, COUNT_SAMPLE_LIMIT), truncated: rows.length > COUNT_SAMPLE_LIMIT };
}

// wall clockをguardへ使うためquery cacheへ載せず、書込みなしのmutationとして毎回評価する。
export const dryRun = internalMutation({
  args: {
    confirmed: v.literal(true),
    deploymentLabel: v.string(),
    revision: v.string(),
    sourceCaptureStartAt: v.string(),
    calculationVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const normalizedArgs = normalizeResetArgs(args);
    const guard = checkResetGuard(normalizedArgs, Date.now());
    const [counts, priorRuns] = await Promise.all([
      Promise.all(CLEANUP_TABLES.map((table) => sampledCount(ctx, table))),
      ctx.db.query("analyticsRuns").take(COUNT_SAMPLE_LIMIT + 1),
    ]);
    const sourceBefore = await ctx.db
      .query("analyticsSourceEvents")
      .withIndex("by_occurredAt", (q) => q.lt("occurredAt", normalizedArgs.sourceCaptureStartAt))
      .take(COUNT_SAMPLE_LIMIT + 1);
    return {
      allowed: guard.matches,
      configured: {
        deploymentLabel: guard.configured.deploymentLabel,
        revision: guard.configured.revision,
        sourceCaptureStartAt: guard.configured.sourceCaptureStartAt ?? null,
        enabledUntil: guard.configured.enabledUntil ?? null,
        nightlyCronEnabled: guard.configured.nightlyCronEnabled,
      },
      requested: normalizedArgs,
      cleanup: CLEANUP_TABLES.map((table, index) => ({ table, ...counts[index] })),
      priorRuns: {
        count: Math.min(priorRuns.length, COUNT_SAMPLE_LIMIT),
        truncated: priorRuns.length > COUNT_SAMPLE_LIMIT,
      },
      sourceEventsBeforeCapture: {
        count: Math.min(sourceBefore.length, COUNT_SAMPLE_LIMIT),
        truncated: sourceBefore.length > COUNT_SAMPLE_LIMIT,
      },
    };
  },
});

export const start = internalMutation({
  args: {
    confirmed: v.literal(true),
    deploymentLabel: v.string(),
    revision: v.string(),
    sourceCaptureStartAt: v.string(),
    calculationVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const normalizedArgs = normalizeResetArgs(args);
    if (!checkResetGuard(normalizedArgs, now).matches) throw new ConvexError("analytics_reset_guard_rejected");
    await failStaleRunningRuns(ctx, now);
    if (await findRunningRun(ctx)) throw new ConvexError("Another analytics run is active");
    const runKey = `reset:${normalizedArgs.sourceCaptureStartAt}:${args.revision}`;
    if (await getRunByKey(ctx, runKey)) throw new ConvexError("Analytics reset was already consumed");
    const provisionalDataStartDate = addDays(dateJST(now), 1);
    const provisionalDataStartAt = jstDayRangeMs(provisionalDataStartDate).startMs;
    const runId = await ctx.db.insert("analyticsRuns", {
      runKey,
      kind: "reset",
      status: "running",
      calculationVersion: args.calculationVersion,
      dataStartDate: provisionalDataStartDate,
      dataStartAt: provisionalDataStartAt,
      inputFromAt: normalizedArgs.sourceCaptureStartAt,
      cutoffAt: normalizedArgs.sourceCaptureStartAt,
      sourceCaptureStartAt: normalizedArgs.sourceCaptureStartAt,
      stage: "resetCleanup",
      stepVersion: 0,
      startedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
      runId,
      kind: "reset",
      stepVersion: 0,
      stage: "resetCleanup",
      substage: CLEANUP_TABLES[0],
    });
    console.info(
      formatAnalyticsLog({
        event: "analytics_run_started",
        kind: "reset",
        runId,
        stage: "resetCleanup",
        step: 0,
      }),
    );
    return { runId, runKey };
  },
});

async function deleteCleanupPage(ctx: MutationCtx, table: CleanupTable) {
  const rows = await ctx.db.query(table).take(PAGE_SIZE);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length < PAGE_SIZE;
}

async function scheduleNext(
  ctx: MutationCtx,
  run: Doc<"analyticsRuns">,
  next: {
    stage: Doc<"analyticsRuns">["stage"];
    cursor?: string;
    substage?: string;
    sourceEventId?: Doc<"analyticsSourceEvents">["_id"];
    sourceCursor?: string;
  },
) {
  const stepVersion = await advanceRun(ctx, run, { stage: next.stage });
  await ctx.scheduler.runAfter(0, processAnalyticsStepRef, {
    runId: run._id,
    kind: "reset",
    stepVersion,
    stage: next.stage,
    ...(next.cursor !== undefined ? { cursor: next.cursor } : {}),
    ...(next.substage !== undefined ? { substage: next.substage } : {}),
    ...(next.sourceEventId ? { sourceEventId: next.sourceEventId } : {}),
    ...(next.sourceCursor !== undefined ? { sourceCursor: next.sourceCursor } : {}),
  });
}

async function cleanupStep(ctx: MutationCtx, run: Doc<"analyticsRuns">, substage: string | undefined) {
  const table = CLEANUP_TABLES.find((candidate) => candidate === substage);
  if (!table) throw new Error("analytics_reset_scope_invalid");
  const done = await deleteCleanupPage(ctx, table);
  if (!done) {
    await scheduleNext(ctx, run, { stage: "resetCleanup", substage: table });
    return;
  }
  const nextIndex = CLEANUP_TABLES.indexOf(table) + 1;
  const nextTable = CLEANUP_TABLES[nextIndex];
  if (nextTable) {
    await scheduleNext(ctx, run, { stage: "resetCleanup", substage: nextTable });
    return;
  }
  await scheduleNext(ctx, run, { stage: "resetCleanup", substage: "priorRuns" });
}

async function cleanupSourceEventsStep(ctx: MutationCtx, run: Doc<"analyticsRuns">) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const rows = await ctx.db
    .query("analyticsSourceEvents")
    .withIndex("by_occurredAt", (q) => q.lt("occurredAt", sourceCaptureStartAt))
    .take(PAGE_SIZE);
  for (const row of rows) await ctx.db.delete(row._id);
  if (rows.length === PAGE_SIZE) {
    await scheduleNext(ctx, run, { stage: "resetCleanup", substage: "sourceEventsBeforeCapture" });
  } else {
    await scheduleNext(ctx, run, { stage: "resetOrganizations" });
  }
}

async function cleanupPriorRunsStep(ctx: MutationCtx, run: Doc<"analyticsRuns">) {
  const candidates = await ctx.db.query("analyticsRuns").take(PAGE_SIZE + 1);
  const priorRuns = candidates.filter((candidate) => candidate._id !== run._id).slice(0, PAGE_SIZE);
  for (const priorRun of priorRuns) await ctx.db.delete(priorRun._id);
  if (priorRuns.length === PAGE_SIZE) {
    await scheduleNext(ctx, run, { stage: "resetCleanup", substage: "priorRuns" });
  } else {
    await scheduleNext(ctx, run, { stage: "resetCleanup", substage: "sourceEventsBeforeCapture" });
  }
}

async function seedOrganizations(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("organizations").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const organization of page.page) {
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
      .unique();
    const plan = billing ? analyticsPlanForBillingState(billing.state) : undefined;
    await ctx.db.insert("analyticsOrganizations", {
      organizationId: organization._id,
      displayName: organization.isDeleted ? "" : organization.name,
      registeredAt: organization.createdAt,
      ...(organization.isDeleted ? { deletedAt: organization.updatedAt } : {}),
      ...(plan ? { currentPlan: plan, planEffectiveAt: sourceCaptureStartAt } : {}),
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetOrganizations", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetShops" });
  }
}

async function seedShops(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("shops").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const shop of page.page) {
    const organizationId = shop.organizationId;
    if (!organizationId) throw new Error("analytics_reset_scope_invalid");
    const organization = await ctx.db
      .query("analyticsOrganizations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!organization) throw new Error("analytics_reset_scope_invalid");
    const inactive = shop.isDeleted || shop.operatingStatus === "archived";
    await ctx.db.insert("analyticsShops", {
      organizationId,
      shopId: shop._id,
      displayName: shop.isDeleted ? "" : shop.name,
      registeredAt: shop._creationTime,
      ...(inactive ? { deletedAt: sourceCaptureStartAt } : {}),
      ...(organization.currentPlan
        ? { currentPlan: organization.currentPlan, planEffectiveAt: sourceCaptureStartAt }
        : {}),
      statusEffectiveAt: sourceCaptureStartAt,
      cadenceConfidence: "insufficientData",
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetShops", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetPeople" });
  }
}

async function seedPeople(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("organizationPeople").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const person of page.page) {
    await ctx.db.insert("analyticsPeople", {
      organizationId: person.organizationId,
      organizationPersonId: person._id,
      firstObservedAt: person.createdAt,
      ...(person.status === "removed" ? { deletedAt: sourceCaptureStartAt } : {}),
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetPeople", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetManagers" });
  }
}

async function seedManagers(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("organizationMembers").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const member of page.page) {
    if (member.status !== "active") continue;
    const membershipKey = `manager:${member.organizationId}:${member.personId}`;
    const duplicate = await ctx.db
      .query("analyticsMemberships")
      .withIndex("by_membershipKey_and_validFrom", (q) =>
        q.eq("membershipKey", membershipKey).eq("validFrom", sourceCaptureStartAt),
      )
      .first();
    if (duplicate) throw new Error("analytics_reset_scope_invalid");
    await ctx.db.insert("analyticsMemberships", {
      membershipKey,
      organizationId: member.organizationId,
      organizationPersonId: member.personId,
      role: "manager",
      validFrom: sourceCaptureStartAt,
      isShiftTarget: false,
      lineLinked: false,
      lineFollowing: false,
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetManagers", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetStaffs" });
  }
}

async function seedStaffs(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("staffs").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const staff of page.page) {
    if (staff.isDeleted) continue;
    const shop = await ctx.db.get(staff.shopId);
    if (!shop?.organizationId) throw new Error("analytics_reset_scope_invalid");
    const organizationId = staff.organizationId ?? shop.organizationId;
    if (organizationId !== shop.organizationId) throw new Error("analytics_reset_scope_invalid");
    const lineRecipient = await resolveStaffLineRecipient(ctx, { staffId: staff._id, shopId: staff.shopId });
    await ctx.db.insert("analyticsMemberships", {
      membershipKey: `staff:${staff._id}`,
      organizationId,
      shopId: staff.shopId,
      ...(staff.organizationPersonId ? { organizationPersonId: staff.organizationPersonId } : {}),
      staffId: staff._id,
      role: "staff",
      validFrom: sourceCaptureStartAt,
      isShiftTarget: !staff.excludedFromShift,
      lineLinked: Boolean(lineRecipient),
      lineFollowing: Boolean(lineRecipient?.following),
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetStaffs", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetCycles" });
  }
}

async function seedCycles(ctx: MutationCtx, run: Doc<"analyticsRuns">, cursor?: string) {
  const sourceCaptureStartAt = requireSourceCaptureStartAt(run);
  const page = await ctx.db.query("recruitments").paginate({ numItems: PAGE_SIZE, cursor: cursor ?? null });
  for (const recruitment of page.page) {
    const closeAt = recruitment.confirmedAt ?? getSubmitLinkCutoff(recruitment.periodStart);
    if (recruitment.isDeleted || closeAt < sourceCaptureStartAt) continue;
    const shop = await ctx.db.get(recruitment.shopId);
    if (!shop?.organizationId) throw new Error("analytics_reset_scope_invalid");
    await ctx.db.insert("analyticsShiftCycles", {
      recruitmentId: recruitment._id,
      organizationId: shop.organizationId,
      shopId: shop._id,
      createdAt: recruitment._creationTime,
      submitDeadlineAt: getDeadlineCutoff(recruitment.deadline),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      ...(recruitment.confirmedAt ? { confirmedAt: recruitment.confirmedAt, closedAt: recruitment.confirmedAt } : {}),
      notificationSentCount: 0,
      notificationFailedCount: 0,
      reminderSentCount: 0,
      creationLeadTimeMs: getSubmitLinkCutoff(recruitment.periodStart) - recruitment._creationTime,
      ...(recruitment.confirmedAt
        ? {
            confirmationLeadTimeMs: recruitment.confirmedAt - recruitment._creationTime,
            confirmationSlackMs: getSubmitLinkCutoff(recruitment.periodStart) - recruitment.confirmedAt,
            confirmedBeforeStart: recruitment.confirmedAt <= getSubmitLinkCutoff(recruitment.periodStart),
          }
        : {}),
      completeness: "unavailable",
      updatedAt: sourceCaptureStartAt,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetCycles", cursor: page.continueCursor });
    return;
  }
  const resetWatermarkAt = Date.now();
  const dataStartDate = addDays(dateJST(resetWatermarkAt), 1);
  const dataStartAt = jstDayRangeMs(dataStartDate).startMs;
  await ctx.db.patch(run._id, { resetWatermarkAt, cutoffAt: resetWatermarkAt, dataStartDate, dataStartAt });
  const refreshed = await ctx.db.get(run._id);
  if (!refreshed) throw new Error("analytics_reset_scope_invalid");
  await scheduleNext(ctx, refreshed, { stage: "resetReplay" });
}

async function continueReplayProjection(
  ctx: MutationCtx,
  run: Doc<"analyticsRuns">,
  args: AnalyticsStepArgs,
): Promise<void> {
  if (run.sourceCaptureStartAt === undefined || run.resetWatermarkAt === undefined) {
    throw new Error("analytics_reset_scope_invalid");
  }
  if (!args.sourceEventId || args.sourceCursor === undefined) {
    throw new Error("analytics_projection_continuation_invalid");
  }
  const event = await ctx.db.get(args.sourceEventId);
  if (!event || event.occurredAt < run.sourceCaptureStartAt || event.occurredAt >= run.resetWatermarkAt) {
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
      stage: "resetReplay",
      substage: result.substage,
      ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
      sourceEventId: event._id,
      sourceCursor: args.sourceCursor,
    });
    return;
  }
  await scheduleNext(ctx, run, { stage: "resetReplay", cursor: args.sourceCursor });
}

async function replayEvents(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  if (run.sourceCaptureStartAt === undefined || run.resetWatermarkAt === undefined) {
    throw new Error("analytics_reset_scope_invalid");
  }
  if (args.sourceEventId) {
    await continueReplayProjection(ctx, run, args);
    return;
  }
  const sourceCaptureStartAt = run.sourceCaptureStartAt;
  const resetWatermarkAt = run.resetWatermarkAt;
  const page = await ctx.db
    .query("analyticsSourceEvents")
    .withIndex("by_occurredAt", (q) => q.gte("occurredAt", sourceCaptureStartAt).lt("occurredAt", resetWatermarkAt))
    .paginate({ numItems: 1, cursor: args.cursor ?? null, maximumRowsRead: 1 });
  const event = page.page[0];
  if (page.page.length > 1) throw new Error("analytics_source_page_overflow");
  if (event) {
    const result = await applySourceEventPage(ctx, event, run.dataStartAt);
    if (!result.done) {
      await scheduleNext(ctx, run, {
        stage: "resetReplay",
        substage: result.substage,
        ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
        sourceEventId: event._id,
        sourceCursor: page.continueCursor,
      });
      return;
    }
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, { stage: "resetReplay", cursor: page.continueCursor });
  } else {
    await scheduleNext(ctx, run, { stage: "resetVerify", substage: "cycles" });
  }
}

async function verifyReset(ctx: MutationCtx, run: Doc<"analyticsRuns">, args: AnalyticsStepArgs) {
  if (args.substage === "cycles") {
    const page = await ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_periodStart")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });
    for (const cycle of page.page) {
      const closeAt = cycle.closedAt ?? getSubmitLinkCutoff(cycle.periodStart);
      if (cycle.submitDeadlineAt < run.dataStartAt && closeAt < run.dataStartAt) {
        await ctx.db.delete(cycle._id);
      }
    }
    if (!page.isDone) {
      await scheduleNext(ctx, run, {
        stage: "resetVerify",
        substage: "cycles",
        cursor: page.continueCursor,
      });
    } else {
      await scheduleNext(ctx, run, { stage: "resetVerify", substage: "shops" });
    }
    return;
  }
  if (args.substage === "shops") {
    const page = await ctx.db
      .query("analyticsShops")
      .withIndex("by_registeredAt")
      .paginate({ numItems: PAGE_SIZE, cursor: args.cursor ?? null });
    for (const shop of page.page) {
      const organization = await ctx.db
        .query("analyticsOrganizations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", shop.organizationId))
        .unique();
      if (!organization) throw new Error("analytics_reset_scope_invalid");
      await ctx.db.patch(shop._id, {
        firstRecruitmentAt: undefined,
        firstSubmissionAt: undefined,
        firstConfirmedRecruitmentId: undefined,
        secondConfirmedRecruitmentId: undefined,
        firstConfirmedAt: undefined,
        secondConfirmedAt: undefined,
        latestActivityAt: undefined,
        estimatedCadenceDays: undefined,
        cadenceConfidence: "insufficientData",
      });
    }
    if (!page.isDone) {
      await scheduleNext(ctx, run, {
        stage: "resetVerify",
        substage: "shops",
        cursor: page.continueCursor,
      });
    } else {
      await scheduleNext(ctx, run, { stage: "resetVerify", substage: "organizations" });
    }
    return;
  }
  if (args.substage?.startsWith("canonical:")) {
    const phase = args.substage.slice("canonical:".length);
    const result = await inspectCanonicalFactsPage(ctx, { substage: phase, cursor: args.cursor });
    if (result.status === "invalid") throw new Error("analytics_run_invariant_failed");
    if (result.status === "continue") {
      await scheduleNext(ctx, run, {
        stage: "resetVerify",
        substage: `canonical:${result.substage}`,
        ...(result.cursor !== undefined ? { cursor: result.cursor } : {}),
      });
      return;
    }
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
        kind: "reset",
        runId: run._id,
        stage: run.stage,
        step: run.stepVersion + 1,
        durationMs: now - run.startedAt,
      }),
    );
    return;
  }
  if (args.substage !== "organizations") throw new Error("analytics_run_invariant_failed");
  const page = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_registeredAt")
    .paginate({ numItems: 1, cursor: args.cursor ?? null });
  for (const organization of page.page) {
    const shops = await ctx.db
      .query("analyticsShops")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organization.organizationId))
      .take(ANALYTICS_POLICY.batch.scopeReadLimit + 1);
    if (shops.length > ANALYTICS_POLICY.batch.scopeReadLimit) throw new Error("analytics_scope_limit_exceeded");
    const ordered = shops.sort(
      (left, right) =>
        left.registeredAt - right.registeredAt || String(left.shopId).localeCompare(String(right.shopId)),
    );
    await ctx.db.patch(organization._id, {
      firstShopId: ordered[0]?.shopId,
      firstShopAt: ordered[0]?.registeredAt,
      secondShopId: ordered[1]?.shopId,
      secondShopAt: ordered[1]?.registeredAt,
      secondShopFirstConfirmedAt: undefined,
    });
  }
  if (!page.isDone) {
    await scheduleNext(ctx, run, {
      stage: "resetVerify",
      substage: "organizations",
      cursor: page.continueCursor,
    });
    return;
  }
  await scheduleNext(ctx, run, { stage: "resetVerify", substage: "canonical:organizations" });
}

export const processPage = internalMutation({
  args: {
    runId: v.id("analyticsRuns"),
    kind: v.union(v.literal("daily"), v.literal("reset"), v.literal("maintenance")),
    stepVersion: v.number(),
    stage: v.string(),
    cursor: v.optional(v.string()),
    substage: v.optional(v.string()),
    sourceEventId: v.optional(v.id("analyticsSourceEvents")),
    sourceCursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (args.kind !== "reset" || !runFenceMatches(run, args)) {
      return null;
    }
    switch (run.stage) {
      case "resetCleanup":
        if (args.substage === "priorRuns") await cleanupPriorRunsStep(ctx, run);
        else if (args.substage === "sourceEventsBeforeCapture") await cleanupSourceEventsStep(ctx, run);
        else await cleanupStep(ctx, run, args.substage);
        break;
      case "resetOrganizations":
        await seedOrganizations(ctx, run, args.cursor);
        break;
      case "resetShops":
        await seedShops(ctx, run, args.cursor);
        break;
      case "resetPeople":
        await seedPeople(ctx, run, args.cursor);
        break;
      case "resetManagers":
        await seedManagers(ctx, run, args.cursor);
        break;
      case "resetStaffs":
        await seedStaffs(ctx, run, args.cursor);
        break;
      case "resetCycles":
        await seedCycles(ctx, run, args.cursor);
        break;
      case "resetReplay":
        await replayEvents(ctx, run, args);
        break;
      case "resetVerify":
        await verifyReset(ctx, run, args);
        break;
      default:
        throw new Error("analytics_reset_scope_invalid");
    }
    return null;
  },
});
