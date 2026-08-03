import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";
import { addDays, dateJST, getDeadlineCutoff, getSubmitLinkCutoff, jstDayRangeMs, todayJST } from "../_lib/dateFormat";
import { DAY_MS, MINUTE_MS } from "../constants";
import {
  ANALYTICS_PIPELINE_KEY,
  ANALYTICS_SCHEMA_VERSION,
  emptyHealthSignalCounts,
  emptyMilestoneCounts,
  emptyRatePair,
} from "./model";
import { processAnalyticsJobRef, recoverAnalyticsJobsRef, startDeferredDailyAggregationRef } from "./refs";
import { ANALYTICS_POLICY } from "./registry";
import { type AnalyticsSourceEventPayload, analyticsPlanForBillingState } from "./sourceEvents";

const EVENT_PAGE_SIZE = ANALYTICS_POLICY.batch.sourceEvents;
const BOOTSTRAP_PAGE_SIZE = ANALYTICS_POLICY.batch.bootstrap;
const SNAPSHOT_SCOPE_READ_LIMIT = ANALYTICS_POLICY.batch.scopedAggregation;
const SEGMENT_ROLLUP_PAGE_SIZE = ANALYTICS_POLICY.batch.segmentRollup;
const CLEANUP_PAGE_SIZE = ANALYTICS_POLICY.batch.cleanup;
const INVARIANT_MEMBERSHIP_PAGE_SIZE = 25;
const MEMBERSHIP_HISTORY_READ_LIMIT = 50;
const JOB_RECOVERY_LIMIT = ANALYTICS_POLICY.batch.recoveryJobs;
const JOB_LEASE_MS = ANALYTICS_POLICY.jobs.leaseMinutes * MINUTE_MS;
const JOB_MAX_ATTEMPTS = ANALYTICS_POLICY.jobs.maxAttempts;
const SOURCE_EVENT_RETENTION_MS = ANALYTICS_POLICY.retention.sourceEventsDays * DAY_MS;
const OPPORTUNITY_RETENTION_MS = ANALYTICS_POLICY.retention.opportunityDays * DAY_MS;
const INACTIVE_GENERATION_RETENTION_MS = ANALYTICS_POLICY.retention.inactiveGenerationDays * DAY_MS;
const JOB_RETENTION_MS = ANALYTICS_POLICY.retention.jobsDays * DAY_MS;
const DAILY_DETAIL_RETENTION_DAYS = ANALYTICS_POLICY.retention.detailMonths * 31;
const DAILY_SERVICE_RETENTION_DAYS = ANALYTICS_POLICY.retention.serviceYears * 366;

type Job = Doc<"analyticsAggregationJobs">;
type PipelineState = Doc<"analyticsPipelineStates">;
type Completeness = "complete" | "partial" | "unavailable";

async function getPipelineState(ctx: QueryCtx | MutationCtx): Promise<PipelineState | null> {
  return await ctx.db
    .query("analyticsPipelineStates")
    .withIndex("by_pipelineKey", (q) => q.eq("pipelineKey", ANALYTICS_PIPELINE_KEY))
    .unique();
}

async function markPipelineDegraded(ctx: MutationCtx, state: PipelineState, generation: string, now = Date.now()) {
  const isActive = state.activeGeneration === generation;
  const isBuilding = state.buildingGeneration === generation;
  if (!isActive && !isBuilding) return;
  if (isActive && state.buildingGeneration && !isBuilding) {
    await ctx.db.patch(state._id, { statusBeforeBuilding: "degraded", updatedAt: now });
    return;
  }
  await ctx.db.patch(state._id, {
    status: "degraded",
    updatedAt: now,
  });
}

async function markSharedProjectionDegraded(ctx: MutationCtx, state: PipelineState, now: number) {
  if (!state.activeGeneration && !state.buildingGeneration) return;
  await ctx.db.patch(state._id, {
    status: "degraded",
    ...(state.activeGeneration && state.buildingGeneration ? { statusBeforeBuilding: "degraded" as const } : {}),
    updatedAt: now,
  });
}

async function getJobByKey(ctx: QueryCtx | MutationCtx, jobKey: string): Promise<Job | null> {
  return await ctx.db
    .query("analyticsAggregationJobs")
    .withIndex("by_jobKey", (q) => q.eq("jobKey", jobKey))
    .unique();
}

async function insertJob(
  ctx: MutationCtx,
  values: Omit<Doc<"analyticsAggregationJobs">, "_id" | "_creationTime" | "schemaVersion" | "updatedAt">,
) {
  return await ctx.db.insert("analyticsAggregationJobs", {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    ...values,
    updatedAt: Date.now(),
  });
}

async function requeueJob(
  ctx: MutationCtx,
  job: Job,
  args: {
    phase?: Job["phase"];
    cursor?: string;
    parentCursor?: string;
    shopId?: Id<"shops">;
    organizationId?: Id<"organizations">;
    aggregationPartial?: boolean;
    processedDelta?: number;
    nextRunAt?: number;
    targetCount?: number;
    submittedCount?: number;
    notificationSentCount?: number;
    notificationFailedCount?: number;
    reminderSentCount?: number;
    lastNotificationFailedAt?: number;
    confirmationLeadTimeCount?: number;
    confirmationLeadTimeRankOffset?: number;
    confirmationLeadTimeMedianLowerMs?: number;
    confirmationLeadTimeMedianUpperMs?: number;
    confirmationLeadTimeP90Ms?: number;
    sourceWatermarkAt?: number;
  } = {},
) {
  await ctx.db.patch(job._id, {
    status: "pending",
    attemptCount: 0,
    phase: args.phase ?? job.phase,
    cursor: args.cursor,
    ...(args.parentCursor === undefined ? {} : { parentCursor: args.parentCursor }),
    ...(args.shopId === undefined ? {} : { shopId: args.shopId }),
    ...(args.organizationId === undefined ? {} : { organizationId: args.organizationId }),
    ...(args.aggregationPartial === undefined ? {} : { aggregationPartial: args.aggregationPartial }),
    leaseToken: undefined,
    leaseUntil: undefined,
    nextRunAt: args.nextRunAt ?? Date.now(),
    processedCount: job.processedCount + (args.processedDelta ?? 0),
    ...(args.targetCount === undefined ? {} : { targetCount: args.targetCount }),
    ...(args.submittedCount === undefined ? {} : { submittedCount: args.submittedCount }),
    ...(args.notificationSentCount === undefined ? {} : { notificationSentCount: args.notificationSentCount }),
    ...(args.notificationFailedCount === undefined ? {} : { notificationFailedCount: args.notificationFailedCount }),
    ...(args.reminderSentCount === undefined ? {} : { reminderSentCount: args.reminderSentCount }),
    ...(args.lastNotificationFailedAt === undefined ? {} : { lastNotificationFailedAt: args.lastNotificationFailedAt }),
    ...(args.confirmationLeadTimeCount === undefined
      ? {}
      : { confirmationLeadTimeCount: args.confirmationLeadTimeCount }),
    ...(args.confirmationLeadTimeRankOffset === undefined
      ? {}
      : { confirmationLeadTimeRankOffset: args.confirmationLeadTimeRankOffset }),
    ...(args.confirmationLeadTimeMedianLowerMs === undefined
      ? {}
      : { confirmationLeadTimeMedianLowerMs: args.confirmationLeadTimeMedianLowerMs }),
    ...(args.confirmationLeadTimeMedianUpperMs === undefined
      ? {}
      : { confirmationLeadTimeMedianUpperMs: args.confirmationLeadTimeMedianUpperMs }),
    ...(args.confirmationLeadTimeP90Ms === undefined
      ? {}
      : { confirmationLeadTimeP90Ms: args.confirmationLeadTimeP90Ms }),
    ...(args.sourceWatermarkAt === undefined ? {} : { sourceWatermarkAt: args.sourceWatermarkAt }),
    updatedAt: Date.now(),
  });
}

async function completeJob(ctx: MutationCtx, job: Job) {
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: "completed",
    cursor: undefined,
    leaseToken: undefined,
    leaseUntil: undefined,
    completedAt: now,
    updatedAt: now,
  });
}

async function scheduleRecovery(ctx: MutationCtx, delayMs = 0) {
  await ctx.scheduler.runAfter(delayMs, recoverAnalyticsJobsRef, {});
}

function ratio(pair: { numerator: number; denominator: number }): number | undefined {
  return pair.denominator > 0 ? pair.numerator / pair.denominator : undefined;
}

function minDefined(current: number | undefined, candidate: number): number {
  return current === undefined ? candidate : Math.min(current, candidate);
}

function activeAt(row: { validFrom: number; validTo?: number }, cutoffAt: number): boolean {
  return row.validFrom <= cutoffAt && (row.validTo === undefined || cutoffAt < row.validTo);
}

async function getPersonMembershipRolesAt(
  ctx: QueryCtx | MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  organizationPersonId: Id<"organizationPeople">,
  cutoffAt: number,
) {
  const memberships = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_organizationPersonId_and_validFrom", (q) =>
      q.eq("generation", generation).eq("organizationPersonId", organizationPersonId).lte("validFrom", cutoffAt),
    )
    .order("desc")
    .take(MEMBERSHIP_HISTORY_READ_LIMIT + 1);
  return {
    hasManager: memberships.some(
      (membership) =>
        membership.organizationId === organizationId && membership.role === "manager" && activeAt(membership, cutoffAt),
    ),
    hasStaff: memberships.some(
      (membership) =>
        membership.organizationId === organizationId && membership.role === "staff" && activeAt(membership, cutoffAt),
    ),
    complete: memberships.length <= MEMBERSHIP_HISTORY_READ_LIMIT,
  };
}

function dailySnapshotEndMs(job: Job): number {
  if (!job.targetDate) throw new Error("analytics_daily_target_missing");
  const { endMs } = jstDayRangeMs(job.targetDate);
  return Math.min(endMs, job.sourceWatermarkAt ?? endMs);
}

export const startBootstrap = internalMutation({
  args: { generation: v.string() },
  handler: async (ctx, args) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(args.generation)) {
      throw new ConvexError("Invalid analytics generation");
    }
    const now = Date.now();
    const state = await getPipelineState(ctx);
    if (state?.activeGeneration === args.generation) {
      throw new ConvexError("Active analytics generation cannot be bootstrapped again");
    }
    if (state?.buildingGeneration && state.buildingGeneration !== args.generation) {
      throw new ConvexError("Another analytics generation is building");
    }
    const jobKey = `bootstrap:${args.generation}`;
    const existing = await getJobByKey(ctx, jobKey);
    if (existing) {
      const stateMatches = state?.buildingGeneration === args.generation && Boolean(state.buildingDataStartDate);
      if (existing.status === "pending" || existing.status === "processing") {
        if (!stateMatches || state?.status !== "building") {
          throw new ConvexError("Analytics bootstrap state is inconsistent");
        }
        await ensureProjectionJobCore(ctx, args.generation);
        await scheduleRecovery(ctx);
        return { generation: args.generation, jobKey };
      }
      if (existing.status === "completed") {
        if (stateMatches && state?.status === "ready") return { generation: args.generation, jobKey };
        throw new ConvexError("Completed analytics bootstrap state is inconsistent");
      }
      if (!stateMatches || state?.status !== "building") {
        throw new ConvexError("Analytics bootstrap cannot be resumed from the current state");
      }
      await ctx.db.patch(existing._id, {
        status: "pending",
        attemptCount: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: now,
        lastErrorCode: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
      await ensureProjectionJobCore(ctx, args.generation);
      await scheduleRecovery(ctx);
      return { generation: args.generation, jobKey };
    }
    await insertJob(ctx, {
      jobKey,
      jobType: "bootstrap",
      generation: args.generation,
      phase: "captureWatermark",
      status: "pending",
      attemptCount: 0,
      nextRunAt: now,
      processedCount: 0,
    });
    if (state) {
      await ctx.db.patch(state._id, {
        buildingGeneration: args.generation,
        statusBeforeBuilding: state.activeGeneration ? state.status : "idle",
        dataStartDate: state.activeGeneration ? state.dataStartDate : dateJST(now),
        buildingDataStartDate: dateJST(now),
        buildingSourceEventCursor: undefined,
        buildingCaughtUpAt: undefined,
        buildingNotificationCompleteDate: undefined,
        buildingNotificationCompleteAt: undefined,
        status: "building",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("analyticsPipelineStates", {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        pipelineKey: ANALYTICS_PIPELINE_KEY,
        buildingGeneration: args.generation,
        statusBeforeBuilding: "idle",
        dataStartDate: dateJST(now),
        buildingDataStartDate: dateJST(now),
        status: "building",
        updatedAt: now,
      });
    }
    await ensureProjectionJobCore(ctx, args.generation);
    await scheduleRecovery(ctx);
    return { generation: args.generation, jobKey };
  },
});

async function ensureProjectionJobCore(ctx: MutationCtx, generation: string) {
  const jobKey = `projection:${ANALYTICS_PIPELINE_KEY}`;
  const existing = await getJobByKey(ctx, jobKey);
  if (existing) {
    if (existing.status === "processing") return;
    await ctx.db.patch(existing._id, {
      generation,
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: Date.now(),
      lastErrorCode: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });
    return;
  }
  await insertJob(ctx, {
    jobKey,
    jobType: "projection",
    generation,
    phase: "events",
    status: "pending",
    attemptCount: 0,
    nextRunAt: Date.now(),
    processedCount: 0,
  });
}

export const ensureProjectionJob = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await getPipelineState(ctx);
    const generation = state?.buildingGeneration ?? state?.activeGeneration;
    if (generation) await ensureProjectionJobCore(ctx, generation);
    await scheduleRecovery(ctx);
    return null;
  },
});

export const recoverJobs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const [pending, expired] = await Promise.all([
      ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_status_and_nextRunAt", (q) => q.eq("status", "pending").lte("nextRunAt", now))
        .take(JOB_RECOVERY_LIMIT),
      ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_status_and_leaseUntil", (q) => q.eq("status", "processing").lte("leaseUntil", now))
        .take(JOB_RECOVERY_LIMIT),
    ]);
    const candidates = [
      ...pending.map((job) => ({ job, expiredLease: false })),
      ...expired.map((job) => ({ job, expiredLease: true })),
    ].slice(0, JOB_RECOVERY_LIMIT);
    let state: PipelineState | null = null;
    let stateLoaded = false;
    for (const { job, expiredLease } of candidates) {
      const nextAttemptCount = expiredLease ? job.attemptCount + 1 : job.attemptCount;
      if (nextAttemptCount >= JOB_MAX_ATTEMPTS) {
        await ctx.db.patch(job._id, {
          status: "failed",
          lastErrorCode: "analytics_job_attempt_limit",
          leaseToken: undefined,
          leaseUntil: undefined,
          updatedAt: now,
        });
        if (!stateLoaded) {
          state = await getPipelineState(ctx);
          stateLoaded = true;
        }
        if (state) {
          if (job.jobKey === `projection:${ANALYTICS_PIPELINE_KEY}`) {
            await markSharedProjectionDegraded(ctx, state, now);
          } else {
            await markPipelineDegraded(ctx, state, job.generation, now);
          }
        }
        continue;
      }
      const leaseToken = crypto.randomUUID();
      await ctx.db.patch(job._id, {
        status: "processing",
        attemptCount: nextAttemptCount,
        leaseToken,
        leaseUntil: now + JOB_LEASE_MS,
        startedAt: job.startedAt ?? now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, processAnalyticsJobRef, { jobId: job._id, leaseToken });
    }
    return null;
  },
});

export const processJob = internalMutation({
  args: { jobId: v.id("analyticsAggregationJobs"), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job?.status !== "processing" || job.leaseToken !== args.leaseToken) return null;
    switch (job.jobType) {
      case "bootstrap":
        await processBootstrapPage(ctx, job);
        break;
      case "projection":
        await processProjectionPage(ctx, job);
        break;
      case "cycleFinalization":
        await processCycleFinalizationPage(ctx, job);
        break;
      case "daily":
        await processDailyPage(ctx, job);
        break;
      case "generationCleanup":
        await processGenerationCleanupPage(ctx, job);
        break;
      case "retentionCleanup":
        await processRetentionCleanupPage(ctx, job);
        break;
      case "legacyCleanup":
        await processLegacyCleanupPage(ctx, job);
        break;
      case "invariant":
        await processInvariantPage(ctx, job);
        break;
    }
    await scheduleRecovery(ctx);
    const metrics = await ctx.meta.getTransactionMetrics();
    await ctx.db.patch(job._id, {
      lastTransactionMetrics: {
        executedPhase: job.phase,
        documentsRead: metrics.documentsRead.used,
        bytesRead: metrics.bytesRead.used,
        documentsWritten: metrics.documentsWritten.used,
        bytesWritten: metrics.bytesWritten.used,
        databaseQueries: metrics.databaseQueries.used,
        functionsScheduled: metrics.functionsScheduled.used,
        measuredAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function resolvePlanForOrganization(ctx: QueryCtx | MutationCtx, organizationId: Id<"organizations">) {
  const billing = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return billing ? analyticsPlanForBillingState(billing.state) : undefined;
}

async function upsertOrganization(
  ctx: MutationCtx,
  generation: string,
  organization: Doc<"organizations">,
  plan: "trial" | "free" | "pro" | "business" | undefined,
) {
  const observedAt = Date.now();
  const existing = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", generation).eq("organizationId", organization._id),
    )
    .unique();
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId: organization._id,
    displayName: organization.isDeleted ? "" : organization.name,
    registeredAt: organization.createdAt,
    ...(organization.isDeleted ? { deletedAt: organization.updatedAt } : {}),
    ...(plan ? { currentPlan: plan, planEffectiveAt: observedAt } : {}),
    ...(existing?.pendingOrganizationProjectionJobKey
      ? { pendingOrganizationProjectionJobKey: existing.pendingOrganizationProjectionJobKey }
      : {}),
    ...(existing?.firstShopId ? { firstShopId: existing.firstShopId } : {}),
    ...(existing?.secondShopId ? { secondShopId: existing.secondShopId } : {}),
    ...(existing?.firstShopAt ? { firstShopAt: existing.firstShopAt } : {}),
    ...(existing?.secondShopAt ? { secondShopAt: existing.secondShopAt } : {}),
    ...(existing?.secondShopFirstConfirmedAt
      ? { secondShopFirstConfirmedAt: existing.secondShopFirstConfirmedAt }
      : {}),
    updatedAt: observedAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsOrganizations", value);
}

async function upsertShop(
  ctx: MutationCtx,
  generation: string,
  shop: Doc<"shops">,
  organizationId: Id<"organizations">,
  plan: "trial" | "free" | "pro" | "business" | undefined,
) {
  const observedAt = Date.now();
  const existing = await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_shopId", (q) => q.eq("generation", generation).eq("shopId", shop._id))
    .unique();
  const inactive = shop.isDeleted || shop.operatingStatus === "archived" || shop.operatingStatus === "planSuspended";
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId,
    shopId: shop._id,
    displayName: shop.isDeleted ? "" : shop.name,
    registeredAt: shop._creationTime,
    ...(inactive ? { deletedAt: observedAt } : {}),
    ...(plan ? { currentPlan: plan, planEffectiveAt: observedAt } : {}),
    statusEffectiveAt: observedAt,
    ...(existing?.firstRecruitmentAt ? { firstRecruitmentAt: existing.firstRecruitmentAt } : {}),
    ...(existing?.firstSubmissionAt ? { firstSubmissionAt: existing.firstSubmissionAt } : {}),
    ...(existing?.firstConfirmedRecruitmentId
      ? { firstConfirmedRecruitmentId: existing.firstConfirmedRecruitmentId }
      : {}),
    ...(existing?.secondConfirmedRecruitmentId
      ? { secondConfirmedRecruitmentId: existing.secondConfirmedRecruitmentId }
      : {}),
    ...(existing?.firstConfirmedAt ? { firstConfirmedAt: existing.firstConfirmedAt } : {}),
    ...(existing?.secondConfirmedAt ? { secondConfirmedAt: existing.secondConfirmedAt } : {}),
    ...(existing?.latestActivityAt ? { latestActivityAt: existing.latestActivityAt } : {}),
    ...(existing?.estimatedCadenceDays ? { estimatedCadenceDays: existing.estimatedCadenceDays } : {}),
    cadenceConfidence: existing?.cadenceConfidence ?? "insufficientData",
    updatedAt: observedAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShops", value);
}

async function upsertPerson(ctx: MutationCtx, generation: string, person: Doc<"organizationPeople">) {
  const organization = await ctx.db.get(person.organizationId);
  if (!organization) throw new Error("analytics_bootstrap_person_organization_missing");
  const existing = await ctx.db
    .query("analyticsPeople")
    .withIndex("by_generation_and_organizationPersonId", (q) =>
      q.eq("generation", generation).eq("organizationPersonId", person._id),
    )
    .unique();
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId: person.organizationId,
    organizationPersonId: person._id,
    firstObservedAt: person.createdAt,
    ...(person.status === "removed" ? { deletedAt: person.updatedAt } : {}),
    updatedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsPeople", value);
}

async function upsertManagerMembership(
  ctx: MutationCtx,
  generation: string,
  member: Doc<"organizationMembers">,
  dataStartAt: number,
) {
  const [organization, person] = await Promise.all([ctx.db.get(member.organizationId), ctx.db.get(member.personId)]);
  if (
    !organization ||
    !person ||
    person.organizationId !== member.organizationId ||
    (member.status !== "removed" && person.status !== "active")
  ) {
    throw new Error("analytics_bootstrap_manager_scope_invalid");
  }
  await applyManagerMembership(ctx, generation, member.organizationId, {
    kind: "managerMembership",
    personId: member.personId,
    status: member.status === "active" ? "active" : "removed",
    validFrom: Math.max(member.createdAt, dataStartAt),
    ...(member.status === "removed" ? { validTo: member.updatedAt } : {}),
  });
}

async function upsertStaffMembership(ctx: MutationCtx, generation: string, staff: Doc<"staffs">, dataStartAt: number) {
  const shop = await ctx.db.get(staff.shopId);
  if (!shop?.organizationId) throw new Error("analytics_bootstrap_staff_shop_scope_missing");
  const organizationId = staff.organizationId ?? shop.organizationId;
  if (organizationId !== shop.organizationId) throw new Error("analytics_bootstrap_staff_organization_mismatch");
  const [organization, person] = await Promise.all([
    ctx.db.get(organizationId),
    staff.organizationPersonId ? ctx.db.get(staff.organizationPersonId) : null,
  ]);
  if (
    !organization ||
    (staff.organizationPersonId !== undefined &&
      (!person || person.organizationId !== organizationId || (!staff.isDeleted && person.status !== "active")))
  ) {
    throw new Error("analytics_bootstrap_staff_person_scope_invalid");
  }
  const lineAccount = await ctx.db
    .query("staffLineAccounts")
    .withIndex("by_staffId", (q) => q.eq("staffId", staff._id))
    .filter((q) => q.eq(q.field("isDeleted"), false))
    .first();
  await applyStaffMembership(ctx, generation, organizationId, staff.shopId, {
    kind: "staffMembership",
    staffId: staff._id,
    ...(staff.organizationPersonId ? { organizationPersonId: staff.organizationPersonId } : {}),
    status: staff.isDeleted ? "removed" : "active",
    isShiftTarget: !staff.excludedFromShift,
    validFrom: Math.max(staff._creationTime, dataStartAt),
    ...(staff.isDeleted ? { validTo: Date.now() } : {}),
    lineLinked: Boolean(lineAccount),
    lineFollowing: Boolean(lineAccount?.following),
  });
}

async function bootstrapCycle(
  ctx: MutationCtx,
  generation: string,
  recruitment: Doc<"recruitments">,
  dataStartAt: number,
) {
  const shop = await ctx.db.get(recruitment.shopId);
  if (!shop?.organizationId) throw new Error("analytics_bootstrap_cycle_organization_missing");
  const existing = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_generation_and_recruitmentId", (q) =>
      q.eq("generation", generation).eq("recruitmentId", recruitment._id),
    )
    .unique();
  if (!existing)
    await ctx.db.insert("analyticsShiftCycles", {
      schemaVersion: ANALYTICS_SCHEMA_VERSION,
      generation,
      recruitmentId: recruitment._id,
      organizationId: shop.organizationId,
      shopId: shop._id,
      createdAt: recruitment._creationTime,
      submitDeadlineAt: getDeadlineCutoff(recruitment.deadline),
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      ...(recruitment.confirmedAt ? { confirmedAt: recruitment.confirmedAt, closedAt: recruitment.confirmedAt } : {}),
      ...(recruitment.isDeleted ? { deletedAt: Date.now() } : {}),
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
      updatedAt: Date.now(),
    });
  await updateShopCycleMilestones(
    ctx,
    generation,
    shop._id,
    recruitment._id,
    {
      kind: "cycle",
      status: recruitment.isDeleted ? "deleted" : recruitment.status,
      createdAt: recruitment._creationTime,
      periodStart: recruitment.periodStart,
      periodEnd: recruitment.periodEnd,
      deadline: recruitment.deadline,
      ...(recruitment.confirmedAt ? { confirmedAt: recruitment.confirmedAt } : {}),
    },
    recruitment.confirmedAt ?? recruitment._creationTime,
  );
  if (!recruitment.isDeleted && getDeadlineCutoff(recruitment.deadline) >= dataStartAt) {
    await ensureCycleFinalizationJob(ctx, {
      generation,
      organizationId: shop.organizationId,
      shopId: shop._id,
      recruitmentId: recruitment._id,
      cutoffKind: "deadline",
      cutoffAt: getDeadlineCutoff(recruitment.deadline),
    });
  }
  const closeCutoff = recruitment.confirmedAt ?? getSubmitLinkCutoff(recruitment.periodStart);
  if (!recruitment.isDeleted && closeCutoff >= dataStartAt) {
    await ensureCycleFinalizationJob(ctx, {
      generation,
      organizationId: shop.organizationId,
      shopId: shop._id,
      recruitmentId: recruitment._id,
      cutoffKind: "close",
      cutoffAt: closeCutoff,
    });
  }
}

async function bootstrapSubmission(ctx: MutationCtx, generation: string, submission: Doc<"shiftSubmissions">) {
  const recruitment = await ctx.db.get(submission.recruitmentId);
  if (!recruitment) return;
  await applyFirstSubmissionEvent(
    ctx,
    generation,
    recruitment.shopId,
    submission.firstSubmittedAt ?? submission.submittedAt,
  );
}

async function processBootstrapPage(ctx: MutationCtx, job: Job) {
  const paginationOpts = { numItems: BOOTSTRAP_PAGE_SIZE, cursor: job.cursor ?? null };
  const state = await getPipelineState(ctx);
  const dataStartDate = state?.buildingDataStartDate ?? state?.dataStartDate ?? todayJST();
  const { startMs: dataStartAt } = jstDayRangeMs(dataStartDate);
  switch (job.phase) {
    case "captureWatermark": {
      const page = await ctx.db.query("analyticsSourceEvents").paginate(paginationOpts);
      if (!page.isDone) {
        await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
        return;
      }
      if (!state || state.buildingGeneration !== job.generation) {
        throw new Error("analytics_building_generation_changed");
      }
      await ctx.db.patch(state._id, {
        buildingSourceEventCursor: page.continueCursor,
        updatedAt: Date.now(),
      });
      await requeueJob(ctx, job, {
        phase: "organizations",
        cursor: undefined,
        processedDelta: page.page.length,
      });
      return;
    }
    case "organizations": {
      const page = await ctx.db.query("organizations").paginate(paginationOpts);
      for (const organization of page.page) {
        await upsertOrganization(
          ctx,
          job.generation,
          organization,
          await resolvePlanForOrganization(ctx, organization._id),
        );
      }
      await continueBootstrap(ctx, job, page, "shops");
      return;
    }
    case "shops": {
      const page = await ctx.db.query("shops").paginate(paginationOpts);
      for (const shop of page.page) {
        if (!shop.organizationId) throw new Error("analytics_bootstrap_shop_organization_missing");
        if (!(await ctx.db.get(shop.organizationId))) throw new Error("analytics_bootstrap_shop_organization_invalid");
        await upsertShop(
          ctx,
          job.generation,
          shop,
          shop.organizationId,
          await resolvePlanForOrganization(ctx, shop.organizationId),
        );
        await updateOrganizationShopMilestones(ctx, job.generation, shop.organizationId, shop._id, shop._creationTime);
      }
      await continueBootstrap(ctx, job, page, "people");
      return;
    }
    case "people": {
      const page = await ctx.db.query("organizationPeople").paginate(paginationOpts);
      for (const person of page.page) await upsertPerson(ctx, job.generation, person);
      await continueBootstrap(ctx, job, page, "managers");
      return;
    }
    case "managers": {
      const page = await ctx.db.query("organizationMembers").paginate(paginationOpts);
      for (const member of page.page) await upsertManagerMembership(ctx, job.generation, member, dataStartAt);
      await continueBootstrap(ctx, job, page, "staffs");
      return;
    }
    case "staffs": {
      const page = await ctx.db.query("staffs").paginate(paginationOpts);
      for (const staff of page.page) await upsertStaffMembership(ctx, job.generation, staff, dataStartAt);
      await continueBootstrap(ctx, job, page, "cycles");
      return;
    }
    case "cycles": {
      const page = await ctx.db.query("recruitments").paginate(paginationOpts);
      for (const recruitment of page.page) await bootstrapCycle(ctx, job.generation, recruitment, dataStartAt);
      if (!page.isDone) {
        await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
        return;
      }
      await requeueJob(ctx, job, { phase: "submissions" });
      return;
    }
    case "submissions": {
      const page = await ctx.db.query("shiftSubmissions").paginate(paginationOpts);
      for (const submission of page.page) await bootstrapSubmission(ctx, job.generation, submission);
      await continueBootstrap(ctx, job, page, "verifyOrganizations");
      return;
    }
    case "verifyOrganizations": {
      const page = await ctx.db
        .query("analyticsOrganizations")
        .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
        .paginate(paginationOpts);
      for (const organization of page.page) {
        if (
          organization.secondShopAt !== undefined &&
          (organization.firstShopAt === undefined || organization.secondShopAt < organization.firstShopAt)
        ) {
          throw new Error("analytics_invariant_organization_milestone_order");
        }
      }
      await continueBootstrap(ctx, job, page, "verifyShops");
      return;
    }
    case "verifyShops": {
      const page = await ctx.db
        .query("analyticsShops")
        .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
        .paginate(paginationOpts);
      for (const shop of page.page) {
        const organization = await ctx.db
          .query("analyticsOrganizations")
          .withIndex("by_generation_and_organizationId", (q) =>
            q.eq("generation", job.generation).eq("organizationId", shop.organizationId),
          )
          .unique();
        if (!organization) throw new Error("analytics_invariant_shop_organization_missing");
        const milestonePaths = [
          [shop.registeredAt, shop.firstRecruitmentAt, shop.firstSubmissionAt],
          [shop.registeredAt, shop.firstRecruitmentAt, shop.firstConfirmedAt, shop.secondConfirmedAt],
        ];
        if (
          milestonePaths.some((path) => {
            const milestones = path.filter((value): value is number => value !== undefined);
            return milestones.some((value, index) => index > 0 && value < (milestones[index - 1] ?? 0));
          })
        ) {
          throw new Error("analytics_invariant_shop_milestone_order");
        }
      }
      await continueBootstrap(ctx, job, page, "verifyCycles");
      return;
    }
    case "verifyCycles": {
      const page = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_periodStart", (q) => q.eq("generation", job.generation))
        .paginate(paginationOpts);
      for (const cycle of page.page) {
        const shop = await ctx.db
          .query("analyticsShops")
          .withIndex("by_generation_and_shopId", (q) => q.eq("generation", job.generation).eq("shopId", cycle.shopId))
          .unique();
        if (!shop || shop.organizationId !== cycle.organizationId) {
          throw new Error("analytics_invariant_cycle_scope_missing");
        }
        if (
          (cycle.targetAtDeadline !== undefined && (cycle.submittedAtDeadline ?? 0) > cycle.targetAtDeadline) ||
          (cycle.targetAtClose !== undefined && (cycle.submittedAtClose ?? 0) > cycle.targetAtClose)
        ) {
          throw new Error("analytics_invariant_cycle_rate_invalid");
        }
      }
      if (!page.isDone) {
        await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
        return;
      }
      await requeueJob(ctx, job, { phase: "buildingCatchup", cursor: undefined });
      return;
    }
    case "buildingCatchup": {
      if (!state || state.buildingGeneration !== job.generation || !state.buildingSourceEventCursor) {
        throw new Error("analytics_building_watermark_missing");
      }
      if (await hasBlockingProjectionJobs(ctx, job.generation)) {
        await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
        return;
      }
      const page = await ctx.db.query("analyticsSourceEvents").paginate({
        numItems: 1,
        cursor: job.cursor ?? state.buildingSourceEventCursor,
      });
      for (const event of page.page) await applySourceEvent(ctx, job.generation, event);
      if (page.page.length > 0 || !page.isDone) {
        await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
        return;
      }
      const now = Date.now();
      await ctx.db.patch(state._id, {
        buildingSourceEventCursor: page.continueCursor,
        buildingCaughtUpAt: now,
        projectionCaughtUpAt: undefined,
        status: "ready",
        updatedAt: now,
      });
      await completeJob(ctx, job);
      return;
    }
    default:
      throw new Error("analytics_bootstrap_phase_invalid");
  }
}

async function continueBootstrap(
  ctx: MutationCtx,
  job: Job,
  page: { page: unknown[]; isDone: boolean; continueCursor: string },
  nextPhase: Job["phase"],
) {
  await requeueJob(ctx, job, {
    phase: page.isDone ? nextPhase : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function processProjectionPage(ctx: MutationCtx, job: Job) {
  if (job.phase === "personMemberships") {
    if (!job.organizationPersonId || !job.cutoffAt) throw new Error("analytics_person_membership_job_scope_missing");
    const page = await ctx.db
      .query("analyticsMemberships")
      .withIndex("by_generation_and_organizationPersonId_and_validFrom", (q) =>
        q
          .eq("generation", job.generation)
          .eq("organizationPersonId", job.organizationPersonId)
          .lte("validFrom", job.cutoffAt as number),
      )
      .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
    for (const membership of page.page) {
      if (membership.validTo === undefined) {
        await ctx.db.patch(membership._id, { validTo: job.cutoffAt, updatedAt: job.cutoffAt });
      }
    }
    if (page.isDone) await completeJob(ctx, job);
    else await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
    return;
  }
  if (job.phase === "staffMembershipBatch") {
    if (!job.sourceEventId || !job.organizationId || !job.shopId) {
      throw new Error("analytics_staff_batch_job_scope_missing");
    }
    const event = await ctx.db.get(job.sourceEventId);
    if (event?.payload.kind !== "staffMembershipBatch") throw new Error("analytics_staff_batch_event_missing");
    const offset = job.batchOffset ?? 0;
    const memberships = event.payload.memberships.slice(offset, offset + EVENT_PAGE_SIZE);
    for (const membership of memberships) {
      await applyStaffMembership(ctx, job.generation, job.organizationId, job.shopId, {
        kind: "staffMembership",
        ...membership,
        status: "active",
      });
    }
    const nextOffset = offset + memberships.length;
    if (nextOffset >= event.payload.memberships.length) await completeJob(ctx, job);
    else {
      await ctx.db.patch(job._id, {
        status: "pending",
        attemptCount: 0,
        batchOffset: nextOffset,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Date.now(),
        processedCount: job.processedCount + memberships.length,
        updatedAt: Date.now(),
      });
    }
    return;
  }
  if (job.phase === "lineAccountBatch") {
    if (!job.sourceEventId) throw new Error("analytics_line_batch_job_scope_missing");
    const event = await ctx.db.get(job.sourceEventId);
    if (event?.payload.kind !== "lineAccountBatch") throw new Error("analytics_line_batch_event_missing");
    if (!event.payload.isComplete) {
      await failProjectionJob(ctx, job, "analytics_line_batch_overflow");
      return;
    }
    const offset = job.batchOffset ?? 0;
    const accounts = event.payload.accounts.slice(offset, offset + EVENT_PAGE_SIZE);
    for (const account of accounts) {
      await applyLineAccountEvent(
        ctx,
        job.generation,
        {
          kind: "lineAccount",
          staffId: account.staffId,
          linked: account.linked,
          following: account.following,
        },
        account.occurredAt,
      );
    }
    const nextOffset = offset + accounts.length;
    if (nextOffset >= event.payload.accounts.length) await completeJob(ctx, job);
    else {
      await ctx.db.patch(job._id, {
        status: "pending",
        attemptCount: 0,
        batchOffset: nextOffset,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Date.now(),
        processedCount: job.processedCount + accounts.length,
        updatedAt: Date.now(),
      });
    }
    return;
  }
  if (job.organizationId && job.phase === "organizationShopSync") {
    if (!job.cutoffAt) throw new Error("analytics_organization_sync_cutoff_missing");
    if (job.dependsOnJobKey) {
      const dependency = await getJobByKey(ctx, job.dependsOnJobKey);
      if (!dependency) throw new Error("analytics_organization_projection_dependency_missing");
      if (dependency.status === "failed" || dependency.status === "cancelled") {
        await failOrganizationProjectionDependency(ctx, job);
        return;
      }
      if (dependency.status !== "completed") {
        await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
        return;
      }
    }
    const organizationId = job.organizationId;
    const organization = await ctx.db
      .query("analyticsOrganizations")
      .withIndex("by_generation_and_organizationId", (q) =>
        q.eq("generation", job.generation).eq("organizationId", organizationId),
      )
      .unique();
    if (!organization) throw new Error("analytics_organization_projection_scope_missing");
    const sourceEvent = job.sourceEventId ? await ctx.db.get(job.sourceEventId) : null;
    if (job.sourceEventId && sourceEvent?.payload.kind !== "plan") {
      throw new Error("analytics_plan_projection_event_missing");
    }
    const page = await ctx.db
      .query("analyticsShops")
      .withIndex("by_generation_and_organizationId", (q) =>
        q.eq("generation", job.generation).eq("organizationId", organizationId),
      )
      .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
    if (sourceEvent?.payload.kind === "plan") {
      const payload = sourceEvent.payload;
      if (payload.plan && (organization.planEffectiveAt ?? Number.NEGATIVE_INFINITY) <= payload.effectiveAt) {
        await ctx.db.patch(organization._id, {
          currentPlan: payload.plan,
          planEffectiveAt: payload.effectiveAt,
          updatedAt: Math.max(organization.updatedAt, payload.effectiveAt),
        });
      }
      for (const shop of page.page) {
        if (!payload.plan || (shop.planEffectiveAt ?? Number.NEGATIVE_INFINITY) > payload.effectiveAt) continue;
        await ctx.db.patch(shop._id, {
          currentPlan: payload.plan,
          planEffectiveAt: payload.effectiveAt,
          updatedAt: Math.max(shop.updatedAt, payload.effectiveAt),
        });
      }
    } else {
      for (const shop of page.page) {
        if ((shop.statusEffectiveAt ?? Number.NEGATIVE_INFINITY) > job.cutoffAt) continue;
        await ctx.db.patch(shop._id, {
          displayName: "",
          deletedAt: job.cutoffAt,
          statusEffectiveAt: job.cutoffAt,
          updatedAt: Math.max(shop.updatedAt, job.cutoffAt),
        });
      }
    }
    await requeueJob(ctx, job, {
      phase: page.isDone
        ? sourceEvent?.payload.kind === "plan"
          ? "organizationPlanDeltas"
          : "organizationManagerSync"
        : "organizationShopSync",
      cursor: page.isDone ? undefined : page.continueCursor,
      processedDelta: page.page.length,
    });
    return;
  }
  if (job.organizationId && job.phase === "organizationPlanDeltas") {
    if (!job.sourceEventId) throw new Error("analytics_plan_projection_event_missing");
    const event = await ctx.db.get(job.sourceEventId);
    if (event?.payload.kind !== "plan") throw new Error("analytics_plan_projection_event_missing");
    const offset = job.batchOffset ?? 0;
    const deltas = event.payload.statusDeltas.slice(offset, offset + EVENT_PAGE_SIZE);
    for (const delta of deltas) {
      if (delta.kind === "shop") {
        const shop = await ctx.db
          .query("analyticsShops")
          .withIndex("by_generation_and_shopId", (q) => q.eq("generation", job.generation).eq("shopId", delta.shopId))
          .unique();
        if (!shop || shop.organizationId !== job.organizationId) {
          throw new Error("analytics_plan_shop_delta_scope_missing");
        }
        if ((shop.statusEffectiveAt ?? Number.NEGATIVE_INFINITY) > event.payload.effectiveAt) continue;
        await ctx.db.patch(shop._id, {
          deletedAt: delta.status === "active" ? undefined : event.payload.effectiveAt,
          statusEffectiveAt: event.payload.effectiveAt,
          updatedAt: Math.max(shop.updatedAt, event.payload.effectiveAt),
        });
      } else {
        await applyManagerMembership(ctx, job.generation, job.organizationId, {
          kind: "managerMembership",
          personId: delta.personId,
          status: delta.status === "active" ? "active" : "removed",
          validFrom: event.payload.effectiveAt,
          ...(delta.status === "active" ? {} : { validTo: event.payload.effectiveAt }),
        });
      }
    }
    const nextOffset = offset + deltas.length;
    if (nextOffset < event.payload.statusDeltas.length) {
      await ctx.db.patch(job._id, {
        status: "pending",
        attemptCount: 0,
        batchOffset: nextOffset,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Date.now(),
        processedCount: job.processedCount + deltas.length,
        updatedAt: Date.now(),
      });
      return;
    }
    await clearPendingOrganizationProjectionJob(ctx, job);
    await completeJob(ctx, job);
    return;
  }
  if (job.organizationId && job.phase === "organizationManagerSync") {
    if (!job.cutoffAt) throw new Error("analytics_organization_sync_cutoff_missing");
    const page = await ctx.db
      .query("analyticsMemberships")
      .withIndex("by_generation_and_organizationId_and_role_and_validFrom", (q) =>
        q
          .eq("generation", job.generation)
          .eq("organizationId", job.organizationId as Id<"organizations">)
          .eq("role", "manager")
          .lte("validFrom", job.cutoffAt as number),
      )
      .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
    for (const membership of page.page) {
      if (membership.validTo === undefined && membership.updatedAt <= job.cutoffAt) {
        await ctx.db.patch(membership._id, { validTo: job.cutoffAt, updatedAt: job.cutoffAt });
      }
    }
    if (page.isDone) {
      await clearPendingOrganizationProjectionJob(ctx, job);
      await completeJob(ctx, job);
    } else await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
    return;
  }

  const state = await getPipelineState(ctx);
  if (!state) {
    await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
    return;
  }
  const generations = [
    state.activeGeneration,
    ...(state.buildingCaughtUpAt === undefined ? [] : [state.buildingGeneration]),
  ].filter((value): value is string => value !== undefined);
  for (const generation of generations) {
    if (await hasBlockingProjectionJobs(ctx, generation)) {
      await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
      return;
    }
  }
  const page = await ctx.db
    .query("analyticsSourceEvents")
    .paginate({ numItems: 1, cursor: state.sourceEventCursor ?? null });
  for (const event of page.page) {
    for (const generation of generations) await applySourceEvent(ctx, generation, event);
  }
  const now = Date.now();
  const caughtUp = page.page.length === 0 && page.isDone;
  // 追随済みの空pageは定常heartbeatなので、export整合性tokenのasOfは進めない。
  const shouldAdvanceAsOf = page.page.length > 0 || (caughtUp && state.projectionCaughtUpAt === undefined);
  await ctx.db.patch(state._id, {
    sourceEventCursor: page.continueCursor,
    ...(shouldAdvanceAsOf ? { lastProjectedAt: now } : {}),
    ...(caughtUp ? { projectionCaughtUpAt: now } : { projectionCaughtUpAt: undefined }),
    updatedAt: now,
  });
  if (caughtUp && state.status === "ready" && state.buildingGeneration && state.buildingDataStartDate) {
    const baselineJob = await getJobByKey(ctx, `daily:${state.buildingGeneration}:${state.buildingDataStartDate}`);
    if (!baselineJob) {
      await ctx.scheduler.runAfter(0, startDeferredDailyAggregationRef, {
        date: state.buildingDataStartDate,
        generation: state.buildingGeneration,
      });
    }
  }
  await requeueJob(ctx, job, {
    nextRunAt: caughtUp ? now + MINUTE_MS : now,
    processedDelta: page.page.length,
  });
}

async function applySourceEvent(ctx: MutationCtx, generation: string, event: Doc<"analyticsSourceEvents">) {
  const payload = event.payload;
  switch (payload.kind) {
    case "organization":
      if (!event.organizationId) throw new Error("analytics_event_organization_id_missing");
      await applyOrganizationEvent(ctx, generation, event.organizationId, event.eventKey, event.occurredAt, payload);
      return;
    case "shop":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_shop_scope_missing");
      await applyShopEvent(ctx, generation, event.organizationId, event.shopId, event.occurredAt, payload);
      return;
    case "person":
      if (!event.organizationId || !event.subjectId) throw new Error("analytics_event_person_scope_missing");
      await applyPersonEvent(
        ctx,
        generation,
        event.organizationId,
        event.subjectId as Id<"organizationPeople">,
        event.occurredAt,
        payload,
      );
      return;
    case "managerMembership":
      if (!event.organizationId) throw new Error("analytics_event_manager_scope_missing");
      await applyManagerMembership(ctx, generation, event.organizationId, payload);
      return;
    case "managerMembershipExchange":
      if (!event.organizationId) throw new Error("analytics_event_manager_scope_missing");
      await applyManagerMembershipExchange(ctx, generation, event.organizationId, payload);
      return;
    case "staffMembership":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_staff_scope_missing");
      await applyStaffMembership(ctx, generation, event.organizationId, event.shopId, payload);
      return;
    case "staffMembershipBatch":
      if (!event.organizationId || !event.shopId) throw new Error("analytics_event_staff_scope_missing");
      {
        const jobKey = `projection-staff-batch:${generation}:${event.eventKey}`;
        if (!(await getJobByKey(ctx, jobKey))) {
          await insertJob(ctx, {
            jobKey,
            jobType: "projection",
            generation,
            phase: "staffMembershipBatch",
            status: "pending",
            attemptCount: 0,
            nextRunAt: Date.now(),
            processedCount: 0,
            organizationId: event.organizationId,
            shopId: event.shopId,
            sourceEventId: event._id,
            batchOffset: 0,
          });
        }
      }
      return;
    case "plan":
      if (!event.organizationId) throw new Error("analytics_event_plan_scope_missing");
      await applyPlanEvent(ctx, generation, event, payload);
      return;
    case "cycle":
      if (!event.organizationId || !event.shopId || !event.recruitmentId) {
        throw new Error("analytics_event_cycle_scope_missing");
      }
      await applyCycleEvent(ctx, generation, event, payload);
      return;
    case "submissionFirst":
      if (!event.shopId) throw new Error("analytics_event_submission_scope_missing");
      await applyFirstSubmissionEvent(ctx, generation, event.shopId, payload.firstSubmittedAt);
      return;
    case "lineAccount":
      await applyLineAccountEvent(ctx, generation, payload, event.occurredAt);
      return;
    case "lineAccountBatch": {
      const jobKey = `projection-line-batch:${generation}:${event.eventKey}`;
      if (!(await getJobByKey(ctx, jobKey))) {
        await insertJob(ctx, {
          jobKey,
          jobType: "projection",
          generation,
          phase: "lineAccountBatch",
          status: "pending",
          attemptCount: 0,
          nextRunAt: Date.now(),
          processedCount: 0,
          sourceEventId: event._id,
          batchOffset: 0,
        });
      }
      return;
    }
  }
}

async function applyOrganizationEvent(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  eventKey: string,
  occurredAt: number,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "organization" }>,
) {
  const existing = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId),
    )
    .unique();
  const registeredAt = payload.registeredAt ?? existing?.registeredAt ?? occurredAt;
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId,
    displayName: payload.change === "deleted" ? "" : (payload.displayName ?? existing?.displayName ?? ""),
    registeredAt,
    ...(payload.change === "deleted" ? { deletedAt: occurredAt } : {}),
    ...((payload.currentPlan ?? existing?.currentPlan)
      ? { currentPlan: payload.currentPlan ?? existing?.currentPlan }
      : {}),
    ...(existing?.planEffectiveAt !== undefined ? { planEffectiveAt: existing.planEffectiveAt } : {}),
    ...(existing?.pendingOrganizationProjectionJobKey
      ? { pendingOrganizationProjectionJobKey: existing.pendingOrganizationProjectionJobKey }
      : {}),
    ...(existing?.firstShopId ? { firstShopId: existing.firstShopId } : {}),
    ...(existing?.secondShopId ? { secondShopId: existing.secondShopId } : {}),
    ...(existing?.firstShopAt ? { firstShopAt: existing.firstShopAt } : {}),
    ...(existing?.secondShopAt ? { secondShopAt: existing.secondShopAt } : {}),
    ...(existing?.secondShopFirstConfirmedAt
      ? { secondShopFirstConfirmedAt: existing.secondShopFirstConfirmedAt }
      : {}),
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsOrganizations", value);
  if (payload.change === "deleted") {
    await ensureOrganizationShopProjectionJob(ctx, generation, organizationId, eventKey, occurredAt);
  }

  if (payload.initialShop) {
    await applyShopEvent(ctx, generation, organizationId, payload.initialShop.shopId, occurredAt, {
      kind: "shop",
      change: "created",
      displayName: payload.initialShop.displayName,
      registeredAt: payload.initialShop.registeredAt,
      ...(payload.initialStaff
        ? {
            initialStaff: {
              staffId: payload.initialStaff.staffId,
              organizationPersonId: payload.initialStaff.organizationPersonId,
              validFrom: payload.initialStaff.validFrom,
              isShiftTarget: payload.initialStaff.isShiftTarget,
            },
          }
        : {}),
    });
  }
  if (payload.initialPersonId) {
    await applyPersonEvent(ctx, generation, organizationId, payload.initialPersonId, occurredAt, {
      kind: "person",
      status: "active",
      firstObservedAt: registeredAt,
    });
    await applyManagerMembership(ctx, generation, organizationId, {
      kind: "managerMembership",
      personId: payload.initialPersonId,
      status: "active",
      validFrom: registeredAt,
    });
  }
}

async function applyShopEvent(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  occurredAt: number,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "shop" }>,
) {
  const [existing, organization] = await Promise.all([
    ctx.db
      .query("analyticsShops")
      .withIndex("by_generation_and_shopId", (q) => q.eq("generation", generation).eq("shopId", shopId))
      .unique(),
    ctx.db
      .query("analyticsOrganizations")
      .withIndex("by_generation_and_organizationId", (q) =>
        q.eq("generation", generation).eq("organizationId", organizationId),
      )
      .unique(),
  ]);
  const registeredAt = payload.registeredAt ?? existing?.registeredAt ?? occurredAt;
  const deleted = payload.change === "deleted";
  const inactive = deleted || payload.change === "archived";
  const changesStatus = payload.change === "created" || inactive || payload.change === "reactivated";
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId,
    shopId,
    displayName: deleted ? "" : (payload.displayName ?? existing?.displayName ?? ""),
    registeredAt,
    ...(inactive
      ? { deletedAt: occurredAt }
      : payload.change === "updated" && existing?.deletedAt !== undefined
        ? { deletedAt: existing.deletedAt }
        : {}),
    ...(organization?.currentPlan ? { currentPlan: organization.currentPlan } : {}),
    ...(organization?.planEffectiveAt !== undefined ? { planEffectiveAt: organization.planEffectiveAt } : {}),
    ...(changesStatus
      ? { statusEffectiveAt: occurredAt }
      : existing?.statusEffectiveAt !== undefined
        ? { statusEffectiveAt: existing.statusEffectiveAt }
        : {}),
    ...(existing?.firstRecruitmentAt ? { firstRecruitmentAt: existing.firstRecruitmentAt } : {}),
    ...(existing?.firstSubmissionAt ? { firstSubmissionAt: existing.firstSubmissionAt } : {}),
    ...(existing?.firstConfirmedRecruitmentId
      ? { firstConfirmedRecruitmentId: existing.firstConfirmedRecruitmentId }
      : {}),
    ...(existing?.secondConfirmedRecruitmentId
      ? { secondConfirmedRecruitmentId: existing.secondConfirmedRecruitmentId }
      : {}),
    ...(existing?.firstConfirmedAt ? { firstConfirmedAt: existing.firstConfirmedAt } : {}),
    ...(existing?.secondConfirmedAt ? { secondConfirmedAt: existing.secondConfirmedAt } : {}),
    latestActivityAt: Math.max(existing?.latestActivityAt ?? 0, occurredAt),
    ...(existing?.estimatedCadenceDays ? { estimatedCadenceDays: existing.estimatedCadenceDays } : {}),
    cadenceConfidence: existing?.cadenceConfidence ?? "insufficientData",
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShops", value);
  await updateOrganizationShopMilestones(ctx, generation, organizationId, shopId, registeredAt, value.firstConfirmedAt);
  if (payload.initialStaff) {
    await applyStaffMembership(ctx, generation, organizationId, shopId, {
      kind: "staffMembership",
      staffId: payload.initialStaff.staffId,
      ...(payload.initialStaff.organizationPersonId
        ? { organizationPersonId: payload.initialStaff.organizationPersonId }
        : {}),
      status: "active",
      isShiftTarget: payload.initialStaff.isShiftTarget,
      validFrom: payload.initialStaff.validFrom,
      lineLinked: false,
      lineFollowing: false,
    });
  }
}

async function updateOrganizationShopMilestones(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  registeredAt: number,
  firstConfirmedAt?: number,
) {
  const organization = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId),
    )
    .unique();
  if (!organization) return;
  const candidates = [
    ...(organization.firstShopId && organization.firstShopAt
      ? [{ shopId: organization.firstShopId, registeredAt: organization.firstShopAt }]
      : []),
    ...(organization.secondShopId && organization.secondShopAt
      ? [{ shopId: organization.secondShopId, registeredAt: organization.secondShopAt }]
      : []),
    { shopId, registeredAt },
  ];
  const ordered = [...new Map(candidates.map((candidate) => [candidate.shopId, candidate])).values()].sort(
    (a, b) => a.registeredAt - b.registeredAt,
  );
  const first = ordered[0];
  const second = ordered[1];
  await ctx.db.patch(organization._id, {
    ...(first ? { firstShopId: first.shopId, firstShopAt: first.registeredAt } : {}),
    ...(second ? { secondShopId: second.shopId, secondShopAt: second.registeredAt } : {}),
    ...(second?.shopId === shopId && firstConfirmedAt !== undefined
      ? {
          secondShopFirstConfirmedAt: minDefined(organization.secondShopFirstConfirmedAt, firstConfirmedAt),
        }
      : {}),
    updatedAt: Date.now(),
  });
}

async function applyPersonEvent(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  personId: Id<"organizationPeople">,
  occurredAt: number,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "person" }>,
) {
  const existing = await ctx.db
    .query("analyticsPeople")
    .withIndex("by_generation_and_organizationPersonId", (q) =>
      q.eq("generation", generation).eq("organizationPersonId", personId),
    )
    .unique();
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId,
    organizationPersonId: personId,
    firstObservedAt: Math.min(existing?.firstObservedAt ?? payload.firstObservedAt, payload.firstObservedAt),
    ...(payload.status === "removed" ? { deletedAt: occurredAt } : {}),
    updatedAt: occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsPeople", value);
  if (payload.status === "removed") {
    const jobKey = `projection-person-memberships:${generation}:${personId}:${occurredAt}`;
    if (!(await getJobByKey(ctx, jobKey))) {
      await insertJob(ctx, {
        jobKey,
        jobType: "projection",
        generation,
        phase: "personMemberships",
        status: "pending",
        attemptCount: 0,
        nextRunAt: Date.now(),
        processedCount: 0,
        organizationId,
        organizationPersonId: personId,
        cutoffAt: occurredAt,
      });
    }
  }
}

async function applyManagerMembership(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "managerMembership" }>,
) {
  if (payload.personFirstObservedAt !== undefined) {
    await applyPersonEvent(ctx, generation, organizationId, payload.personId, payload.validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: payload.personFirstObservedAt,
    });
  }
  const membershipKey = `manager:${organizationId}:${payload.personId}`;
  const existing = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
      q.eq("generation", generation).eq("membershipKey", membershipKey),
    )
    .order("desc")
    .first();
  const changeAt = payload.status === "removed" ? (payload.validTo ?? payload.validFrom) : payload.validFrom;
  if (existing && existing.updatedAt > changeAt) return;
  if (payload.status === "removed") {
    if (existing && existing.validTo === undefined) {
      await ctx.db.patch(existing._id, {
        validTo: payload.validTo ?? payload.validFrom,
        updatedAt: payload.validTo ?? payload.validFrom,
      });
    }
    return;
  }
  if (existing && existing.validTo === undefined) return;
  await ctx.db.insert("analyticsMemberships", {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    membershipKey,
    organizationId,
    organizationPersonId: payload.personId,
    role: "manager",
    validFrom: payload.validFrom,
    isShiftTarget: false,
    lineLinked: false,
    lineFollowing: false,
    updatedAt: payload.validFrom,
  });
}

async function applyManagerMembershipExchange(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "managerMembershipExchange" }>,
) {
  if (payload.formerPersonId === payload.nextPersonId) {
    throw new Error("analytics_manager_exchange_same_person");
  }
  await applyManagerMembership(ctx, generation, organizationId, {
    kind: "managerMembership",
    personId: payload.formerPersonId,
    status: "removed",
    validFrom: payload.validFrom,
    validTo: payload.validFrom,
  });
  await applyManagerMembership(ctx, generation, organizationId, {
    kind: "managerMembership",
    personId: payload.nextPersonId,
    personFirstObservedAt: payload.nextPersonFirstObservedAt,
    status: "active",
    validFrom: payload.validFrom,
  });
}

async function applyStaffMembership(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "staffMembership" }>,
) {
  if (payload.organizationPersonId && payload.personFirstObservedAt !== undefined) {
    await applyPersonEvent(ctx, generation, organizationId, payload.organizationPersonId, payload.validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: payload.personFirstObservedAt,
    });
  }
  const membershipKey = `staff:${payload.staffId}`;
  const existing = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
      q.eq("generation", generation).eq("membershipKey", membershipKey),
    )
    .order("desc")
    .first();
  const changeAt = payload.status === "removed" ? (payload.validTo ?? payload.validFrom) : payload.validFrom;
  if (existing && existing.updatedAt > changeAt) return;
  const lineLinked = payload.lineLinked ?? (existing?.role === "staff" ? existing.lineLinked : false);
  const lineFollowing = payload.lineFollowing ?? (existing?.role === "staff" ? existing.lineFollowing : false);
  if (payload.status === "removed") {
    if (existing && existing.validTo === undefined) {
      await ctx.db.patch(existing._id, {
        validTo: payload.validTo ?? payload.validFrom,
        updatedAt: payload.validTo ?? payload.validFrom,
      });
    }
    return;
  }
  if (
    existing !== null &&
    existing.validTo === undefined &&
    existing.role === "staff" &&
    existing.isShiftTarget === payload.isShiftTarget &&
    existing.lineLinked === lineLinked &&
    existing.lineFollowing === lineFollowing
  ) {
    return;
  }
  if (existing && existing.validTo === undefined) {
    await ctx.db.patch(existing._id, { validTo: payload.validFrom, updatedAt: payload.validFrom });
  }
  await ctx.db.insert("analyticsMemberships", {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    membershipKey,
    organizationId,
    shopId,
    ...(payload.organizationPersonId ? { organizationPersonId: payload.organizationPersonId } : {}),
    staffId: payload.staffId,
    role: "staff",
    validFrom: payload.validFrom,
    isShiftTarget: payload.isShiftTarget,
    lineLinked,
    lineFollowing,
    updatedAt: payload.validFrom,
  });
  if (payload.organizationPersonId) {
    await applyPersonEvent(ctx, generation, organizationId, payload.organizationPersonId, payload.validFrom, {
      kind: "person",
      status: "active",
      firstObservedAt: payload.validFrom,
    });
  }
}

async function applyPlanEvent(
  ctx: MutationCtx,
  generation: string,
  event: Doc<"analyticsSourceEvents">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "plan" }>,
) {
  if (!event.organizationId) throw new Error("analytics_event_plan_scope_missing");
  await ensureOrganizationShopProjectionJob(
    ctx,
    generation,
    event.organizationId,
    event.eventKey,
    payload.effectiveAt,
    event._id,
    payload.billingVersion,
  );
}

async function ensureOrganizationShopProjectionJob(
  ctx: MutationCtx,
  generation: string,
  organizationId: Id<"organizations">,
  eventKey: string,
  cutoffAt: number,
  sourceEventId?: Id<"analyticsSourceEvents">,
  billingVersion?: number,
) {
  const jobKey = `projection-organization-shops:${generation}:${eventKey}`;
  if (await getJobByKey(ctx, jobKey)) return;
  const organization = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId),
    )
    .unique();
  if (!organization) throw new Error("analytics_organization_projection_scope_missing");
  await insertJob(ctx, {
    jobKey,
    jobType: "projection",
    generation,
    phase: "organizationShopSync",
    status: "pending",
    attemptCount: 0,
    nextRunAt: Date.now(),
    processedCount: 0,
    organizationId,
    cutoffAt,
    ...(sourceEventId ? { sourceEventId, batchOffset: 0 } : {}),
    ...(billingVersion !== undefined ? { billingVersion } : {}),
    ...(organization.pendingOrganizationProjectionJobKey
      ? { dependsOnJobKey: organization.pendingOrganizationProjectionJobKey }
      : {}),
  });
  await ctx.db.patch(organization._id, {
    pendingOrganizationProjectionJobKey: jobKey,
    updatedAt: Math.max(organization.updatedAt, cutoffAt),
  });
}

async function clearPendingOrganizationProjectionJob(ctx: MutationCtx, job: Job) {
  if (!job.organizationId) return;
  const organization = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", job.generation).eq("organizationId", job.organizationId as Id<"organizations">),
    )
    .unique();
  if (organization?.pendingOrganizationProjectionJobKey === job.jobKey) {
    await ctx.db.patch(organization._id, { pendingOrganizationProjectionJobKey: undefined });
  }
}

async function failOrganizationProjectionDependency(ctx: MutationCtx, job: Job) {
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: "failed",
    lastErrorCode: "analytics_organization_projection_dependency_failed",
    leaseToken: undefined,
    leaseUntil: undefined,
    updatedAt: now,
  });
  const state = await getPipelineState(ctx);
  if (state) await markPipelineDegraded(ctx, state, job.generation, now);
}

async function failProjectionJob(ctx: MutationCtx, job: Job, errorCode: string) {
  const now = Date.now();
  await ctx.db.patch(job._id, {
    status: "failed",
    lastErrorCode: errorCode,
    leaseToken: undefined,
    leaseUntil: undefined,
    updatedAt: now,
  });
  const state = await getPipelineState(ctx);
  if (state) await markPipelineDegraded(ctx, state, job.generation, now);
}

async function applyCycleEvent(
  ctx: MutationCtx,
  generation: string,
  event: Doc<"analyticsSourceEvents">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "cycle" }>,
) {
  const organizationId = event.organizationId as Id<"organizations">;
  const shopId = event.shopId as Id<"shops">;
  const recruitmentId = event.recruitmentId as Id<"recruitments">;
  const existing = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_generation_and_recruitmentId", (q) =>
      q.eq("generation", generation).eq("recruitmentId", recruitmentId),
    )
    .unique();
  const confirmedAt = payload.confirmedAt ?? existing?.confirmedAt;
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    recruitmentId,
    organizationId,
    shopId,
    ...(existing?.sequenceNumber ? { sequenceNumber: existing.sequenceNumber } : {}),
    createdAt: payload.createdAt,
    submitDeadlineAt: getDeadlineCutoff(payload.deadline),
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    ...(confirmedAt ? { confirmedAt, closedAt: confirmedAt } : {}),
    ...(payload.status === "deleted" ? { deletedAt: event.occurredAt } : {}),
    ...(existing?.targetAtDeadline !== undefined ? { targetAtDeadline: existing.targetAtDeadline } : {}),
    ...(existing?.submittedAtDeadline !== undefined ? { submittedAtDeadline: existing.submittedAtDeadline } : {}),
    ...(existing?.targetAtClose !== undefined ? { targetAtClose: existing.targetAtClose } : {}),
    ...(existing?.submittedAtClose !== undefined ? { submittedAtClose: existing.submittedAtClose } : {}),
    notificationSentCount: existing?.notificationSentCount ?? 0,
    notificationFailedCount: existing?.notificationFailedCount ?? 0,
    ...(existing?.lastNotificationFailedAt !== undefined
      ? { lastNotificationFailedAt: existing.lastNotificationFailedAt }
      : {}),
    reminderSentCount: existing?.reminderSentCount ?? 0,
    creationLeadTimeMs: getSubmitLinkCutoff(payload.periodStart) - payload.createdAt,
    ...(confirmedAt
      ? {
          confirmationLeadTimeMs: confirmedAt - payload.createdAt,
          confirmationSlackMs: getSubmitLinkCutoff(payload.periodStart) - confirmedAt,
          confirmedBeforeStart: confirmedAt <= getSubmitLinkCutoff(payload.periodStart),
        }
      : {}),
    completeness: existing?.completeness ?? ("unavailable" as const),
    ...(existing?.finalizedAt ? { finalizedAt: existing.finalizedAt } : {}),
    updatedAt: event.occurredAt,
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShiftCycles", value);
  await updateShopCycleMilestones(ctx, generation, shopId, recruitmentId, payload, event.occurredAt);
  if (payload.status === "deleted") {
    await cancelCycleJobs(ctx, generation, recruitmentId);
    return;
  }
  await ensureCycleFinalizationJob(ctx, {
    generation,
    organizationId,
    shopId,
    recruitmentId,
    cutoffKind: "deadline",
    cutoffAt: getDeadlineCutoff(payload.deadline),
  });
  await ensureCycleFinalizationJob(ctx, {
    generation,
    organizationId,
    shopId,
    recruitmentId,
    cutoffKind: "close",
    cutoffAt: confirmedAt ?? getSubmitLinkCutoff(payload.periodStart),
  });
}

async function updateShopCycleMilestones(
  ctx: MutationCtx,
  generation: string,
  shopId: Id<"shops">,
  recruitmentId: Id<"recruitments">,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "cycle" }>,
  occurredAt: number,
) {
  const shop = await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_shopId", (q) => q.eq("generation", generation).eq("shopId", shopId))
    .unique();
  if (!shop) return;
  const confirmations = [
    ...(shop.firstConfirmedRecruitmentId && shop.firstConfirmedAt !== undefined
      ? [{ recruitmentId: shop.firstConfirmedRecruitmentId, confirmedAt: shop.firstConfirmedAt }]
      : []),
    ...(shop.secondConfirmedRecruitmentId && shop.secondConfirmedAt !== undefined
      ? [{ recruitmentId: shop.secondConfirmedRecruitmentId, confirmedAt: shop.secondConfirmedAt }]
      : []),
    ...(payload.confirmedAt !== undefined ? [{ recruitmentId, confirmedAt: payload.confirmedAt }] : []),
  ];
  const earliestConfirmationByRecruitment = new Map<
    Id<"recruitments">,
    { recruitmentId: Id<"recruitments">; confirmedAt: number }
  >();
  for (const confirmation of confirmations) {
    const current = earliestConfirmationByRecruitment.get(confirmation.recruitmentId);
    if (!current || confirmation.confirmedAt < current.confirmedAt) {
      earliestConfirmationByRecruitment.set(confirmation.recruitmentId, confirmation);
    }
  }
  const distinctConfirmations = [...earliestConfirmationByRecruitment.values()].sort(
    (a, b) => a.confirmedAt - b.confirmedAt || String(a.recruitmentId).localeCompare(String(b.recruitmentId)),
  );
  const firstConfirmation = distinctConfirmations[0];
  const secondConfirmation = distinctConfirmations[1];
  await ctx.db.patch(shop._id, {
    firstRecruitmentAt: minDefined(shop.firstRecruitmentAt, payload.createdAt),
    ...(firstConfirmation
      ? {
          firstConfirmedRecruitmentId: firstConfirmation.recruitmentId,
          firstConfirmedAt: firstConfirmation.confirmedAt,
        }
      : {}),
    ...(secondConfirmation
      ? {
          secondConfirmedRecruitmentId: secondConfirmation.recruitmentId,
          secondConfirmedAt: secondConfirmation.confirmedAt,
        }
      : {}),
    latestActivityAt: Math.max(shop.latestActivityAt ?? 0, occurredAt),
    updatedAt: occurredAt,
  });
  await updateOrganizationShopMilestones(
    ctx,
    generation,
    shop.organizationId,
    shop.shopId,
    shop.registeredAt,
    firstConfirmation?.confirmedAt,
  );
}

async function applyFirstSubmissionEvent(
  ctx: MutationCtx,
  generation: string,
  shopId: Id<"shops">,
  firstSubmittedAt: number,
) {
  const shop = await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_shopId", (q) => q.eq("generation", generation).eq("shopId", shopId))
    .unique();
  if (!shop) return;
  await ctx.db.patch(shop._id, {
    firstSubmissionAt: minDefined(shop.firstSubmissionAt, firstSubmittedAt),
    latestActivityAt: Math.max(shop.latestActivityAt ?? 0, firstSubmittedAt),
    updatedAt: firstSubmittedAt,
  });
}

async function applyLineAccountEvent(
  ctx: MutationCtx,
  generation: string,
  payload: Extract<AnalyticsSourceEventPayload, { kind: "lineAccount" }>,
  occurredAt: number,
) {
  const existing = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
      q.eq("generation", generation).eq("membershipKey", `staff:${payload.staffId}`),
    )
    .order("desc")
    .first();
  if (existing?.role !== "staff" || existing.validTo !== undefined) return;
  if (existing.updatedAt > occurredAt) return;
  await applyStaffMembership(ctx, generation, existing.organizationId, existing.shopId, {
    kind: "staffMembership",
    staffId: existing.staffId,
    ...(existing.organizationPersonId ? { organizationPersonId: existing.organizationPersonId } : {}),
    status: "active",
    isShiftTarget: existing.isShiftTarget,
    validFrom: occurredAt,
    lineLinked: payload.linked,
    lineFollowing: payload.following,
  });
}

async function ensureCycleFinalizationJob(
  ctx: MutationCtx,
  args: {
    generation: string;
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    recruitmentId: Id<"recruitments">;
    cutoffKind: "deadline" | "close";
    cutoffAt: number;
  },
) {
  const jobKey = `cycle-finalize:${args.generation}:${args.recruitmentId}:${args.cutoffKind}`;
  const existing = await getJobByKey(ctx, jobKey);
  if (existing) {
    if (existing.cutoffAt !== args.cutoffAt) {
      const now = Date.now();
      await ctx.db.patch(existing._id, {
        cutoffAt: args.cutoffAt,
        phase: "resetOpportunities",
        cursor: undefined,
        aggregationPartial: undefined,
        status: "pending",
        attemptCount: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Math.max(args.cutoffAt, now),
        processedCount: 0,
        targetCount: 0,
        submittedCount: 0,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        lastNotificationFailedAt: undefined,
        lastErrorCode: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
    } else if (existing.status !== "completed" && existing.status !== "cancelled") {
      await ctx.db.patch(existing._id, {
        nextRunAt: Math.max(args.cutoffAt, Date.now()),
        updatedAt: Date.now(),
      });
    }
    return;
  }
  await insertJob(ctx, {
    jobKey,
    jobType: "cycleFinalization",
    generation: args.generation,
    phase: "opportunityTargets",
    status: "pending",
    attemptCount: 0,
    nextRunAt: args.cutoffAt,
    processedCount: 0,
    targetCount: 0,
    submittedCount: 0,
    notificationSentCount: 0,
    notificationFailedCount: 0,
    reminderSentCount: 0,
    organizationId: args.organizationId,
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    cutoffKind: args.cutoffKind,
    cutoffAt: args.cutoffAt,
  });
}

async function cancelCycleJobs(ctx: MutationCtx, generation: string, recruitmentId: Id<"recruitments">) {
  for (const cutoffKind of ["deadline", "close"] as const) {
    const job = await getJobByKey(ctx, `cycle-finalize:${generation}:${recruitmentId}:${cutoffKind}`);
    if (job && job.status !== "completed") {
      await ctx.db.patch(job._id, {
        status: "cancelled",
        leaseToken: undefined,
        leaseUntil: undefined,
        completedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  }
}

async function upsertOpportunity(
  ctx: MutationCtx,
  job: Job,
  staffId: Id<"staffs">,
  args: {
    organizationPersonId?: Id<"organizationPeople">;
    included: boolean;
    firstSubmittedAt?: number;
    lineLinked?: boolean;
  },
) {
  const recruitmentId = job.recruitmentId as Id<"recruitments">;
  const existing = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_generation_and_recruitmentId_and_staffId", (q) =>
      q.eq("generation", job.generation).eq("recruitmentId", recruitmentId).eq("staffId", staffId),
    )
    .unique();
  const targetedAtDeadline =
    job.cutoffKind === "deadline"
      ? args.included || Boolean(existing?.targetedAtDeadline)
      : Boolean(existing?.targetedAtDeadline);
  const targetedAtClose =
    job.cutoffKind === "close"
      ? args.included || Boolean(existing?.targetedAtClose)
      : Boolean(existing?.targetedAtClose);
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation: job.generation,
    recruitmentId,
    organizationId: job.organizationId as Id<"organizations">,
    shopId: job.shopId as Id<"shops">,
    staffId,
    ...((args.organizationPersonId ?? existing?.organizationPersonId)
      ? { organizationPersonId: args.organizationPersonId ?? existing?.organizationPersonId }
      : {}),
    targetedAtDeadline,
    targetedAtClose,
    ...((args.firstSubmittedAt ?? existing?.firstSubmittedAt)
      ? { firstSubmittedAt: args.firstSubmittedAt ?? existing?.firstSubmittedAt }
      : {}),
    ...((args.lineLinked ?? existing?.lineLinkedAtCutoff)
      ? { lineLinkedAtCutoff: args.lineLinked ?? existing?.lineLinkedAtCutoff }
      : {}),
    reminderCount: existing?.reminderCount ?? 0,
    completeness: "complete" as const,
    identityState: existing?.identityState ?? ("active" as const),
    expiresAt: Math.max(existing?.expiresAt ?? 0, (job.cutoffAt as number) + OPPORTUNITY_RETENTION_MS),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsShiftCycleOpportunities", value);
  return existing;
}

async function processCycleFinalizationPage(ctx: MutationCtx, job: Job) {
  if (!job.recruitmentId || !job.shopId || !job.organizationId || !job.cutoffKind || !job.cutoffAt) {
    throw new Error("analytics_cycle_job_scope_missing");
  }
  const cutoffAt = job.cutoffAt;
  switch (job.phase) {
    case "resetOpportunities": {
      if (!job.cursor) {
        const cycle = await ctx.db
          .query("analyticsShiftCycles")
          .withIndex("by_generation_and_recruitmentId", (q) =>
            q.eq("generation", job.generation).eq("recruitmentId", job.recruitmentId as Id<"recruitments">),
          )
          .unique();
        if (cycle) {
          await ctx.db.patch(cycle._id, {
            ...(job.cutoffKind === "deadline"
              ? { targetAtDeadline: undefined, submittedAtDeadline: undefined }
              : {
                  targetAtClose: undefined,
                  submittedAtClose: undefined,
                  notificationSentCount: 0,
                  notificationFailedCount: 0,
                  reminderSentCount: 0,
                  lastNotificationFailedAt: undefined,
                }),
            completeness: "partial",
            finalizedAt: undefined,
            updatedAt: Date.now(),
          });
        }
      }
      const page = await ctx.db
        .query("analyticsShiftCycleOpportunities")
        .withIndex("by_generation_and_recruitmentId_and_staffId", (q) =>
          q.eq("generation", job.generation).eq("recruitmentId", job.recruitmentId as Id<"recruitments">),
        )
        .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const opportunity of page.page) {
        await ctx.db.patch(opportunity._id, {
          ...(job.cutoffKind === "deadline" ? { targetedAtDeadline: false } : { targetedAtClose: false }),
        });
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "opportunityTargets" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "opportunityTargets": {
      const page = await ctx.db
        .query("analyticsMemberships")
        .withIndex("by_generation_and_shopId_and_role_and_validFrom", (q) =>
          q.eq("generation", job.generation).eq("shopId", job.shopId).eq("role", "staff").lte("validFrom", cutoffAt),
        )
        .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
      let targetCount = job.targetCount ?? 0;
      let submittedCount = job.submittedCount ?? 0;
      for (const membership of page.page) {
        if (membership.role !== "staff" || !membership.isShiftTarget || !activeAt(membership, cutoffAt)) continue;
        const submission = await ctx.db
          .query("shiftSubmissions")
          .withIndex("by_recruitmentId_staffId", (q) =>
            q.eq("recruitmentId", job.recruitmentId as Id<"recruitments">).eq("staffId", membership.staffId),
          )
          .unique();
        const firstSubmittedAt = submission?.firstSubmittedAt ?? submission?.submittedAt;
        const submitted = firstSubmittedAt !== undefined && firstSubmittedAt < cutoffAt;
        const includedBefore = await upsertOpportunity(ctx, job, membership.staffId, {
          ...(membership.organizationPersonId ? { organizationPersonId: membership.organizationPersonId } : {}),
          included: true,
          ...(submitted ? { firstSubmittedAt } : {}),
          lineLinked: membership.lineLinked,
        });
        const alreadyIncluded =
          job.cutoffKind === "deadline"
            ? Boolean(includedBefore?.targetedAtDeadline)
            : Boolean(includedBefore?.targetedAtClose);
        if (!alreadyIncluded) {
          targetCount += 1;
          if (submitted) submittedCount += 1;
        }
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "opportunitySubmissions" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
        targetCount,
        submittedCount,
      });
      return;
    }
    case "opportunitySubmissions": {
      const page = await ctx.db
        .query("shiftSubmissions")
        .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", job.recruitmentId as Id<"recruitments">))
        .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
      let targetCount = job.targetCount ?? 0;
      let submittedCount = job.submittedCount ?? 0;
      for (const submission of page.page) {
        const firstSubmittedAt = submission.firstSubmittedAt ?? submission.submittedAt;
        if (firstSubmittedAt >= cutoffAt) continue;
        const existing = await ctx.db
          .query("analyticsShiftCycleOpportunities")
          .withIndex("by_generation_and_recruitmentId_and_staffId", (q) =>
            q
              .eq("generation", job.generation)
              .eq("recruitmentId", job.recruitmentId as Id<"recruitments">)
              .eq("staffId", submission.staffId),
          )
          .unique();
        const alreadyIncluded =
          job.cutoffKind === "deadline" ? Boolean(existing?.targetedAtDeadline) : Boolean(existing?.targetedAtClose);
        await upsertOpportunity(ctx, job, submission.staffId, { included: true, firstSubmittedAt });
        if (!alreadyIncluded) {
          targetCount += 1;
          submittedCount += 1;
        }
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? (job.cutoffKind === "close" ? "notificationRollup" : "finalizeCycle") : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
        targetCount,
        submittedCount,
      });
      return;
    }
    case "notificationRollup": {
      const cycle = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_recruitmentId", (q) =>
          q.eq("generation", job.generation).eq("recruitmentId", job.recruitmentId as Id<"recruitments">),
        )
        .unique();
      if (!cycle) throw new Error("analytics_cycle_missing");
      const state = await getPipelineState(ctx);
      const cutoffDate = dateJST(Math.max(cycle.createdAt, cutoffAt - 1));
      const isActive = state?.activeGeneration === job.generation;
      const isBuilding = state?.buildingGeneration === job.generation;
      const notificationCompleteDate = isBuilding
        ? state?.buildingNotificationCompleteDate
        : isActive
          ? state?.activeNotificationCompleteDate
          : undefined;
      const notificationCompleteAt = isBuilding
        ? state?.buildingNotificationCompleteAt
        : isActive
          ? state?.activeNotificationCompleteAt
          : undefined;
      if (
        !state ||
        (!isActive && !isBuilding) ||
        !notificationCompleteDate ||
        notificationCompleteDate < cutoffDate ||
        (notificationCompleteDate === cutoffDate && (notificationCompleteAt ?? 0) < cutoffAt)
      ) {
        await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
        return;
      }
      const generationDataStartDate = isBuilding ? state.buildingDataStartDate : state.dataStartDate;
      if (!generationDataStartDate) throw new Error("analytics_generation_data_start_missing");
      const dataStartAt = jstDayRangeMs(generationDataStartDate).startMs;
      const fromDate = dateJST(Math.max(cycle.createdAt, dataStartAt));
      const page = await ctx.db
        .query("analyticsDailyNotificationKpis")
        .withIndex("by_generation_and_recruitmentId_and_snapshotDate", (q) =>
          q
            .eq("generation", job.generation)
            .eq("recruitmentId", job.recruitmentId as Id<"recruitments">)
            .gte("snapshotDate", fromDate)
            .lte("snapshotDate", cutoffDate),
        )
        .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
      let sent = job.notificationSentCount ?? 0;
      let failed = job.notificationFailedCount ?? 0;
      let reminders = job.reminderSentCount ?? 0;
      let lastNotificationFailedAt = job.lastNotificationFailedAt;
      let partial = (job.aggregationPartial ?? false) || cycle.createdAt < dataStartAt;
      for (const row of page.page) {
        if (row.completeness !== "complete") partial = true;
        sent += row.sentCount;
        failed += row.failedCount;
        if (row.kind === "reminder") reminders += row.sentCount;
        if (row.lastFailedAt !== undefined) {
          lastNotificationFailedAt = Math.max(lastNotificationFailedAt ?? 0, row.lastFailedAt);
        }
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "finalizeCycle" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
        aggregationPartial: partial,
        notificationSentCount: sent,
        notificationFailedCount: failed,
        reminderSentCount: reminders,
        ...(lastNotificationFailedAt === undefined ? {} : { lastNotificationFailedAt }),
      });
      return;
    }
    case "finalizeCycle": {
      const cycle = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_recruitmentId", (q) =>
          q.eq("generation", job.generation).eq("recruitmentId", job.recruitmentId as Id<"recruitments">),
        )
        .unique();
      if (!cycle || cycle.deletedAt) {
        await completeJob(ctx, job);
        return;
      }
      const target = job.targetCount ?? 0;
      const submitted = job.submittedCount ?? 0;
      if (submitted > target) throw new Error("analytics_cycle_submitted_exceeds_target");
      const patch =
        job.cutoffKind === "deadline"
          ? { targetAtDeadline: target, submittedAtDeadline: submitted }
          : { targetAtClose: target, submittedAtClose: submitted };
      const hasDeadline = job.cutoffKind === "deadline" || cycle.targetAtDeadline !== undefined;
      const hasClose = job.cutoffKind === "close" || cycle.targetAtClose !== undefined;
      const complete = hasDeadline && hasClose && !job.aggregationPartial;
      const state = await getPipelineState(ctx);
      const generationDataStartDate =
        state?.buildingGeneration === job.generation
          ? state.buildingDataStartDate
          : state?.activeGeneration === job.generation
            ? state.dataStartDate
            : undefined;
      const predatesGeneration =
        generationDataStartDate !== undefined && cycle.createdAt < jstDayRangeMs(generationDataStartDate).startMs;
      const completeness: Completeness = complete ? "complete" : predatesGeneration ? "unavailable" : "partial";
      await ctx.db.patch(cycle._id, {
        ...patch,
        ...(job.cutoffKind === "close"
          ? {
              notificationSentCount: job.notificationSentCount ?? 0,
              notificationFailedCount: job.notificationFailedCount ?? 0,
              lastNotificationFailedAt: job.lastNotificationFailedAt,
              reminderSentCount: job.reminderSentCount ?? 0,
            }
          : {}),
        completeness,
        ...(complete ? { finalizedAt: Date.now() } : {}),
        updatedAt: Date.now(),
      });
      await completeJob(ctx, job);
      return;
    }
    default:
      throw new Error("analytics_cycle_job_phase_invalid");
  }
}

async function startDailyAggregationCore(
  ctx: MutationCtx,
  date: string,
  generation: string,
  failIfProjectionIsBehind: boolean,
) {
  const state = await getPipelineState(ctx);
  const generationDataStartDate =
    state?.buildingGeneration === generation
      ? state.buildingDataStartDate
      : state?.activeGeneration === generation
        ? state.dataStartDate
        : undefined;
  if (!state || !generationDataStartDate) {
    if (failIfProjectionIsBehind) throw new ConvexError("Analytics generation is not initialized");
    return null;
  }
  if (date < generationDataStartDate) {
    throw new ConvexError("Analytics snapshot date precedes dataStartDate");
  }
  const jobKey = `daily:${generation}:${date}`;
  const existing = await getJobByKey(ctx, jobKey);
  const now = Date.now();
  const isInitialBuildingBaseline =
    state.buildingGeneration === generation && state.buildingDataStartDate === date && !existing;
  if (date >= todayJST() && !isInitialBuildingBaseline) {
    if (failIfProjectionIsBehind) throw new ConvexError("Analytics daily snapshot requires a completed JST date");
    return null;
  }
  if (existing?.status === "pending" || existing?.status === "processing") return existing._id;
  if (await hasOtherRunningDailyJob(ctx, generation, jobKey)) {
    if (failIfProjectionIsBehind) throw new ConvexError("Another analytics daily snapshot is running");
    return null;
  }
  const buildingReady =
    state.buildingGeneration !== generation || (state.status === "ready" && state.buildingCaughtUpAt !== undefined);
  const backlog = await ctx.db.query("analyticsSourceEvents").paginate({
    numItems: 1,
    cursor: state.sourceEventCursor ?? null,
  });
  const projectionJobsBlocked = await hasBlockingProjectionJobs(ctx, generation);
  if (
    !buildingReady ||
    !state.projectionCaughtUpAt ||
    backlog.page.length > 0 ||
    !backlog.isDone ||
    projectionJobsBlocked
  ) {
    if (failIfProjectionIsBehind) throw new ConvexError("Analytics source events are not caught up");
    return null;
  }
  const sourceWatermarkAt = now;
  if (
    existing ||
    (state.activeGeneration === generation &&
      state.latestCompleteSnapshotDate !== undefined &&
      date <= state.latestCompleteSnapshotDate)
  ) {
    await demoteDailySnapshotForRerun(ctx, state, generation, date, now);
  }
  if (existing) {
    await ctx.db.patch(existing._id, {
      phase: "notificationReset",
      cursor: undefined,
      parentCursor: undefined,
      sourceWatermarkAt,
      shopId: undefined,
      organizationId: undefined,
      aggregationPartial: undefined,
      confirmationLeadTimeCount: undefined,
      confirmationLeadTimeRankOffset: undefined,
      confirmationLeadTimeMedianLowerMs: undefined,
      confirmationLeadTimeMedianUpperMs: undefined,
      confirmationLeadTimeP90Ms: undefined,
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: now,
      processedCount: 0,
      lastErrorCode: undefined,
      completedAt: undefined,
      updatedAt: now,
    });
    await scheduleRecovery(ctx);
    return existing._id;
  }
  const jobId = await insertJob(ctx, {
    jobKey,
    jobType: "daily",
    generation,
    targetDate: date,
    phase: "notificationReset",
    sourceWatermarkAt,
    status: "pending",
    attemptCount: 0,
    nextRunAt: now,
    processedCount: 0,
  });
  await scheduleRecovery(ctx);
  return jobId;
}

export const startDeferredDailyAggregation = internalMutation({
  args: { date: v.string(), generation: v.string() },
  handler: async (ctx, args) => {
    await startDailyAggregationCore(ctx, args.date, args.generation, false);
    return null;
  },
});

async function hasOtherRunningDailyJob(ctx: QueryCtx | MutationCtx, generation: string, ownJobKey: string) {
  for (const status of ["pending", "processing"] as const) {
    const job = await ctx.db
      .query("analyticsAggregationJobs")
      .withIndex("by_generation_and_jobType_and_status", (q) =>
        q.eq("generation", generation).eq("jobType", "daily").eq("status", status),
      )
      .filter((q) => q.neq(q.field("jobKey"), ownJobKey))
      .first();
    if (job) return true;
  }
  return false;
}

async function hasBlockingProjectionJobs(ctx: QueryCtx | MutationCtx, generation: string) {
  const failed = await ctx.db
    .query("analyticsAggregationJobs")
    .withIndex("by_generation_and_jobType_and_status", (q) =>
      q.eq("generation", generation).eq("jobType", "projection").eq("status", "failed"),
    )
    .first();
  if (failed) return true;
  const mainProjectionJobKey = `projection:${ANALYTICS_PIPELINE_KEY}`;
  for (const status of ["pending", "processing"] as const) {
    const child = await ctx.db
      .query("analyticsAggregationJobs")
      .withIndex("by_generation_and_jobType_and_status", (q) =>
        q.eq("generation", generation).eq("jobType", "projection").eq("status", status),
      )
      .filter((q) => q.neq(q.field("jobKey"), mainProjectionJobKey))
      .first();
    if (child) return true;
  }
  return false;
}

async function demoteDailySnapshotForRerun(
  ctx: MutationCtx,
  state: PipelineState,
  generation: string,
  date: string,
  now: number,
) {
  const service = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", generation).eq("snapshotDate", date))
    .unique();
  if (service) await ctx.db.patch(service._id, { completeness: "partial", computedAt: now });
  if (
    state.activeGeneration !== generation ||
    !state.latestCompleteSnapshotDate ||
    date > state.latestCompleteSnapshotDate
  ) {
    return;
  }
  const previousDate = addDays(date, -1);
  const previous =
    state.dataStartDate && previousDate >= state.dataStartDate
      ? await ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_generation_and_snapshotDate", (q) =>
            q.eq("generation", generation).eq("snapshotDate", previousDate),
          )
          .unique()
      : null;
  await ctx.db.patch(state._id, {
    latestCompleteSnapshotDate: previous?.completeness === "complete" ? previous.snapshotDate : undefined,
    latestCompleteSnapshotAt: previous?.completeness === "complete" ? previous.computedAt : undefined,
    updatedAt: now,
  });
}

export const startDailyAggregation = internalMutation({
  args: { date: v.string(), generation: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date) || args.date >= todayJST()) {
      throw new ConvexError("Invalid analytics snapshot date");
    }
    const state = await getPipelineState(ctx);
    const generation = args.generation ?? state?.activeGeneration ?? state?.buildingGeneration;
    if (!generation) throw new ConvexError("Analytics generation is not initialized");
    const jobId = await startDailyAggregationCore(ctx, args.date, generation, true);
    if (!jobId) throw new ConvexError("Analytics source events are not caught up");
    return { jobId, generation, date: args.date };
  },
});

export const schedulePreviousDay = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await getPipelineState(ctx);
    if (state?.activeGeneration) {
      await startDailyAggregationCore(ctx, addDays(todayJST(), -1), state.activeGeneration, false);
    }
    return null;
  },
});

async function processDailyPage(ctx: MutationCtx, job: Job) {
  if (!job.targetDate) throw new Error("analytics_daily_target_missing");
  switch (job.phase) {
    case "notificationReset":
      await resetDailyNotificationRows(ctx, job);
      return;
    case "notificationSent":
      await aggregateDailyNotificationRows(ctx, job, "sent");
      return;
    case "notificationFailed":
      await aggregateDailyNotificationRows(ctx, job, "failed");
      return;
    case "notificationFinalize":
      await finalizeDailyNotificationRows(ctx, job);
      return;
    case "cycleWait":
      await waitForDailyCycleFinalizations(ctx, job);
      return;
    case "shopSnapshots": {
      const page = await ctx.db
        .query("analyticsShops")
        .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
        .paginate({ numItems: 1, cursor: job.cursor ?? null });
      const shop = page.page[0];
      if (!shop) {
        await requeueJob(ctx, job, { phase: "organizationSnapshots", cursor: undefined });
        return;
      }
      const endMs = dailySnapshotEndMs(job);
      if (shop.registeredAt >= endMs || (shop.deletedAt !== undefined && shop.deletedAt < endMs)) {
        const stale = await getDailyShopSnapshot(ctx, job.generation, job.targetDate, shop.shopId);
        if (stale) await ctx.db.delete(stale._id);
        await requeueJob(ctx, job, {
          phase: page.isDone ? "organizationSnapshots" : "shopSnapshots",
          cursor: page.isDone ? undefined : page.continueCursor,
          processedDelta: 1,
        });
        return;
      }
      const existing = await getDailyShopSnapshot(ctx, job.generation, job.targetDate, shop.shopId);
      const value = emptyDailyShopSnapshot(job.generation, job.targetDate, shop, endMs);
      if (existing) await ctx.db.replace(existing._id, value);
      else await ctx.db.insert("analyticsDailyShopKpis", value);
      await requeueJob(ctx, job, {
        phase: "shopStaff",
        cursor: undefined,
        parentCursor: page.continueCursor,
        shopId: shop.shopId,
        organizationId: shop.organizationId,
        aggregationPartial: shop.updatedAt >= endMs,
        processedDelta: 1,
      });
      return;
    }
    case "shopStaff":
      await processDailyShopStaffPage(ctx, job);
      return;
    case "shopManagers":
      await processDailyShopManagerPage(ctx, job);
      return;
    case "shopCycles":
      await processDailyShopCyclePage(ctx, job);
      return;
    case "shopConfirmationLeadTimeQuantiles":
      await processDailyShopConfirmationLeadTimeQuantilePage(ctx, job);
      return;
    case "shopNotifications":
      await processDailyShopNotificationPage(ctx, job);
      return;
    case "shopFinalize":
      await finalizeDailyShop(ctx, job);
      return;
    case "organizationSnapshots":
      await selectDailyOrganization(ctx, job);
      return;
    case "organizationShops":
      await processDailyOrganizationShopPage(ctx, job);
      return;
    case "organizationPeople":
      await processDailyOrganizationPeoplePage(ctx, job);
      return;
    case "organizationManagers":
      await processDailyOrganizationManagerPage(ctx, job);
      return;
    case "organizationFinalize":
      await finishDailyOrganization(ctx, job);
      return;
    case "segmentInit":
      await initializeDailySegments(ctx, job);
      return;
    case "segmentSnapshots":
      await rollupDailySegmentPage(ctx, job);
      return;
    case "segmentFinalize":
      await finalizeDailySegmentPage(ctx, job);
      return;
    case "serviceInit":
      await initializeDailyService(ctx, job);
      return;
    case "serviceSnapshot":
      await rollupDailyServicePage(ctx, job);
      return;
    case "serviceFinalize":
      await finalizeDailyService(ctx, job);
      return;
    case "invariantWait":
      await waitForDailyInvariant(ctx, job);
      return;
    case "finalizeSnapshot": {
      await publishDailySnapshot(ctx, job);
      return;
    }
    default:
      throw new Error("analytics_daily_phase_invalid");
  }
}

type AnalyticsNotificationKind = "recruitment" | "reminder" | "confirmation" | "other";
type DailyNotificationAggregate = {
  scope: "service" | "shop" | "recruitment";
  scopeKey: string;
  cycle?: Doc<"analyticsShiftCycles">;
  organizationId?: Id<"organizations">;
  shopId?: Id<"shops">;
  channel: "email" | "line";
  kind: AnalyticsNotificationKind;
  sentCount: number;
  failedCount: number;
  lastFailedAt?: number;
};

function analyticsNotificationKind(notificationContext: string | undefined): AnalyticsNotificationKind {
  const context = notificationContext?.toLowerCase() ?? "";
  if (context.includes("reminder")) return "reminder";
  if (context.includes("confirmation") || context.includes("reissue")) return "confirmation";
  if (context.includes("recruitment")) return "recruitment";
  return "other";
}

async function resetDailyNotificationRows(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null });
  for (const row of page.page) await ctx.db.delete(row._id);
  await requeueJob(ctx, job, {
    phase: page.isDone ? "notificationSent" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function aggregateDailyNotificationRows(ctx: MutationCtx, job: Job, status: "sent" | "failed") {
  if (!job.targetDate) throw new Error("analytics_daily_target_missing");
  const { startMs } = jstDayRangeMs(job.targetDate);
  const endMs = dailySnapshotEndMs(job);
  const page =
    status === "sent"
      ? await ctx.db
          .query("notificationOutbox")
          .withIndex("by_status_sentAt", (q) => q.eq("status", "sent").gte("sentAt", startMs).lt("sentAt", endMs))
          .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null })
      : await ctx.db
          .query("notificationOutbox")
          .withIndex("by_status_failedAt", (q) =>
            q.eq("status", "failed").gte("failedAt", startMs).lt("failedAt", endMs),
          )
          .paginate({ numItems: EVENT_PAGE_SIZE, cursor: job.cursor ?? null });
  const aggregates = new Map<string, DailyNotificationAggregate>();
  const addAggregate = (
    scope: "service" | "shop" | "recruitment",
    scopeKey: string,
    channel: "email" | "line",
    kind: AnalyticsNotificationKind,
    occurredAt: number,
    cycle?: Doc<"analyticsShiftCycles">,
    organizationId?: Id<"organizations">,
    shopId?: Id<"shops">,
  ) => {
    const key = `${scopeKey}:${channel}:${kind}`;
    const aggregate = aggregates.get(key) ?? {
      scope,
      scopeKey,
      ...(cycle ? { cycle } : {}),
      ...(organizationId ? { organizationId } : {}),
      ...(shopId ? { shopId } : {}),
      channel,
      kind,
      sentCount: 0,
      failedCount: 0,
    };
    if (status === "sent") aggregate.sentCount += 1;
    else {
      aggregate.failedCount += 1;
      aggregate.lastFailedAt = Math.max(aggregate.lastFailedAt ?? 0, occurredAt);
    }
    aggregates.set(key, aggregate);
  };
  for (const notification of page.page) {
    const occurredAt = status === "sent" ? notification.sentAt : notification.failedAt;
    if (occurredAt === undefined) continue;
    const kind = analyticsNotificationKind(notification.notificationContext);
    addAggregate("service", "service", notification.channel, kind, occurredAt);
    if (notification.shopId) {
      addAggregate(
        "shop",
        `shop:${notification.shopId}`,
        notification.channel,
        kind,
        occurredAt,
        undefined,
        notification.organizationId,
        notification.shopId,
      );
    }
    if (!notification.recruitmentId) continue;
    const cycle = await ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_generation_and_recruitmentId", (q) =>
        q.eq("generation", job.generation).eq("recruitmentId", notification.recruitmentId as Id<"recruitments">),
      )
      .unique();
    if (!cycle || cycle.deletedAt !== undefined) continue;
    const closeCutoffAt = cycle.confirmedAt ?? getSubmitLinkCutoff(cycle.periodStart);
    if (occurredAt < cycle.createdAt || occurredAt >= closeCutoffAt) continue;
    addAggregate("recruitment", `recruitment:${cycle.recruitmentId}`, notification.channel, kind, occurredAt, cycle);
  }
  for (const aggregate of aggregates.values()) {
    await upsertDailyNotificationRow(ctx, job, aggregate);
  }
  await requeueJob(ctx, job, {
    phase: page.isDone ? (status === "sent" ? "notificationFailed" : "notificationFinalize") : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function upsertDailyNotificationRow(ctx: MutationCtx, job: Job, aggregate: DailyNotificationAggregate) {
  const existing = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_gen_date_scope_channel_kind", (q) =>
      q
        .eq("generation", job.generation)
        .eq("snapshotDate", job.targetDate as string)
        .eq("scopeKey", aggregate.scopeKey)
        .eq("channel", aggregate.channel)
        .eq("kind", aggregate.kind),
    )
    .unique();
  const lastFailedAt =
    existing?.lastFailedAt === undefined
      ? aggregate.lastFailedAt
      : aggregate.lastFailedAt === undefined
        ? existing.lastFailedAt
        : Math.max(existing.lastFailedAt, aggregate.lastFailedAt);
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation: job.generation,
    snapshotDate: job.targetDate as string,
    scope: aggregate.scope,
    scopeKey: aggregate.scopeKey,
    ...(aggregate.cycle
      ? {
          recruitmentId: aggregate.cycle.recruitmentId,
          organizationId: aggregate.cycle.organizationId,
          shopId: aggregate.cycle.shopId,
        }
      : {}),
    ...(!aggregate.cycle && aggregate.shopId
      ? {
          ...(aggregate.organizationId ? { organizationId: aggregate.organizationId } : {}),
          shopId: aggregate.shopId,
        }
      : {}),
    channel: aggregate.channel,
    kind: aggregate.kind,
    sentCount: (existing?.sentCount ?? 0) + aggregate.sentCount,
    failedCount: (existing?.failedCount ?? 0) + aggregate.failedCount,
    ...(lastFailedAt === undefined ? {} : { lastFailedAt }),
    completeness: "partial" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailyNotificationKpis", value);
}

async function finalizeDailyNotificationRows(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null });
  for (const row of page.page) {
    await ctx.db.patch(row._id, { completeness: "complete", computedAt: Date.now() });
  }
  if (page.isDone) await publishDailyNotificationWatermark(ctx, job);
  await requeueJob(ctx, job, {
    phase: page.isDone ? "cycleWait" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function waitForDailyCycleFinalizations(ctx: MutationCtx, job: Job) {
  const endMs = dailySnapshotEndMs(job);
  const findDueJob = async (status: "pending" | "processing" | "failed") =>
    await ctx.db
      .query("analyticsAggregationJobs")
      .withIndex("by_generation_and_jobType_and_status_and_cutoffAt", (q) =>
        q
          .eq("generation", job.generation)
          .eq("jobType", "cycleFinalization")
          .eq("status", status)
          .lt("cutoffAt", endMs),
      )
      .first();
  const [pending, processing, failed] = await Promise.all([
    findDueJob("pending"),
    findDueJob("processing"),
    findDueJob("failed"),
  ]);
  if (pending || processing) {
    await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
    return;
  }
  await requeueJob(ctx, job, {
    phase: "shopSnapshots",
    cursor: undefined,
    aggregationPartial: Boolean(failed),
  });
}

async function publishDailyNotificationWatermark(ctx: MutationCtx, job: Job) {
  if (!job.targetDate || !job.sourceWatermarkAt) throw new Error("analytics_daily_watermark_missing");
  const state = await getPipelineState(ctx);
  if (!state) throw new Error("analytics_pipeline_state_missing");
  const isActive = state.activeGeneration === job.generation;
  const isBuilding = state.buildingGeneration === job.generation;
  if (!isActive && !isBuilding) return;
  const currentDate = isBuilding ? state.buildingNotificationCompleteDate : state.activeNotificationCompleteDate;
  const dataStartDate = isBuilding ? state.buildingDataStartDate : state.dataStartDate;
  if (!dataStartDate) throw new Error("analytics_generation_data_start_missing");
  const nextDate = currentDate ? addDays(currentDate, 1) : dataStartDate;
  if (job.targetDate === currentDate || job.targetDate === nextDate) {
    await ctx.db.patch(state._id, {
      ...(isBuilding
        ? {
            buildingNotificationCompleteDate: job.targetDate,
            buildingNotificationCompleteAt: job.sourceWatermarkAt,
          }
        : {
            activeNotificationCompleteDate: job.targetDate,
            activeNotificationCompleteAt: job.sourceWatermarkAt,
          }),
      updatedAt: Date.now(),
    });
  } else if (isActive && (!currentDate || job.targetDate > currentDate)) {
    await markPipelineDegraded(ctx, state, job.generation);
  }
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2 : ordered[middle];
}

async function getDailyShopSnapshot(
  ctx: QueryCtx | MutationCtx,
  generation: string,
  snapshotDate: string,
  shopId: Id<"shops">,
) {
  return await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
      q.eq("generation", generation).eq("shopId", shopId).eq("snapshotDate", snapshotDate),
    )
    .unique();
}

function emptyDailyShopSnapshot(generation: string, snapshotDate: string, shop: Doc<"analyticsShops">, endMs: number) {
  return {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation,
    organizationId: shop.organizationId,
    shopId: shop.shopId,
    snapshotDate,
    staffMembershipCount: 0,
    shiftTargetCount: 0,
    uniquePersonCount: 0,
    unlinkedStaffCount: 0,
    managerMembershipCount: 0,
    managerStaffCount: 0,
    lineLinkedCount: 0,
    lineFollowingCount: 0,
    hasRecentActivity: false,
    cycleCount: 0,
    confirmedCycleCount: 0,
    confirmedBeforeStartCycleCount: 0,
    issueHealthSignalCount: 0,
    milestoneDates: {
      registeredAt: shop.registeredAt,
      ...(shop.firstRecruitmentAt !== undefined && shop.firstRecruitmentAt < endMs
        ? { firstRecruitmentAt: shop.firstRecruitmentAt }
        : {}),
      ...(shop.firstSubmissionAt !== undefined && shop.firstSubmissionAt < endMs
        ? { firstSubmissionAt: shop.firstSubmissionAt }
        : {}),
      ...(shop.firstConfirmedAt !== undefined && shop.firstConfirmedAt < endMs
        ? { firstConfirmedAt: shop.firstConfirmedAt }
        : {}),
      ...(shop.secondConfirmedAt !== undefined && shop.secondConfirmedAt < endMs
        ? { secondConfirmedAt: shop.secondConfirmedAt }
        : {}),
    },
    healthSignals: [],
    cadence: { kind: "insufficientData" as const },
    northStar: emptyRatePair(),
    deadlineSubmission: emptyRatePair(),
    finalSubmission: emptyRatePair(),
    cumulativeDeadlineSubmission: emptyRatePair(),
    cumulativeFinalSubmission: emptyRatePair(),
    cumulativeNotificationSentCount: 0,
    cumulativeNotificationFailedCount: 0,
    completeness: "partial" as const,
    computedAt: Date.now(),
  };
}

async function requireDailyShopSnapshot(ctx: MutationCtx, job: Job) {
  if (!job.targetDate || !job.shopId) throw new Error("analytics_daily_shop_scope_missing");
  const snapshot = await getDailyShopSnapshot(ctx, job.generation, job.targetDate, job.shopId);
  if (!snapshot) throw new Error("analytics_daily_shop_snapshot_missing");
  return snapshot;
}

async function processDailyShopStaffPage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_shopId_and_role_and_validFrom", (q) =>
      q.eq("generation", job.generation).eq("shopId", job.shopId).eq("role", "staff").lte("validFrom", endMs),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  let staffCount = 0;
  let shiftTargetCount = 0;
  let uniquePersonCount = 0;
  let unlinkedStaffCount = 0;
  let lineLinkedCount = 0;
  let lineFollowingCount = 0;
  for (const membership of page.page) {
    if (membership.role !== "staff" || !activeAt(membership, endMs)) continue;
    staffCount += 1;
    if (membership.isShiftTarget) {
      shiftTargetCount += 1;
      if (membership.lineLinked) lineLinkedCount += 1;
      if (membership.lineFollowing) lineFollowingCount += 1;
    }
    if (membership.organizationPersonId) uniquePersonCount += 1;
    else unlinkedStaffCount += 1;
  }
  await ctx.db.patch(snapshot._id, {
    staffMembershipCount: snapshot.staffMembershipCount + staffCount,
    shiftTargetCount: snapshot.shiftTargetCount + shiftTargetCount,
    uniquePersonCount: snapshot.uniquePersonCount + uniquePersonCount,
    unlinkedStaffCount: snapshot.unlinkedStaffCount + unlinkedStaffCount,
    lineLinkedCount: snapshot.lineLinkedCount + lineLinkedCount,
    lineFollowingCount: snapshot.lineFollowingCount + lineFollowingCount,
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "shopManagers" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function processDailyShopManagerPage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_organizationId_and_role_and_validFrom", (q) =>
      q
        .eq("generation", job.generation)
        .eq("organizationId", job.organizationId as Id<"organizations">)
        .eq("role", "manager")
        .lte("validFrom", endMs),
    )
    .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
  let managerCount = 0;
  let managerStaffCount = 0;
  let partial = job.aggregationPartial ?? false;
  for (const membership of page.page) {
    if (!activeAt(membership, endMs)) continue;
    managerCount += 1;
    const staffMemberships = await ctx.db
      .query("analyticsMemberships")
      .withIndex("by_generation_and_shopId_and_organizationPersonId_and_validFrom", (q) =>
        q
          .eq("generation", job.generation)
          .eq("shopId", job.shopId as Id<"shops">)
          .eq("organizationPersonId", membership.organizationPersonId)
          .lte("validFrom", endMs),
      )
      .order("desc")
      .take(MEMBERSHIP_HISTORY_READ_LIMIT + 1);
    if (staffMemberships.some((staff) => staff.role === "staff" && activeAt(staff, endMs))) managerStaffCount += 1;
    if (staffMemberships.length > MEMBERSHIP_HISTORY_READ_LIMIT) partial = true;
  }
  await ctx.db.patch(snapshot._id, {
    managerMembershipCount: snapshot.managerMembershipCount + managerCount,
    managerStaffCount: snapshot.managerStaffCount + managerStaffCount,
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "shopCycles" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    processedDelta: page.page.length,
  });
}

function isEligibleConfirmationLeadTimeCycle(cycle: Doc<"analyticsShiftCycles">, endMs: number, targetDate: string) {
  return (
    cycle.createdAt < endMs &&
    cycle.periodStart <= targetDate &&
    (cycle.deletedAt === undefined || cycle.deletedAt >= endMs) &&
    cycle.completeness === "complete" &&
    cycle.confirmedAt !== undefined &&
    cycle.confirmedAt < endMs &&
    cycle.confirmationLeadTimeMs !== undefined &&
    cycle.confirmationLeadTimeMs >= 0
  );
}

async function processDailyShopCyclePage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_generation_and_shopId_and_periodStart", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .lte("periodStart", job.targetDate as string),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  let cycleCount = 0;
  let confirmedCycleCount = 0;
  let confirmedBeforeStartCycleCount = 0;
  const northStar = { ...snapshot.northStar };
  const deadlineSubmission = { ...snapshot.deadlineSubmission };
  const finalSubmission = { ...snapshot.finalSubmission };
  const cumulativeDeadlineSubmission = { ...snapshot.cumulativeDeadlineSubmission };
  const cumulativeFinalSubmission = { ...snapshot.cumulativeFinalSubmission };
  let cumulativeNotificationSentCount = snapshot.cumulativeNotificationSentCount;
  let cumulativeNotificationFailedCount = snapshot.cumulativeNotificationFailedCount;
  let confirmationLeadTimeCount = job.confirmationLeadTimeCount ?? 0;
  let lastNotificationFailedAt = snapshot.lastNotificationFailedAt;
  let partial = job.aggregationPartial ?? false;
  for (const cycle of page.page) {
    if (cycle.createdAt >= endMs) continue;
    if (cycle.deletedAt !== undefined && cycle.deletedAt < endMs) continue;
    cycleCount += 1;
    cumulativeNotificationSentCount += cycle.notificationSentCount;
    cumulativeNotificationFailedCount += cycle.notificationFailedCount;
    if (cycle.completeness === "complete") {
      cumulativeDeadlineSubmission.numerator += cycle.submittedAtDeadline ?? 0;
      cumulativeDeadlineSubmission.denominator += cycle.targetAtDeadline ?? 0;
      cumulativeFinalSubmission.numerator += cycle.submittedAtClose ?? 0;
      cumulativeFinalSubmission.denominator += cycle.targetAtClose ?? 0;
    }
    if (isEligibleConfirmationLeadTimeCycle(cycle, endMs, job.targetDate as string)) {
      confirmationLeadTimeCount += 1;
    } else if (
      cycle.completeness === "complete" &&
      cycle.confirmedAt !== undefined &&
      cycle.confirmedAt < endMs &&
      cycle.confirmationLeadTimeMs !== undefined &&
      cycle.confirmationLeadTimeMs < 0
    ) {
      partial = true;
    }
    if (cycle.confirmedAt !== undefined && cycle.confirmedAt < endMs) confirmedCycleCount += 1;
    if (cycle.confirmedBeforeStart && cycle.confirmedAt !== undefined && cycle.confirmedAt < endMs) {
      confirmedBeforeStartCycleCount += 1;
    }
    if (cycle.lastNotificationFailedAt !== undefined && cycle.lastNotificationFailedAt < endMs) {
      lastNotificationFailedAt = Math.max(lastNotificationFailedAt ?? 0, cycle.lastNotificationFailedAt);
    }
    if (cycle.periodStart !== job.targetDate) continue;
    if (cycle.completeness === "partial") {
      partial = true;
    }
    if (cycle.completeness !== "complete") {
      continue;
    }
    northStar.denominator += 1;
    if (cycle.confirmedBeforeStart) northStar.numerator += 1;
    deadlineSubmission.numerator += cycle.submittedAtDeadline ?? 0;
    deadlineSubmission.denominator += cycle.targetAtDeadline ?? 0;
    finalSubmission.numerator += cycle.submittedAtClose ?? 0;
    finalSubmission.denominator += cycle.targetAtClose ?? 0;
  }
  await ctx.db.patch(snapshot._id, {
    cycleCount: snapshot.cycleCount + cycleCount,
    confirmedCycleCount: snapshot.confirmedCycleCount + confirmedCycleCount,
    confirmedBeforeStartCycleCount: snapshot.confirmedBeforeStartCycleCount + confirmedBeforeStartCycleCount,
    northStar,
    deadlineSubmission,
    finalSubmission,
    cumulativeDeadlineSubmission,
    cumulativeFinalSubmission,
    cumulativeNotificationSentCount,
    cumulativeNotificationFailedCount,
    ...(lastNotificationFailedAt === undefined ? {} : { lastNotificationFailedAt }),
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "shopConfirmationLeadTimeQuantiles" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    confirmationLeadTimeCount,
    processedDelta: page.page.length,
  });
}

async function processDailyShopConfirmationLeadTimeQuantilePage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const count = job.confirmationLeadTimeCount ?? 0;
  if (count === 0) {
    await ctx.db.patch(snapshot._id, {
      confirmationLeadTimeMedianMs: undefined,
      confirmationLeadTimeP90Ms: undefined,
      computedAt: Date.now(),
    });
    await requeueJob(ctx, job, { phase: "shopNotifications", cursor: undefined });
    return;
  }
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_gen_shop_complete_lead_time", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .eq("completeness", "complete"),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  const medianLowerRank = Math.floor((count - 1) / 2);
  const medianUpperRank = Math.floor(count / 2);
  const p90Rank = Math.max(0, Math.ceil(count * 0.9) - 1);
  let rankOffset = job.confirmationLeadTimeRankOffset ?? 0;
  let medianLowerMs = job.confirmationLeadTimeMedianLowerMs;
  let medianUpperMs = job.confirmationLeadTimeMedianUpperMs;
  let p90Ms = job.confirmationLeadTimeP90Ms;
  for (const cycle of page.page) {
    if (!isEligibleConfirmationLeadTimeCycle(cycle, endMs, job.targetDate as string)) continue;
    if (rankOffset === medianLowerRank) medianLowerMs = cycle.confirmationLeadTimeMs;
    if (rankOffset === medianUpperRank) medianUpperMs = cycle.confirmationLeadTimeMs;
    if (rankOffset === p90Rank) p90Ms = cycle.confirmationLeadTimeMs;
    rankOffset += 1;
  }
  if (!page.isDone) {
    await requeueJob(ctx, job, {
      cursor: page.continueCursor,
      confirmationLeadTimeRankOffset: rankOffset,
      ...(medianLowerMs === undefined ? {} : { confirmationLeadTimeMedianLowerMs: medianLowerMs }),
      ...(medianUpperMs === undefined ? {} : { confirmationLeadTimeMedianUpperMs: medianUpperMs }),
      ...(p90Ms === undefined ? {} : { confirmationLeadTimeP90Ms: p90Ms }),
      processedDelta: page.page.length,
    });
    return;
  }
  const exact =
    rankOffset === count && medianLowerMs !== undefined && medianUpperMs !== undefined && p90Ms !== undefined;
  if (exact && medianLowerMs !== undefined && medianUpperMs !== undefined && p90Ms !== undefined) {
    await ctx.db.patch(snapshot._id, {
      confirmationLeadTimeMedianMs: (medianLowerMs + medianUpperMs) / 2,
      confirmationLeadTimeP90Ms: p90Ms,
      computedAt: Date.now(),
    });
  } else {
    await ctx.db.patch(snapshot._id, {
      confirmationLeadTimeMedianMs: undefined,
      confirmationLeadTimeP90Ms: undefined,
      computedAt: Date.now(),
    });
  }
  await requeueJob(ctx, job, {
    phase: "shopNotifications",
    cursor: undefined,
    aggregationPartial: (job.aggregationPartial ?? false) || !exact,
    confirmationLeadTimeRankOffset: rankOffset,
    processedDelta: page.page.length,
  });
}

async function processDailyShopNotificationPage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const fromDate = addDays(job.targetDate as string, -(ANALYTICS_POLICY.health.notificationFailureWindowDays - 1));
  const page = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .gte("snapshotDate", fromDate)
        .lte("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  let lastNotificationFailedAt = snapshot.lastNotificationFailedAt;
  let partial = job.aggregationPartial ?? false;
  for (const row of page.page) {
    if (row.completeness !== "complete") partial = true;
    if (row.lastFailedAt !== undefined) {
      lastNotificationFailedAt = Math.max(lastNotificationFailedAt ?? 0, row.lastFailedAt);
    }
  }
  await ctx.db.patch(snapshot._id, {
    ...(lastNotificationFailedAt === undefined ? {} : { lastNotificationFailedAt }),
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "shopFinalize" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    processedDelta: page.page.length,
  });
}

async function finalizeDailyShop(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyShopSnapshot(ctx, job);
  const shop = await ctx.db
    .query("analyticsShops")
    .withIndex("by_generation_and_shopId", (q) =>
      q.eq("generation", job.generation).eq("shopId", job.shopId as Id<"shops">),
    )
    .unique();
  if (!shop) throw new Error("analytics_daily_shop_dimension_missing");
  const endMs = dailySnapshotEndMs(job);
  const recentCycleCandidates = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_gen_shop_deleted_complete_period", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .eq("deletedAt", undefined)
        .eq("completeness", "complete")
        .lte("periodStart", job.targetDate as string),
    )
    .order("desc")
    .take(ANALYTICS_POLICY.health.cadenceHistoryCycles);
  const historicalCyclePartial = recentCycleCandidates.some((cycle) => cycle.createdAt >= endMs);
  const recentCycles = historicalCyclePartial ? [] : recentCycleCandidates.filter((cycle) => cycle.createdAt < endMs);
  const upcomingCandidates = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_generation_and_shopId_and_deletedAt_and_periodStart", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .eq("deletedAt", undefined)
        .gte("periodStart", job.targetDate as string),
    )
    .take(SNAPSHOT_SCOPE_READ_LIMIT);
  const upcoming = upcomingCandidates.find((cycle) => cycle.createdAt < endMs);
  const upcomingPartial = !upcoming && upcomingCandidates.length === SNAPSHOT_SCOPE_READ_LIMIT;
  const latestCycleCandidates = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_generation_and_shopId_and_deletedAt_and_periodStart", (q) =>
      q
        .eq("generation", job.generation)
        .eq("shopId", job.shopId as Id<"shops">)
        .eq("deletedAt", undefined)
        .lte("periodStart", job.targetDate as string),
    )
    .order("desc")
    .take(SNAPSHOT_SCOPE_READ_LIMIT);
  const latestCycle = latestCycleCandidates.find((cycle) => cycle.createdAt < endMs);
  const latestCyclePartial = !latestCycle && latestCycleCandidates.length === SNAPSHOT_SCOPE_READ_LIMIT;
  const starts = recentCycles.map((cycle) => getSubmitLinkCutoff(cycle.periodStart)).sort((a, b) => a - b);
  const cadenceIntervals = starts
    .slice(1)
    .map((value, index) => value - (starts[index] ?? value))
    .filter((value) => value > 0)
    .map((value) => value / DAY_MS);
  const cadenceDays = cadenceIntervals.length >= 2 ? median(cadenceIntervals) : undefined;
  const cadence =
    cadenceDays === undefined
      ? ({ kind: "insufficientData" } as const)
      : ({
          kind: "estimated" as const,
          days: cadenceDays,
          confidence:
            cadenceIntervals.length >= 5
              ? ("high" as const)
              : cadenceIntervals.length >= 3
                ? ("medium" as const)
                : ("low" as const),
        } as const);
  const healthSignals: Doc<"analyticsDailyShopKpis">["healthSignals"] = [];
  if (upcoming) healthSignals.push({ signal: "hasUpcomingCycle", startedAt: upcoming.createdAt });
  else if (cadenceDays === undefined) healthSignals.push({ signal: "insufficientData", startedAt: endMs });
  else {
    const latestStart = starts[starts.length - 1] ?? shop.registeredAt;
    const expectedNextStart = latestStart + cadenceDays * DAY_MS;
    healthSignals.push({ signal: "nextCycleMissing", startedAt: expectedNextStart });
    const toleranceDays = Math.max(
      ANALYTICS_POLICY.health.cadenceToleranceMinimumDays,
      cadenceDays * ANALYTICS_POLICY.health.cadenceToleranceRatio,
    );
    if (endMs > expectedNextStart + toleranceDays * DAY_MS) {
      healthSignals.push({ signal: "cadenceDelayed", startedAt: expectedNextStart });
    }
  }
  const failureWindowStart = endMs - ANALYTICS_POLICY.health.notificationFailureWindowDays * DAY_MS;
  if (
    snapshot.lastNotificationFailedAt !== undefined &&
    snapshot.lastNotificationFailedAt >= failureWindowStart &&
    snapshot.lastNotificationFailedAt < endMs
  ) {
    healthSignals.push({ signal: "notificationFailure", startedAt: snapshot.lastNotificationFailedAt });
  }
  const latestCompleteCycle = recentCycles[0];
  const priorCompleteCycles = recentCycles.slice(1, 4);
  const latestRate =
    (latestCompleteCycle?.targetAtClose ?? 0) >= ANALYTICS_POLICY.health.submissionDropMinimumTargets
      ? (latestCompleteCycle?.submittedAtClose ?? 0) / (latestCompleteCycle?.targetAtClose ?? 1)
      : undefined;
  const priorRates = priorCompleteCycles.flatMap((cycle) =>
    cycle.targetAtClose ? [(cycle.submittedAtClose ?? 0) / cycle.targetAtClose] : [],
  );
  const priorMedian = priorCompleteCycles.length === 3 && priorRates.length === 3 ? median(priorRates) : undefined;
  if (
    latestRate !== undefined &&
    priorMedian !== undefined &&
    priorMedian - latestRate >= ANALYTICS_POLICY.health.submissionDropThresholdPoints
  ) {
    healthSignals.push({ signal: "submissionDrop", startedAt: latestCompleteCycle?.closedAt ?? endMs });
  } else if (
    (latestCompleteCycle?.targetAtClose ?? 0) < ANALYTICS_POLICY.health.submissionDropMinimumTargets ||
    priorMedian === undefined
  ) {
    if (!healthSignals.some(({ signal }) => signal === "insufficientData")) {
      healthSignals.push({ signal: "insufficientData", startedAt: endMs });
    }
  }
  if (latestCycle) {
    const periodStartAt = getSubmitLinkCutoff(latestCycle.periodStart);
    if ((!latestCycle.confirmedAt || latestCycle.confirmedAt >= endMs) && periodStartAt < endMs) {
      healthSignals.push({ signal: "confirmationDelay", startedAt: periodStartAt });
    } else if (latestCycle.confirmedAt !== undefined && latestCycle.confirmedAt < endMs) {
      const normalLeadTimeMs = median(
        recentCycles
          .filter((cycle) => cycle.recruitmentId !== latestCycle.recruitmentId)
          .slice(0, ANALYTICS_POLICY.health.cadenceHistoryCycles)
          .flatMap((cycle) => (cycle.confirmationLeadTimeMs === undefined ? [] : [cycle.confirmationLeadTimeMs])),
      );
      if (normalLeadTimeMs !== undefined) {
        const confirmationToleranceMs = Math.max(
          ANALYTICS_POLICY.health.cadenceToleranceMinimumDays * DAY_MS,
          normalLeadTimeMs * ANALYTICS_POLICY.health.cadenceToleranceRatio,
        );
        if ((latestCycle.confirmationLeadTimeMs ?? 0) > normalLeadTimeMs + confirmationToleranceMs) {
          healthSignals.push({
            signal: "confirmationDelay",
            startedAt: latestCycle.createdAt + normalLeadTimeMs + confirmationToleranceMs,
          });
        }
      }
    }
  }
  const activityAt = shop.latestActivityAt ?? shop.registeredAt;
  const historicalActivityPartial = activityAt >= endMs;
  const activityWindowStart = endMs - ANALYTICS_POLICY.health.activityWindowDays * DAY_MS;
  const hasRecentActivity = !historicalActivityPartial && activityAt >= activityWindowStart;
  if (historicalActivityPartial) {
    if (!healthSignals.some(({ signal }) => signal === "insufficientData")) {
      healthSignals.push({ signal: "insufficientData", startedAt: endMs });
    }
  } else if (!hasRecentActivity) {
    healthSignals.push({
      signal: "longInactive",
      startedAt: activityAt + ANALYTICS_POLICY.health.activityWindowDays * DAY_MS,
    });
  }
  const issueHealthSignalCount = healthSignals.filter(
    ({ signal }) => signal !== "hasUpcomingCycle" && signal !== "insufficientData",
  ).length;
  await ctx.db.patch(snapshot._id, {
    ...(upcoming ? { nextCyclePeriodStart: upcoming.periodStart } : { nextCyclePeriodStart: undefined }),
    issueHealthSignalCount,
    healthSignals,
    cadence,
    hasRecentActivity,
    completeness:
      job.aggregationPartial ||
      historicalCyclePartial ||
      upcomingPartial ||
      latestCyclePartial ||
      historicalActivityPartial
        ? "partial"
        : "complete",
    computedAt: Date.now(),
  });
  await ctx.db.patch(job._id, {
    phase: "shopSnapshots",
    cursor: job.parentCursor,
    parentCursor: undefined,
    shopId: undefined,
    organizationId: undefined,
    aggregationPartial: undefined,
    confirmationLeadTimeCount: undefined,
    confirmationLeadTimeRankOffset: undefined,
    confirmationLeadTimeMedianLowerMs: undefined,
    confirmationLeadTimeMedianUpperMs: undefined,
    confirmationLeadTimeP90Ms: undefined,
    status: "pending",
    leaseToken: undefined,
    leaseUntil: undefined,
    nextRunAt: Date.now(),
    updatedAt: Date.now(),
  });
}

type Rollup = {
  shopCount: number;
  kpiEligibleShopCount: number;
  activeShopCount: number;
  staffMembershipCount: number;
  unlinkedStaffCount: number;
  shiftTargetCount: number;
  managerStaffCount: number;
  milestoneCounts: ReturnType<typeof emptyMilestoneCounts>;
  healthSignalCounts: ReturnType<typeof emptyHealthSignalCounts>;
  northStar: ReturnType<typeof emptyRatePair>;
  deadlineSubmission: ReturnType<typeof emptyRatePair>;
  finalSubmission: ReturnType<typeof emptyRatePair>;
  completeness: Completeness;
};

function emptyRollup(): Rollup {
  return {
    shopCount: 0,
    kpiEligibleShopCount: 0,
    activeShopCount: 0,
    staffMembershipCount: 0,
    unlinkedStaffCount: 0,
    shiftTargetCount: 0,
    managerStaffCount: 0,
    milestoneCounts: emptyMilestoneCounts(),
    healthSignalCounts: emptyHealthSignalCounts(),
    northStar: emptyRatePair(),
    deadlineSubmission: emptyRatePair(),
    finalSubmission: emptyRatePair(),
    completeness: "complete",
  };
}

function addShopToRollup(rollup: Rollup, shop: Doc<"analyticsDailyShopKpis">) {
  rollup.shopCount += 1;
  rollup.kpiEligibleShopCount += 1;
  if (shop.hasRecentActivity) rollup.activeShopCount += 1;
  rollup.staffMembershipCount += shop.staffMembershipCount;
  rollup.unlinkedStaffCount += shop.unlinkedStaffCount;
  rollup.shiftTargetCount += shop.shiftTargetCount;
  rollup.milestoneCounts.registered += 1;
  if (shop.milestoneDates.firstRecruitmentAt) rollup.milestoneCounts.firstRecruitment += 1;
  if (shop.milestoneDates.firstSubmissionAt) rollup.milestoneCounts.firstSubmission += 1;
  if (shop.milestoneDates.firstConfirmedAt) rollup.milestoneCounts.firstConfirmed += 1;
  if (shop.milestoneDates.secondConfirmedAt) rollup.milestoneCounts.secondConfirmed += 1;
  for (const signal of shop.healthSignals) rollup.healthSignalCounts[signal.signal] += 1;
  rollup.northStar.numerator += shop.northStar.numerator;
  rollup.northStar.denominator += shop.northStar.denominator;
  rollup.deadlineSubmission.numerator += shop.deadlineSubmission.numerator;
  rollup.deadlineSubmission.denominator += shop.deadlineSubmission.denominator;
  rollup.finalSubmission.numerator += shop.finalSubmission.numerator;
  rollup.finalSubmission.denominator += shop.finalSubmission.denominator;
  if (shop.completeness !== "complete") rollup.completeness = "partial";
}

async function getDailyOrganizationSnapshot(
  ctx: QueryCtx | MutationCtx,
  generation: string,
  snapshotDate: string,
  organizationId: Id<"organizations">,
) {
  return await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
      q.eq("generation", generation).eq("organizationId", organizationId).eq("snapshotDate", snapshotDate),
    )
    .unique();
}

async function selectDailyOrganization(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
    .paginate({ numItems: 1, cursor: job.cursor ?? null });
  const organization = page.page[0];
  if (!organization) {
    await requeueJob(ctx, job, { phase: "segmentInit", cursor: undefined, aggregationPartial: false });
    return;
  }
  const endMs = dailySnapshotEndMs(job);
  if (organization.registeredAt >= endMs || (organization.deletedAt !== undefined && organization.deletedAt < endMs)) {
    const stale = await getDailyOrganizationSnapshot(
      ctx,
      job.generation,
      job.targetDate as string,
      organization.organizationId,
    );
    if (stale) await ctx.db.delete(stale._id);
    await requeueJob(ctx, job, {
      phase: page.isDone ? "segmentInit" : "organizationSnapshots",
      cursor: page.isDone ? undefined : page.continueCursor,
      processedDelta: 1,
    });
    return;
  }
  const existing = await getDailyOrganizationSnapshot(
    ctx,
    job.generation,
    job.targetDate as string,
    organization.organizationId,
  );
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation: job.generation,
    organizationId: organization.organizationId,
    snapshotDate: job.targetDate as string,
    ...(organization.currentPlan && organization.updatedAt < endMs ? { currentPlan: organization.currentPlan } : {}),
    shopCount: 0,
    kpiEligibleShopCount: 0,
    activeShopCount: 0,
    uniquePersonCount: 0,
    staffMembershipCount: 0,
    unlinkedStaffCount: 0,
    shiftTargetCount: 0,
    managerMembershipCount: 0,
    managerStaffCount: 0,
    milestoneCounts: emptyMilestoneCounts(),
    healthSignalCounts: emptyHealthSignalCounts(),
    northStar: emptyRatePair(),
    deadlineSubmission: emptyRatePair(),
    finalSubmission: emptyRatePair(),
    completeness: "partial" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailyOrganizationKpis", value);
  await requeueJob(ctx, job, {
    phase: "organizationShops",
    cursor: undefined,
    parentCursor: page.continueCursor,
    organizationId: organization.organizationId,
    aggregationPartial: organization.updatedAt >= endMs,
    processedDelta: 1,
  });
}

async function requireDailyOrganizationSnapshot(ctx: MutationCtx, job: Job) {
  if (!job.targetDate || !job.organizationId) throw new Error("analytics_daily_organization_scope_missing");
  const snapshot = await getDailyOrganizationSnapshot(ctx, job.generation, job.targetDate, job.organizationId);
  if (!snapshot) throw new Error("analytics_daily_organization_snapshot_missing");
  return snapshot;
}

async function processDailyOrganizationShopPage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyOrganizationSnapshot(ctx, job);
  const page = await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
      q
        .eq("generation", job.generation)
        .eq("organizationId", job.organizationId as Id<"organizations">)
        .eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  const rollup = emptyRollup();
  for (const shop of page.page) addShopToRollup(rollup, shop);
  await ctx.db.patch(snapshot._id, {
    shopCount: snapshot.shopCount + rollup.shopCount,
    kpiEligibleShopCount: snapshot.kpiEligibleShopCount + rollup.kpiEligibleShopCount,
    activeShopCount: snapshot.activeShopCount + rollup.activeShopCount,
    staffMembershipCount: snapshot.staffMembershipCount + rollup.staffMembershipCount,
    unlinkedStaffCount: snapshot.unlinkedStaffCount + rollup.unlinkedStaffCount,
    shiftTargetCount: snapshot.shiftTargetCount + rollup.shiftTargetCount,
    milestoneCounts: addMilestoneCounts(snapshot.milestoneCounts, rollup.milestoneCounts),
    healthSignalCounts: addHealthCounts(snapshot.healthSignalCounts, rollup.healthSignalCounts),
    northStar: addRatePairs(snapshot.northStar, rollup.northStar),
    deadlineSubmission: addRatePairs(snapshot.deadlineSubmission, rollup.deadlineSubmission),
    finalSubmission: addRatePairs(snapshot.finalSubmission, rollup.finalSubmission),
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "organizationPeople" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: (job.aggregationPartial ?? false) || rollup.completeness !== "complete",
    processedDelta: page.page.length,
  });
}

async function processDailyOrganizationPeoplePage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyOrganizationSnapshot(ctx, job);
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsPeople")
    .withIndex("by_generation_and_organizationId", (q) =>
      q.eq("generation", job.generation).eq("organizationId", job.organizationId as Id<"organizations">),
    )
    .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
  let count = 0;
  let managerStaffCount = 0;
  let partial = job.aggregationPartial ?? false;
  for (const person of page.page) {
    if (person.firstObservedAt >= endMs || (person.deletedAt !== undefined && person.deletedAt < endMs)) continue;
    count += 1;
    const roles = await getPersonMembershipRolesAt(
      ctx,
      job.generation,
      job.organizationId as Id<"organizations">,
      person.organizationPersonId,
      endMs,
    );
    if (roles.hasManager && roles.hasStaff) managerStaffCount += 1;
    if (!roles.complete) partial = true;
  }
  await ctx.db.patch(snapshot._id, {
    uniquePersonCount: snapshot.uniquePersonCount + count,
    managerStaffCount: snapshot.managerStaffCount + managerStaffCount,
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "organizationManagers" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    processedDelta: page.page.length,
  });
}

async function processDailyOrganizationManagerPage(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyOrganizationSnapshot(ctx, job);
  const endMs = dailySnapshotEndMs(job);
  const page = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_generation_and_organizationId_and_role_and_validFrom", (q) =>
      q
        .eq("generation", job.generation)
        .eq("organizationId", job.organizationId as Id<"organizations">)
        .eq("role", "manager")
        .lte("validFrom", endMs),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  const count = page.page.filter((membership) => activeAt(membership, endMs)).length;
  await ctx.db.patch(snapshot._id, {
    managerMembershipCount: snapshot.managerMembershipCount + count,
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "organizationFinalize" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    processedDelta: page.page.length,
  });
}

async function finishDailyOrganization(ctx: MutationCtx, job: Job) {
  const snapshot = await requireDailyOrganizationSnapshot(ctx, job);
  await ctx.db.patch(snapshot._id, {
    completeness: job.aggregationPartial ? "partial" : "complete",
    computedAt: Date.now(),
  });
  await ctx.db.patch(job._id, {
    phase: "organizationSnapshots",
    cursor: job.parentCursor,
    parentCursor: undefined,
    organizationId: undefined,
    aggregationPartial: undefined,
    status: "pending",
    leaseToken: undefined,
    leaseUntil: undefined,
    nextRunAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function staffSizeBucket(count: number): string {
  if (count === 0) return "0";
  if (count <= 4) return "1-4";
  if (count <= 9) return "5-9";
  if (count <= 19) return "10-19";
  if (count <= 49) return "20-49";
  return "50+";
}

function organizationShopCountBucket(count: number): string {
  if (count <= 1) return "1";
  if (count <= 3) return "2-3";
  if (count <= 10) return "4-10";
  return "11+";
}

function lineUsageBucket(row: Doc<"analyticsDailyShopKpis">): string {
  if (row.shiftTargetCount === 0) return "notApplicable";
  if (row.lineLinkedCount === 0) return "0%";
  const rate = row.lineLinkedCount / row.shiftTargetCount;
  if (rate < 0.5) return "1-49%";
  if (rate < 0.8) return "50-79%";
  return "80%+";
}

function cadenceBucket(cadence: Doc<"analyticsDailyShopKpis">["cadence"]): string {
  if (cadence.kind === "insufficientData") return "insufficientData";
  if (cadence.days <= 9) return "weekly";
  if (cadence.days <= 18) return "biweekly";
  if (cadence.days <= 40) return "monthly";
  return "other";
}

function addRatePairs(a: ReturnType<typeof emptyRatePair>, b: ReturnType<typeof emptyRatePair>) {
  return { numerator: a.numerator + b.numerator, denominator: a.denominator + b.denominator };
}

function addMilestoneCounts(a: ReturnType<typeof emptyMilestoneCounts>, b: ReturnType<typeof emptyMilestoneCounts>) {
  const value = { ...a };
  for (const key of Object.keys(value) as Array<keyof typeof value>) value[key] += b[key];
  return value;
}

function addHealthCounts(a: ReturnType<typeof emptyHealthSignalCounts>, b: ReturnType<typeof emptyHealthSignalCounts>) {
  const value = { ...a };
  for (const key of Object.keys(value) as Array<keyof typeof value>) value[key] += b[key];
  return value;
}

async function initializeDailySegments(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsDailySegmentKpis")
    .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null });
  for (const row of page.page) await ctx.db.delete(row._id);
  await requeueJob(ctx, job, {
    phase: page.isDone ? "segmentSnapshots" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: false,
    processedDelta: page.page.length,
  });
}

async function addSegmentRow(
  ctx: MutationCtx,
  job: Job,
  dimension: Doc<"analyticsDailySegmentKpis">["dimension"],
  bucket: string,
  shop: Doc<"analyticsDailyShopKpis">,
) {
  const existing = await ctx.db
    .query("analyticsDailySegmentKpis")
    .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
      q
        .eq("generation", job.generation)
        .eq("snapshotDate", job.targetDate as string)
        .eq("dimension", dimension)
        .eq("bucket", bucket),
    )
    .unique();
  const rollup = emptyRollup();
  addShopToRollup(rollup, shop);
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation: job.generation,
    snapshotDate: job.targetDate as string,
    dimension,
    bucket,
    shopCount: (existing?.shopCount ?? 0) + 1,
    milestoneCounts: addMilestoneCounts(existing?.milestoneCounts ?? emptyMilestoneCounts(), rollup.milestoneCounts),
    healthSignalCounts: addHealthCounts(
      existing?.healthSignalCounts ?? emptyHealthSignalCounts(),
      rollup.healthSignalCounts,
    ),
    northStar: addRatePairs(existing?.northStar ?? emptyRatePair(), rollup.northStar),
    deadlineSubmission: addRatePairs(existing?.deadlineSubmission ?? emptyRatePair(), rollup.deadlineSubmission),
    finalSubmission: addRatePairs(existing?.finalSubmission ?? emptyRatePair(), rollup.finalSubmission),
    completeness: "partial" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailySegmentKpis", value);
}

async function rollupDailySegmentPage(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: SEGMENT_ROLLUP_PAGE_SIZE, cursor: job.cursor ?? null });
  const endMs = dailySnapshotEndMs(job);
  let partial = job.aggregationPartial ?? false;
  for (const row of page.page) {
    const [shop, organization] = await Promise.all([
      ctx.db
        .query("analyticsShops")
        .withIndex("by_generation_and_shopId", (q) => q.eq("generation", job.generation).eq("shopId", row.shopId))
        .unique(),
      getDailyOrganizationSnapshot(ctx, job.generation, job.targetDate as string, row.organizationId),
    ]);
    const buckets: Array<[Doc<"analyticsDailySegmentKpis">["dimension"], string]> = [
      ["registrationCohort", shop ? dateJST(shop.registeredAt).slice(0, 7) : "unknown"],
      ["plan", shop && shop.updatedAt < endMs ? (shop.currentPlan ?? "unknown") : "unknown"],
      ["organizationShopCount", organizationShopCountBucket(organization?.shopCount ?? 0)],
      ["shopStaffSize", staffSizeBucket(row.staffMembershipCount)],
      ["cadence", cadenceBucket(row.cadence)],
      ["lineUsage", lineUsageBucket(row)],
      [
        "submissionTrend",
        row.healthSignals.some(({ signal }) => signal === "submissionDrop")
          ? "declining"
          : (ratio(row.finalSubmission) ?? 0) >= 0.8
            ? "high"
            : row.finalSubmission.denominator > 0
              ? "stable"
              : "insufficientData",
      ],
      [
        "adoptionAge",
        shop
          ? Math.max(0, Math.floor((endMs - shop.registeredAt) / DAY_MS)) <= 30
            ? "0-30"
            : Math.floor((endMs - shop.registeredAt) / DAY_MS) <= 90
              ? "31-90"
              : "91+"
          : "unknown",
      ],
    ];
    for (const [dimension, bucket] of buckets) await addSegmentRow(ctx, job, dimension, bucket, row);
    if (row.completeness !== "complete") partial = true;
  }
  await requeueJob(ctx, job, {
    phase: page.isDone ? "segmentFinalize" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    processedDelta: page.page.length,
  });
}

async function finalizeDailySegmentPage(ctx: MutationCtx, job: Job) {
  const page = await ctx.db
    .query("analyticsDailySegmentKpis")
    .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null });
  for (const row of page.page) {
    await ctx.db.patch(row._id, {
      completeness: job.aggregationPartial ? "partial" : "complete",
      computedAt: Date.now(),
    });
  }
  await requeueJob(ctx, job, {
    phase: page.isDone ? "serviceInit" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: page.isDone ? false : job.aggregationPartial,
    processedDelta: page.page.length,
  });
}

async function initializeDailyService(ctx: MutationCtx, job: Job) {
  const existing = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .unique();
  const value = {
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    generation: job.generation,
    snapshotDate: job.targetDate as string,
    organizationCount: 0,
    shopCount: 0,
    kpiEligibleShopCount: 0,
    activeShopCount: 0,
    personCount: 0,
    staffMembershipCount: 0,
    unlinkedStaffCount: 0,
    shiftTargetCount: 0,
    managerMembershipCount: 0,
    managerStaffCount: 0,
    milestoneCounts: emptyMilestoneCounts(),
    healthSignalCounts: emptyHealthSignalCounts(),
    northStar: emptyRatePair(),
    deadlineSubmission: emptyRatePair(),
    finalSubmission: emptyRatePair(),
    completeness: "partial" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailyServiceKpis", value);
  await requeueJob(ctx, job, { phase: "serviceSnapshot", cursor: undefined, aggregationPartial: false });
}

async function rollupDailyServicePage(ctx: MutationCtx, job: Job) {
  const service = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .unique();
  if (!service) throw new Error("analytics_daily_service_snapshot_missing");
  const page = await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .paginate({ numItems: SNAPSHOT_SCOPE_READ_LIMIT, cursor: job.cursor ?? null });
  let shopCount = 0;
  let kpiEligibleShopCount = 0;
  let activeShopCount = 0;
  let personCount = 0;
  let staffMembershipCount = 0;
  let unlinkedStaffCount = 0;
  let shiftTargetCount = 0;
  let managerMembershipCount = 0;
  let managerStaffCount = 0;
  let milestoneCounts = emptyMilestoneCounts();
  let healthSignalCounts = emptyHealthSignalCounts();
  let northStar = emptyRatePair();
  let deadlineSubmission = emptyRatePair();
  let finalSubmission = emptyRatePair();
  let partial = job.aggregationPartial ?? false;
  for (const organization of page.page) {
    shopCount += organization.shopCount;
    kpiEligibleShopCount += organization.kpiEligibleShopCount;
    activeShopCount += organization.activeShopCount;
    personCount += organization.uniquePersonCount;
    staffMembershipCount += organization.staffMembershipCount;
    unlinkedStaffCount += organization.unlinkedStaffCount;
    shiftTargetCount += organization.shiftTargetCount;
    managerMembershipCount += organization.managerMembershipCount;
    managerStaffCount += organization.managerStaffCount;
    milestoneCounts = addMilestoneCounts(milestoneCounts, organization.milestoneCounts);
    healthSignalCounts = addHealthCounts(healthSignalCounts, organization.healthSignalCounts);
    northStar = addRatePairs(northStar, organization.northStar);
    deadlineSubmission = addRatePairs(deadlineSubmission, organization.deadlineSubmission);
    finalSubmission = addRatePairs(finalSubmission, organization.finalSubmission);
    if (organization.completeness !== "complete") partial = true;
  }
  await ctx.db.patch(service._id, {
    organizationCount: service.organizationCount + page.page.length,
    shopCount: service.shopCount + shopCount,
    kpiEligibleShopCount: service.kpiEligibleShopCount + kpiEligibleShopCount,
    activeShopCount: service.activeShopCount + activeShopCount,
    personCount: service.personCount + personCount,
    staffMembershipCount: service.staffMembershipCount + staffMembershipCount,
    unlinkedStaffCount: service.unlinkedStaffCount + unlinkedStaffCount,
    shiftTargetCount: service.shiftTargetCount + shiftTargetCount,
    managerMembershipCount: service.managerMembershipCount + managerMembershipCount,
    managerStaffCount: service.managerStaffCount + managerStaffCount,
    milestoneCounts: addMilestoneCounts(service.milestoneCounts, milestoneCounts),
    healthSignalCounts: addHealthCounts(service.healthSignalCounts, healthSignalCounts),
    northStar: addRatePairs(service.northStar, northStar),
    deadlineSubmission: addRatePairs(service.deadlineSubmission, deadlineSubmission),
    finalSubmission: addRatePairs(service.finalSubmission, finalSubmission),
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, {
    phase: page.isDone ? "serviceFinalize" : undefined,
    cursor: page.isDone ? undefined : page.continueCursor,
    aggregationPartial: partial,
    processedDelta: page.page.length,
  });
}

async function finalizeDailyService(ctx: MutationCtx, job: Job) {
  const service = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .unique();
  if (!service) throw new Error("analytics_daily_service_snapshot_missing");
  await ctx.db.patch(service._id, {
    // A snapshot is not complete until the run-specific full-page invariant job has
    // verified its service -> organization -> shop rollups.
    completeness: "partial",
    computedAt: Date.now(),
  });
  await ensureInvariantJob(ctx, job.generation, dailyInvariantJobKey(job), false, {
    snapshotDate: job.targetDate as string,
    sourceWatermarkAt: requiredDailySourceWatermark(job),
  });
  await requeueJob(ctx, job, {
    phase: "invariantWait",
    cursor: undefined,
    nextRunAt: Date.now() + MINUTE_MS,
  });
}

function requiredDailySourceWatermark(job: Job) {
  if (!job.sourceWatermarkAt) throw new Error("analytics_daily_watermark_missing");
  return job.sourceWatermarkAt;
}

function dailyInvariantJobKey(job: Job) {
  if (!job.targetDate) throw new Error("analytics_daily_target_missing");
  return `invariant:${job.generation}:daily:${job.targetDate}:${requiredDailySourceWatermark(job)}`;
}

async function waitForDailyInvariant(ctx: MutationCtx, job: Job) {
  const invariant = await getJobByKey(ctx, dailyInvariantJobKey(job));
  if (!invariant) throw new Error("analytics_daily_invariant_missing");
  if (invariant.status === "failed" || invariant.status === "cancelled") {
    throw new Error("analytics_daily_invariant_failed");
  }
  if (invariant.status !== "completed") {
    await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
    return;
  }
  if (
    invariant.sourceWatermarkAt !== requiredDailySourceWatermark(job) ||
    invariant.invariantSnapshotDate !== job.targetDate
  ) {
    throw new Error("analytics_daily_invariant_stale");
  }
  const service = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .unique();
  if (!service) throw new Error("analytics_daily_service_snapshot_missing");
  await ctx.db.patch(service._id, {
    completeness: job.aggregationPartial ? "partial" : "complete",
    computedAt: Date.now(),
  });
  await requeueJob(ctx, job, { phase: "finalizeSnapshot", cursor: undefined });
}

async function publishDailySnapshot(ctx: MutationCtx, job: Job) {
  const snapshot = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_generation_and_snapshotDate", (q) =>
      q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
    )
    .unique();
  if (!snapshot) throw new Error("analytics_daily_service_snapshot_missing");
  const state = await getPipelineState(ctx);
  let latestCompleteSnapshotDate = state?.latestCompleteSnapshotDate;
  let latestCompleteSnapshotAt = state?.latestCompleteSnapshotAt;
  if (state?.activeGeneration === job.generation && snapshot.completeness === "complete") {
    const targetDate = job.targetDate as string;
    const nextContiguousDate = latestCompleteSnapshotDate
      ? addDays(latestCompleteSnapshotDate, 1)
      : state.dataStartDate;
    if (targetDate === latestCompleteSnapshotDate || targetDate === nextContiguousDate) {
      latestCompleteSnapshotDate = targetDate;
      latestCompleteSnapshotAt = snapshot.computedAt;
    } else if (!latestCompleteSnapshotDate || targetDate > latestCompleteSnapshotDate) {
      await markPipelineDegraded(ctx, state, job.generation);
    }
  } else if (state?.activeGeneration === job.generation) {
    await markPipelineDegraded(ctx, state, job.generation);
    await completeJob(ctx, job);
    return;
  }
  if (state?.activeGeneration === job.generation && snapshot.completeness === "complete" && state.dataStartDate) {
    let expectedDate = latestCompleteSnapshotDate ? addDays(latestCompleteSnapshotDate, 1) : state.dataStartDate;
    const rows = await ctx.db
      .query("analyticsDailyServiceKpis")
      .withIndex("by_generation_and_snapshotDate", (q) =>
        q.eq("generation", job.generation).gte("snapshotDate", expectedDate as string),
      )
      .order("asc")
      .take(SNAPSHOT_SCOPE_READ_LIMIT);
    let restoredCount = 0;
    let encounteredBoundary = false;
    for (const row of rows) {
      if (row.snapshotDate !== expectedDate || row.completeness !== "complete") {
        encounteredBoundary = true;
        break;
      }
      latestCompleteSnapshotDate = row.snapshotDate;
      latestCompleteSnapshotAt = row.computedAt;
      expectedDate = addDays(expectedDate, 1);
      restoredCount += 1;
    }
    if (
      latestCompleteSnapshotDate !== state.latestCompleteSnapshotDate ||
      latestCompleteSnapshotAt !== state.latestCompleteSnapshotAt
    ) {
      await ctx.db.patch(state._id, {
        latestCompleteSnapshotDate,
        latestCompleteSnapshotAt,
        updatedAt: Date.now(),
      });
    }
    if (!encounteredBoundary && rows.length === SNAPSHOT_SCOPE_READ_LIMIT) {
      await requeueJob(ctx, job, {
        phase: "finalizeSnapshot",
        processedDelta: restoredCount,
      });
      return;
    }
  }
  await completeJob(ctx, job);
}

async function processGenerationCleanupPage(ctx: MutationCtx, job: Job) {
  const state = await getPipelineState(ctx);
  if (state?.activeGeneration === job.generation || state?.buildingGeneration === job.generation) {
    await ctx.db.patch(job._id, {
      status: "cancelled",
      leaseToken: undefined,
      leaseUntil: undefined,
      completedAt: Date.now(),
      lastErrorCode: "generation_became_active",
      updatedAt: Date.now(),
    });
    return;
  }
  type CleanupId =
    | Id<"analyticsOrganizations">
    | Id<"analyticsShops">
    | Id<"analyticsPeople">
    | Id<"analyticsMemberships">
    | Id<"analyticsShiftCycles">
    | Id<"analyticsShiftCycleOpportunities">
    | Id<"analyticsDailyNotificationKpis">
    | Id<"analyticsDailyServiceKpis">
    | Id<"analyticsDailyOrganizationKpis">
    | Id<"analyticsDailyShopKpis">
    | Id<"analyticsDailySegmentKpis">;
  const finishPage = async (
    page: { page: Array<{ _id: CleanupId }>; isDone: boolean; continueCursor: string },
    nextPhase: Job["phase"] | null,
  ) => {
    for (const row of page.page) await ctx.db.delete(row._id);
    if (page.isDone && nextPhase === null) await completeJob(ctx, job);
    else {
      await requeueJob(ctx, job, {
        phase: page.isDone ? (nextPhase as Job["phase"]) : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
    }
  };
  const opts = { numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null };
  switch (job.phase) {
    case "generationJobsCancel": {
      const page = await ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_generation", (q) => q.eq("generation", job.generation))
        .paginate(opts);
      const now = Date.now();
      for (const candidate of page.page) {
        if (candidate._id === job._id || candidate.status === "completed" || candidate.status === "cancelled") {
          continue;
        }
        await ctx.db.patch(candidate._id, {
          status: "cancelled",
          leaseToken: undefined,
          leaseUntil: undefined,
          completedAt: now,
          lastErrorCode: "generation_cleanup_cancelled_job",
          updatedAt: now,
        });
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "organizationsCleanup" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "organizationsCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsOrganizations")
          .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "shopsCleanup",
      );
      return;
    case "shopsCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsShops")
          .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "peopleCleanup",
      );
      return;
    case "peopleCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsPeople")
          .withIndex("by_generation_and_organizationId", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "membershipsCleanup",
      );
      return;
    case "membershipsCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsMemberships")
          .withIndex("by_generation_and_membershipKey_and_validFrom", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "cyclesCleanup",
      );
      return;
    case "cyclesCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsShiftCycles")
          .withIndex("by_generation_and_periodStart", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "opportunitiesCleanup",
      );
      return;
    case "opportunitiesCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsShiftCycleOpportunities")
          .withIndex("by_generation_and_recruitmentId_and_staffId", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "dailyNotificationCleanup",
      );
      return;
    case "dailyNotificationCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsDailyNotificationKpis")
          .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "dailyServiceCleanup",
      );
      return;
    case "dailyServiceCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "dailyOrganizationCleanup",
      );
      return;
    case "dailyOrganizationCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsDailyOrganizationKpis")
          .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "dailyShopCleanup",
      );
      return;
    case "dailyShopCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", job.generation))
          .paginate(opts),
        "dailySegmentCleanup",
      );
      return;
    case "dailySegmentCleanup":
      await finishPage(
        await ctx.db
          .query("analyticsDailySegmentKpis")
          .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
            q.eq("generation", job.generation),
          )
          .paginate(opts),
        null,
      );
      return;
    default:
      throw new Error("analytics_generation_cleanup_phase_invalid");
  }
}

async function processRetentionCleanupPage(ctx: MutationCtx, job: Job) {
  const before = job.cleanupBefore ?? Date.now();
  const opts = { numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null };
  switch (job.phase) {
    case "sourceEventBacklog": {
      const state = await getPipelineState(ctx);
      if (state?.status !== "active" || !state.projectionCaughtUpAt) {
        await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
        return;
      }
      const backlog = await ctx.db.query("analyticsSourceEvents").paginate({
        numItems: 1,
        cursor: state.sourceEventCursor ?? null,
      });
      if (backlog.page.length > 0 || !backlog.isDone) {
        await requeueJob(ctx, job, { nextRunAt: Date.now() + MINUTE_MS });
        return;
      }
      await requeueJob(ctx, job, {
        phase: "sourceEvents",
        sourceWatermarkAt: Date.now(),
      });
      return;
    }
    case "sourceEvents": {
      if (!job.sourceWatermarkAt) throw new Error("analytics_retention_source_watermark_missing");
      const page = await ctx.db
        .query("analyticsSourceEvents")
        .withIndex("by_occurredAt", (q) => q.lt("occurredAt", before - SOURCE_EVENT_RETENTION_MS))
        .paginate(opts);
      for (const row of page.page) {
        if (row.createdAt <= job.sourceWatermarkAt) await ctx.db.delete(row._id);
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "opportunityIdentifiers" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "opportunityIdentifiers": {
      const page = await ctx.db
        .query("analyticsShiftCycleOpportunities")
        .withIndex("by_identityState_and_expiresAt", (q) => q.eq("identityState", "active").lt("expiresAt", before))
        .paginate(opts);
      for (const row of page.page) {
        await ctx.db.patch(row._id, {
          staffId: undefined,
          organizationPersonId: undefined,
          identityState: "redacted",
        });
      }
      await requeueJob(ctx, job, {
        phase: page.isDone ? "shiftCycles" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "shiftCycles": {
      const threshold = dateJST(before - ANALYTICS_POLICY.retention.detailMonths * 31 * DAY_MS);
      const page = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_periodStart", (q) =>
          q.eq("generation", job.generation).lt("periodStart", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "dailyShop" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "dailyShop": {
      const threshold = dateJST(before - DAILY_DETAIL_RETENTION_DAYS * DAY_MS);
      const page = await ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", job.generation).lt("snapshotDate", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "dailyNotification" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "dailyNotification": {
      const threshold = dateJST(before - DAILY_DETAIL_RETENTION_DAYS * DAY_MS);
      const page = await ctx.db
        .query("analyticsDailyNotificationKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", job.generation).lt("snapshotDate", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "dailyOrganization" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "dailyOrganization": {
      const threshold = dateJST(before - DAILY_DETAIL_RETENTION_DAYS * DAY_MS);
      const page = await ctx.db
        .query("analyticsDailyOrganizationKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", job.generation).lt("snapshotDate", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "dailySegment" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "dailySegment": {
      const threshold = dateJST(before - DAILY_DETAIL_RETENTION_DAYS * DAY_MS);
      const page = await ctx.db
        .query("analyticsDailySegmentKpis")
        .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
          q.eq("generation", job.generation).lt("snapshotDate", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "dailyService" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "dailyService": {
      const threshold = dateJST(before - DAILY_SERVICE_RETENTION_DAYS * DAY_MS);
      const page = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", job.generation).lt("snapshotDate", threshold),
        )
        .paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      await requeueJob(ctx, job, {
        phase: page.isDone ? "jobs" : undefined,
        cursor: page.isDone ? undefined : page.continueCursor,
        processedDelta: page.page.length,
      });
      return;
    }
    case "jobs": {
      const page = await ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_completedAt", (q) => q.gte("completedAt", 0).lt("completedAt", before - JOB_RETENTION_MS))
        .paginate(opts);
      for (const row of page.page) {
        if (row._id !== job._id) await ctx.db.delete(row._id);
      }
      if (page.isDone) await completeJob(ctx, job);
      else {
        await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
      }
      return;
    }
    default:
      throw new Error("analytics_retention_cleanup_phase_invalid");
  }
}

async function processLegacyCleanupPage(ctx: MutationCtx, job: Job) {
  const opts = { numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null };
  if (job.phase === "legacyService") {
    const page = await ctx.db.query("analyticsDailyServiceSnapshots").withIndex("by_date").paginate(opts);
    for (const row of page.page) await ctx.db.delete(row._id);
    await requeueJob(ctx, job, {
      phase: page.isDone ? "legacyShop" : undefined,
      cursor: page.isDone ? undefined : page.continueCursor,
      processedDelta: page.page.length,
    });
    return;
  }
  if (job.phase === "legacyShop") {
    const page = await ctx.db.query("analyticsDailyShopSnapshots").withIndex("by_date_shopId").paginate(opts);
    for (const row of page.page) await ctx.db.delete(row._id);
    await requeueJob(ctx, job, {
      phase: page.isDone ? "legacyEvents" : undefined,
      cursor: page.isDone ? undefined : page.continueCursor,
      processedDelta: page.page.length,
    });
    return;
  }
  if (job.phase === "legacyEvents") {
    const page = await ctx.db.query("analyticsDailyEventCounts").withIndex("by_date_metric").paginate(opts);
    for (const row of page.page) await ctx.db.delete(row._id);
    if (page.isDone) await completeJob(ctx, job);
    else await requeueJob(ctx, job, { cursor: page.continueCursor, processedDelta: page.page.length });
    return;
  }
  throw new Error("analytics_legacy_cleanup_phase_invalid");
}

async function startRetentionCleanupCore(ctx: MutationCtx, before: number) {
  const state = await getPipelineState(ctx);
  const generation = state?.activeGeneration ?? state?.buildingGeneration;
  if (!generation) throw new ConvexError("Analytics generation is not initialized");
  const jobKey = `retention:${dateJST(before)}`;
  const existing = await getJobByKey(ctx, jobKey);
  if (existing) return existing._id;
  return await insertJob(ctx, {
    jobKey,
    jobType: "retentionCleanup",
    generation,
    phase: "sourceEventBacklog",
    status: "pending",
    attemptCount: 0,
    nextRunAt: Date.now(),
    processedCount: 0,
    cleanupBefore: before,
  });
}

export const startRetentionCleanup = internalMutation({
  args: { before: v.optional(v.number()), confirmed: v.literal(true) },
  handler: async (ctx, args) => {
    const before = args.before ?? Date.now();
    const jobId = await startRetentionCleanupCore(ctx, before);
    await scheduleRecovery(ctx);
    return { jobId, before };
  },
});

export const scheduleRetentionCleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    const state = await getPipelineState(ctx);
    if (!state?.activeGeneration && !state?.buildingGeneration) return null;
    await startRetentionCleanupCore(ctx, Date.now());
    await scheduleRecovery(ctx);
    return null;
  },
});

export const startLegacyCleanup = internalMutation({
  args: { confirmed: v.literal(true) },
  handler: async (ctx) => {
    const jobKey = "legacy-cleanup:v1";
    const existing = await getJobByKey(ctx, jobKey);
    const state = await getPipelineState(ctx);
    if (!state?.activeGeneration || !state.latestCompleteSnapshotDate) {
      throw new ConvexError("Analytics v2 is not active and complete");
    }
    const jobId =
      existing?._id ??
      (await insertJob(ctx, {
        jobKey,
        jobType: "legacyCleanup",
        generation: state.activeGeneration,
        phase: "legacyService",
        status: "pending",
        attemptCount: 0,
        nextRunAt: Date.now(),
        processedCount: 0,
      }));
    if (existing && existing.status !== "processing" && existing.status !== "completed") {
      await ctx.db.patch(existing._id, { status: "pending", nextRunAt: Date.now(), updatedAt: Date.now() });
    }
    await scheduleRecovery(ctx);
    return { jobId };
  },
});

export const activateGeneration = internalMutation({
  args: {
    generation: v.string(),
    expectedActiveGeneration: v.optional(v.string()),
    confirmed: v.literal(true),
  },
  handler: async (ctx, args) => {
    const state = await getPipelineState(ctx);
    if (!state || state.buildingGeneration !== args.generation || state.status !== "ready") {
      throw new ConvexError("Analytics generation is not ready");
    }
    if (state.activeGeneration !== args.expectedActiveGeneration) {
      throw new ConvexError("Analytics active generation changed");
    }
    const bootstrap = await getJobByKey(ctx, `bootstrap:${args.generation}`);
    if (!bootstrap?.completedAt || bootstrap.status !== "completed") {
      throw new ConvexError("Analytics bootstrap is incomplete");
    }
    if (!state.projectionCaughtUpAt || state.projectionCaughtUpAt < bootstrap.completedAt) {
      throw new ConvexError("Analytics source events have not caught up after bootstrap");
    }
    if (!state.buildingCaughtUpAt || !state.buildingDataStartDate) {
      throw new ConvexError("Analytics building generation has no catch-up proof");
    }
    const pendingSourceEvents = await ctx.db.query("analyticsSourceEvents").paginate({
      numItems: 1,
      cursor: state.sourceEventCursor ?? null,
    });
    if (pendingSourceEvents.page.length > 0 || !pendingSourceEvents.isDone) {
      throw new ConvexError("Analytics source-event backlog is not empty");
    }
    if (await hasBlockingProjectionJobs(ctx, args.generation)) {
      throw new ConvexError("Analytics projection child jobs are incomplete");
    }
    const baseline = await ctx.db
      .query("analyticsDailyServiceKpis")
      .withIndex("by_generation_and_snapshotDate", (q) =>
        q.eq("generation", args.generation).eq("snapshotDate", state.buildingDataStartDate as string),
      )
      .unique();
    if (baseline?.completeness !== "complete") {
      throw new ConvexError("Analytics baseline snapshot is incomplete");
    }
    const baselineJob = await getJobByKey(ctx, `daily:${args.generation}:${state.buildingDataStartDate as string}`);
    if (baselineJob?.status !== "completed" || !baselineJob.sourceWatermarkAt) {
      throw new ConvexError("Analytics baseline job is incomplete");
    }
    const invariant = await getJobByKey(ctx, dailyInvariantJobKey(baselineJob));
    if (
      invariant?.status !== "completed" ||
      invariant.sourceWatermarkAt !== baselineJob.sourceWatermarkAt ||
      invariant.invariantSnapshotDate !== state.buildingDataStartDate ||
      invariant.invariantSourceEventCursor !== state.sourceEventCursor
    ) {
      throw new ConvexError("Analytics generation invariants are incomplete");
    }
    const jobTypes: Job["jobType"][] = [
      "bootstrap",
      "projection",
      "cycleFinalization",
      "daily",
      "generationCleanup",
      "retentionCleanup",
      "legacyCleanup",
      "invariant",
    ];
    let failedJob: Job | null = null;
    for (const jobType of jobTypes) {
      failedJob = await ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_generation_and_jobType_and_status", (q) =>
          q.eq("generation", args.generation).eq("jobType", jobType).eq("status", "failed"),
        )
        .first();
      if (failedJob) break;
    }
    if (failedJob) throw new ConvexError("Analytics generation has a failed job");

    const previousGeneration = state.activeGeneration;
    const now = Date.now();
    await ctx.db.patch(state._id, {
      activeGeneration: args.generation,
      buildingGeneration: undefined,
      statusBeforeBuilding: undefined,
      dataStartDate: state.buildingDataStartDate,
      buildingDataStartDate: undefined,
      buildingSourceEventCursor: undefined,
      buildingCaughtUpAt: undefined,
      activeNotificationCompleteDate: state.buildingNotificationCompleteDate,
      activeNotificationCompleteAt: state.buildingNotificationCompleteAt,
      buildingNotificationCompleteDate: undefined,
      buildingNotificationCompleteAt: undefined,
      latestCompleteSnapshotDate: baseline.snapshotDate,
      latestCompleteSnapshotAt: baseline.computedAt,
      status: "active",
      updatedAt: now,
    });
    if (previousGeneration && previousGeneration !== args.generation) {
      await ensureGenerationCleanupJob(ctx, previousGeneration, now + INACTIVE_GENERATION_RETENTION_MS);
    }
    const previousDay = addDays(todayJST(), -1);
    if (previousDay >= state.buildingDataStartDate) {
      await ctx.scheduler.runAfter(0, startDeferredDailyAggregationRef, {
        date: previousDay,
        generation: args.generation,
      });
    }
    return { activeGeneration: args.generation, previousGeneration };
  },
});

async function ensureGenerationCleanupJob(ctx: MutationCtx, generation: string, nextRunAt: number) {
  const jobKey = `generation-cleanup:${generation}`;
  const existing = await getJobByKey(ctx, jobKey);
  if (existing) return existing._id;
  return await insertJob(ctx, {
    jobKey,
    jobType: "generationCleanup",
    generation,
    phase: "generationJobsCancel",
    status: "pending",
    attemptCount: 0,
    nextRunAt,
    processedCount: 0,
  });
}

export const abandonBuildingGeneration = internalMutation({
  args: { generation: v.string(), confirmed: v.literal(true) },
  handler: async (ctx, args) => {
    const state = await getPipelineState(ctx);
    if (!state || state.buildingGeneration !== args.generation) {
      throw new ConvexError("Analytics building generation changed");
    }
    const now = Date.now();
    const restoredStatus = state.activeGeneration ? (state.statusBeforeBuilding ?? "degraded") : "idle";
    const mainProjection = await getJobByKey(ctx, `projection:${ANALYTICS_PIPELINE_KEY}`);
    if (state.activeGeneration && mainProjection?.generation === args.generation) {
      await ctx.db.patch(mainProjection._id, {
        generation: state.activeGeneration,
        status: "pending",
        attemptCount: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: now,
        lastErrorCode: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
    }
    await ctx.db.patch(state._id, {
      buildingGeneration: undefined,
      statusBeforeBuilding: undefined,
      buildingDataStartDate: undefined,
      buildingSourceEventCursor: undefined,
      buildingCaughtUpAt: undefined,
      buildingNotificationCompleteDate: undefined,
      buildingNotificationCompleteAt: undefined,
      status: restoredStatus,
      ...(state.activeGeneration
        ? {}
        : {
            sourceEventCursor: undefined,
            lastProjectedAt: undefined,
            projectionCaughtUpAt: undefined,
            activeNotificationCompleteDate: undefined,
            activeNotificationCompleteAt: undefined,
            latestCompleteSnapshotDate: undefined,
            latestCompleteSnapshotAt: undefined,
          }),
      updatedAt: now,
    });
    const cleanupJobId = await ensureGenerationCleanupJob(ctx, args.generation, now);
    const cleanupJob = await ctx.db.get(cleanupJobId);
    if (cleanupJob && cleanupJob.status !== "processing") {
      await ctx.db.patch(cleanupJob._id, {
        phase: "generationJobsCancel",
        cursor: undefined,
        status: "pending",
        attemptCount: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: now,
        processedCount: 0,
        lastErrorCode: undefined,
        completedAt: undefined,
        updatedAt: now,
      });
    }
    await scheduleRecovery(ctx);
    return { cleanupJobId, generation: args.generation };
  },
});

export const startInactiveGenerationCleanup = internalMutation({
  args: { generation: v.string(), confirmed: v.literal(true) },
  handler: async (ctx, args) => {
    const state = await getPipelineState(ctx);
    if (state?.activeGeneration === args.generation || state?.buildingGeneration === args.generation) {
      throw new ConvexError("Active or building analytics generation cannot be cleaned");
    }
    const jobId = await ensureGenerationCleanupJob(ctx, args.generation, Date.now());
    const job = await ctx.db.get(jobId);
    if (job && job.status !== "processing") {
      const restart = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
      await ctx.db.patch(job._id, {
        ...(restart
          ? {
              phase: "generationJobsCancel" as const,
              cursor: undefined,
              attemptCount: 0,
              processedCount: 0,
              lastErrorCode: undefined,
              completedAt: undefined,
            }
          : {}),
        status: "pending",
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await scheduleRecovery(ctx);
    return { jobId, generation: args.generation };
  },
});

export const retryFailedJob = internalMutation({
  args: { jobKey: v.string(), confirmed: v.literal(true) },
  handler: async (ctx, args) => {
    const job = await getJobByKey(ctx, args.jobKey);
    if (job?.status !== "failed") throw new ConvexError("Analytics job is not failed");
    const state = await getPipelineState(ctx);
    if (
      job.jobType !== "generationCleanup" &&
      state?.activeGeneration !== job.generation &&
      state?.buildingGeneration !== job.generation
    ) {
      throw new ConvexError("Inactive analytics generation cannot be retried");
    }
    if (job.jobType === "generationCleanup") {
      if (state?.activeGeneration === job.generation || state?.buildingGeneration === job.generation) {
        throw new ConvexError("Active or building analytics generation cannot be cleaned");
      }
    }
    await ctx.db.patch(job._id, {
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: Date.now(),
      lastErrorCode: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });
    await scheduleRecovery(ctx);
    return { jobId: job._id, jobKey: job.jobKey, phase: job.phase, cursor: job.cursor };
  },
});

export const getStatus = internalQuery({
  args: { generation: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const state = await getPipelineState(ctx);
    let jobs: Job[];
    let hasMoreJobs = false;
    if (args.generation) {
      const batch = await ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_generation", (q) => q.eq("generation", args.generation as string))
        .take(101);
      hasMoreJobs = batch.length > 100;
      jobs = batch.slice(0, 100).sort((a, b) => a.nextRunAt - b.nextRunAt);
    } else {
      const batch = await ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_status_and_nextRunAt")
        .order("asc")
        .take(101);
      hasMoreJobs = batch.length > 100;
      jobs = batch.slice(0, 100);
    }
    const [legacyService, legacyShop, legacyEvents] = await Promise.all([
      ctx.db.query("analyticsDailyServiceSnapshots").withIndex("by_date").take(1),
      ctx.db.query("analyticsDailyShopSnapshots").withIndex("by_date_shopId").take(1),
      ctx.db.query("analyticsDailyEventCounts").withIndex("by_date_metric").take(1),
    ]);
    const generationRows = args.generation
      ? await Promise.all([
          ctx.db
            .query("analyticsOrganizations")
            .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsShops")
            .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsPeople")
            .withIndex("by_generation_and_organizationId", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsMemberships")
            .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
              q.eq("generation", args.generation as string),
            )
            .take(1),
          ctx.db
            .query("analyticsShiftCycles")
            .withIndex("by_generation_and_periodStart", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsShiftCycleOpportunities")
            .withIndex("by_generation_and_recruitmentId_and_staffId", (q) =>
              q.eq("generation", args.generation as string),
            )
            .take(1),
          ctx.db
            .query("analyticsDailyNotificationKpis")
            .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsDailyServiceKpis")
            .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsDailyOrganizationKpis")
            .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsDailyShopKpis")
            .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", args.generation as string))
            .take(1),
          ctx.db
            .query("analyticsDailySegmentKpis")
            .withIndex("by_generation_and_snapshotDate_and_dimension_and_bucket", (q) =>
              q.eq("generation", args.generation as string),
            )
            .take(1),
        ])
      : undefined;
    return {
      state,
      jobs: jobs.map((job) => ({
        jobKey: job.jobKey,
        jobType: job.jobType,
        generation: job.generation,
        targetDate: job.targetDate,
        phase: job.phase,
        status: job.status,
        attemptCount: job.attemptCount,
        processedCount: job.processedCount,
        nextRunAt: job.nextRunAt,
        leaseUntil: job.leaseUntil,
        lastErrorCode: job.lastErrorCode,
        completedAt: job.completedAt,
        lastTransactionMetrics: job.lastTransactionMetrics,
      })),
      hasMoreJobs,
      legacyTables: {
        analyticsDailyServiceSnapshotsIsEmpty: legacyService.length === 0,
        analyticsDailyShopSnapshotsIsEmpty: legacyShop.length === 0,
        analyticsDailyEventCountsIsEmpty: legacyEvents.length === 0,
      },
      generationTables: generationRows
        ? {
            analyticsOrganizationsIsEmpty: generationRows[0].length === 0,
            analyticsShopsIsEmpty: generationRows[1].length === 0,
            analyticsPeopleIsEmpty: generationRows[2].length === 0,
            analyticsMembershipsIsEmpty: generationRows[3].length === 0,
            analyticsShiftCyclesIsEmpty: generationRows[4].length === 0,
            analyticsShiftCycleOpportunitiesIsEmpty: generationRows[5].length === 0,
            analyticsDailyNotificationKpisIsEmpty: generationRows[6].length === 0,
            analyticsDailyServiceKpisIsEmpty: generationRows[7].length === 0,
            analyticsDailyOrganizationKpisIsEmpty: generationRows[8].length === 0,
            analyticsDailyShopKpisIsEmpty: generationRows[9].length === 0,
            analyticsDailySegmentKpisIsEmpty: generationRows[10].length === 0,
          }
        : undefined,
    };
  },
});

type InvariantRollup = NonNullable<Job["invariantServiceRollup"]>;

function emptyInvariantRollup(): InvariantRollup {
  return {
    organizationCount: 0,
    uniquePersonCount: 0,
    managerMembershipCount: 0,
    ...emptyRollup(),
  };
}

function sameRatePair(
  left: { numerator: number; denominator: number },
  right: { numerator: number; denominator: number },
) {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function isValidRatePair(rate: { numerator: number; denominator: number }) {
  return rate.numerator >= 0 && rate.denominator >= 0 && rate.numerator <= rate.denominator;
}

function hasValidSnapshotRates(snapshot: {
  northStar: { numerator: number; denominator: number };
  deadlineSubmission: { numerator: number; denominator: number };
  finalSubmission: { numerator: number; denominator: number };
}) {
  return (
    isValidRatePair(snapshot.northStar) &&
    isValidRatePair(snapshot.deadlineSubmission) &&
    isValidRatePair(snapshot.finalSubmission)
  );
}

function hasValidCumulativeShopMetrics(snapshot: Doc<"analyticsDailyShopKpis">) {
  const hasMedian = snapshot.confirmationLeadTimeMedianMs !== undefined;
  const hasP90 = snapshot.confirmationLeadTimeP90Ms !== undefined;
  return (
    isValidRatePair(snapshot.cumulativeDeadlineSubmission) &&
    isValidRatePair(snapshot.cumulativeFinalSubmission) &&
    snapshot.cumulativeDeadlineSubmission.numerator >= snapshot.deadlineSubmission.numerator &&
    snapshot.cumulativeDeadlineSubmission.denominator >= snapshot.deadlineSubmission.denominator &&
    snapshot.cumulativeFinalSubmission.numerator >= snapshot.finalSubmission.numerator &&
    snapshot.cumulativeFinalSubmission.denominator >= snapshot.finalSubmission.denominator &&
    snapshot.cumulativeNotificationSentCount >= 0 &&
    snapshot.cumulativeNotificationFailedCount >= 0 &&
    hasMedian === hasP90 &&
    (!hasMedian ||
      ((snapshot.confirmationLeadTimeMedianMs ?? -1) >= 0 &&
        (snapshot.confirmationLeadTimeP90Ms ?? -1) >= (snapshot.confirmationLeadTimeMedianMs ?? 0)))
  );
}

function sameCountObject(left: Record<string, number>, right: Record<string, number>) {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].every((key) => left[key] === right[key]);
}

function assertOrganizationShopRollup(organization: Doc<"analyticsDailyOrganizationKpis">, rollup: InvariantRollup) {
  if (
    !hasValidSnapshotRates(organization) ||
    organization.shopCount !== rollup.shopCount ||
    organization.kpiEligibleShopCount !== rollup.kpiEligibleShopCount ||
    organization.activeShopCount !== rollup.activeShopCount ||
    organization.staffMembershipCount !== rollup.staffMembershipCount ||
    organization.unlinkedStaffCount !== rollup.unlinkedStaffCount ||
    organization.shiftTargetCount !== rollup.shiftTargetCount ||
    !sameCountObject(organization.milestoneCounts, rollup.milestoneCounts) ||
    !sameCountObject(organization.healthSignalCounts, rollup.healthSignalCounts) ||
    !sameRatePair(organization.northStar, rollup.northStar) ||
    !sameRatePair(organization.deadlineSubmission, rollup.deadlineSubmission) ||
    !sameRatePair(organization.finalSubmission, rollup.finalSubmission) ||
    (organization.completeness === "complete" && rollup.completeness !== "complete")
  ) {
    throw new Error("analytics_invariant_organization_shop_rollup");
  }
}

function assertServiceOrganizationRollup(service: Doc<"analyticsDailyServiceKpis">, rollup: InvariantRollup) {
  if (
    !hasValidSnapshotRates(service) ||
    service.organizationCount !== rollup.organizationCount ||
    service.shopCount !== rollup.shopCount ||
    service.kpiEligibleShopCount !== rollup.kpiEligibleShopCount ||
    service.activeShopCount !== rollup.activeShopCount ||
    service.personCount !== rollup.uniquePersonCount ||
    service.staffMembershipCount !== rollup.staffMembershipCount ||
    service.unlinkedStaffCount !== rollup.unlinkedStaffCount ||
    service.shiftTargetCount !== rollup.shiftTargetCount ||
    service.managerMembershipCount !== rollup.managerMembershipCount ||
    service.managerStaffCount !== rollup.managerStaffCount ||
    !sameCountObject(service.milestoneCounts, rollup.milestoneCounts) ||
    !sameCountObject(service.healthSignalCounts, rollup.healthSignalCounts) ||
    !sameRatePair(service.northStar, rollup.northStar) ||
    !sameRatePair(service.deadlineSubmission, rollup.deadlineSubmission) ||
    !sameRatePair(service.finalSubmission, rollup.finalSubmission) ||
    (service.completeness === "complete" && rollup.completeness !== "complete")
  ) {
    throw new Error("analytics_invariant_service_organization_rollup");
  }
}

function addOrganizationToInvariantRollup(
  rollup: InvariantRollup,
  organization: Doc<"analyticsDailyOrganizationKpis">,
): InvariantRollup {
  return {
    organizationCount: rollup.organizationCount + 1,
    shopCount: rollup.shopCount + organization.shopCount,
    kpiEligibleShopCount: rollup.kpiEligibleShopCount + organization.kpiEligibleShopCount,
    activeShopCount: rollup.activeShopCount + organization.activeShopCount,
    uniquePersonCount: rollup.uniquePersonCount + organization.uniquePersonCount,
    staffMembershipCount: rollup.staffMembershipCount + organization.staffMembershipCount,
    unlinkedStaffCount: rollup.unlinkedStaffCount + organization.unlinkedStaffCount,
    shiftTargetCount: rollup.shiftTargetCount + organization.shiftTargetCount,
    managerMembershipCount: rollup.managerMembershipCount + organization.managerMembershipCount,
    managerStaffCount: rollup.managerStaffCount + organization.managerStaffCount,
    milestoneCounts: addMilestoneCounts(rollup.milestoneCounts, organization.milestoneCounts),
    healthSignalCounts: addHealthCounts(rollup.healthSignalCounts, organization.healthSignalCounts),
    northStar: addRatePairs(rollup.northStar, organization.northStar),
    deadlineSubmission: addRatePairs(rollup.deadlineSubmission, organization.deadlineSubmission),
    finalSubmission: addRatePairs(rollup.finalSubmission, organization.finalSubmission),
    completeness:
      rollup.completeness === "complete" && organization.completeness === "complete" ? "complete" : "partial",
  };
}

async function requeueInvariantJob(
  ctx: MutationCtx,
  job: Job,
  patch: Partial<
    Pick<
      Job,
      | "phase"
      | "cursor"
      | "parentCursor"
      | "snapshotCursor"
      | "lastVerifiedSnapshotDate"
      | "targetDate"
      | "invariantSnapshotDate"
      | "organizationId"
      | "invariantServiceRollup"
      | "invariantOrganizationRollup"
    >
  >,
  processedDelta = 0,
) {
  await ctx.db.patch(job._id, {
    ...patch,
    status: "pending",
    attemptCount: 0,
    leaseToken: undefined,
    leaseUntil: undefined,
    nextRunAt: Date.now(),
    processedCount: job.processedCount + processedDelta,
    updatedAt: Date.now(),
  });
}

async function processInvariantPage(ctx: MutationCtx, job: Job) {
  const opts = { numItems: CLEANUP_PAGE_SIZE, cursor: job.cursor ?? null };
  switch (job.phase) {
    case "invariantBarrier": {
      const state = await getPipelineState(ctx);
      if (!state || (state.activeGeneration !== job.generation && state.buildingGeneration !== job.generation)) {
        throw new Error("analytics_invariant_generation_changed");
      }
      const backlog = await ctx.db.query("analyticsSourceEvents").paginate({
        numItems: 1,
        cursor: state.sourceEventCursor ?? null,
      });
      if (backlog.page.length > 0 || !backlog.isDone || (await hasBlockingProjectionJobs(ctx, job.generation))) {
        await ctx.db.patch(job._id, {
          status: "pending",
          attemptCount: 0,
          leaseToken: undefined,
          leaseUntil: undefined,
          nextRunAt: Date.now() + MINUTE_MS,
          updatedAt: Date.now(),
        });
        return;
      }
      await ctx.db.patch(job._id, {
        phase: "invariantOrganizations",
        cursor: undefined,
        parentCursor: undefined,
        snapshotCursor: undefined,
        lastVerifiedSnapshotDate: undefined,
        targetDate: undefined,
        invariantSourceEventCursor: state.sourceEventCursor,
        organizationId: undefined,
        invariantServiceRollup: undefined,
        invariantOrganizationRollup: undefined,
        status: "pending",
        attemptCount: 0,
        leaseToken: undefined,
        leaseUntil: undefined,
        nextRunAt: Date.now(),
        processedCount: 0,
        updatedAt: Date.now(),
      });
      return;
    }
    case "invariantOrganizations": {
      const page = await ctx.db
        .query("analyticsOrganizations")
        .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
        .paginate(opts);
      for (const organization of page.page) {
        const sourceOrganization =
          organization.deletedAt === undefined ? await ctx.db.get(organization.organizationId) : null;
        if (
          (organization.deletedAt === undefined && (!sourceOrganization || sourceOrganization.isDeleted)) ||
          (organization.firstShopId === undefined) !== (organization.firstShopAt === undefined) ||
          (organization.secondShopId === undefined) !== (organization.secondShopAt === undefined) ||
          (organization.secondShopAt !== undefined &&
            (organization.firstShopAt === undefined || organization.secondShopAt < organization.firstShopAt)) ||
          (organization.firstShopId !== undefined && organization.firstShopId === organization.secondShopId)
        ) {
          throw new Error("analytics_invariant_organization_milestones");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        { phase: page.isDone ? "invariantShops" : job.phase, cursor: page.isDone ? undefined : page.continueCursor },
        page.page.length,
      );
      return;
    }
    case "invariantShops": {
      const page = await ctx.db
        .query("analyticsShops")
        .withIndex("by_generation_and_registeredAt", (q) => q.eq("generation", job.generation))
        .paginate(opts);
      for (const shop of page.page) {
        const [organization, sourceShop] = await Promise.all([
          ctx.db
            .query("analyticsOrganizations")
            .withIndex("by_generation_and_organizationId", (q) =>
              q.eq("generation", job.generation).eq("organizationId", shop.organizationId),
            )
            .unique(),
          shop.deletedAt === undefined ? ctx.db.get(shop.shopId) : null,
        ]);
        if (
          !organization ||
          (shop.deletedAt === undefined &&
            (!sourceShop || sourceShop.isDeleted || sourceShop.organizationId !== shop.organizationId)) ||
          (shop.firstConfirmedRecruitmentId === undefined) !== (shop.firstConfirmedAt === undefined) ||
          (shop.secondConfirmedRecruitmentId === undefined) !== (shop.secondConfirmedAt === undefined) ||
          (shop.secondConfirmedAt !== undefined &&
            (shop.firstConfirmedAt === undefined || shop.secondConfirmedAt < shop.firstConfirmedAt)) ||
          (shop.firstConfirmedRecruitmentId !== undefined &&
            shop.firstConfirmedRecruitmentId === shop.secondConfirmedRecruitmentId)
        ) {
          throw new Error("analytics_invariant_shop_scope_or_milestones");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantPeople" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantPeople": {
      const page = await ctx.db
        .query("analyticsPeople")
        .withIndex("by_generation_and_organizationId", (q) => q.eq("generation", job.generation))
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const person of page.page) {
        const [organization, uniquePerson, sourcePerson] = await Promise.all([
          ctx.db
            .query("analyticsOrganizations")
            .withIndex("by_generation_and_organizationId", (q) =>
              q.eq("generation", job.generation).eq("organizationId", person.organizationId),
            )
            .unique(),
          ctx.db
            .query("analyticsPeople")
            .withIndex("by_generation_and_organizationPersonId", (q) =>
              q.eq("generation", job.generation).eq("organizationPersonId", person.organizationPersonId),
            )
            .unique(),
          person.deletedAt === undefined ? ctx.db.get(person.organizationPersonId) : null,
        ]);
        if (
          !organization ||
          uniquePerson?._id !== person._id ||
          (person.deletedAt === undefined &&
            (sourcePerson?.status !== "active" || sourcePerson.organizationId !== person.organizationId))
        ) {
          throw new Error("analytics_invariant_person_parent_scope");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantMemberships" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantMemberships": {
      const page = await ctx.db
        .query("analyticsMemberships")
        .withIndex("by_generation_and_membershipKey_and_validFrom", (q) => q.eq("generation", job.generation))
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const membership of page.page) {
        const [organization, person] = await Promise.all([
          ctx.db
            .query("analyticsOrganizations")
            .withIndex("by_generation_and_organizationId", (q) =>
              q.eq("generation", job.generation).eq("organizationId", membership.organizationId),
            )
            .unique(),
          membership.organizationPersonId
            ? ctx.db
                .query("analyticsPeople")
                .withIndex("by_generation_and_organizationPersonId", (q) =>
                  q
                    .eq("generation", job.generation)
                    .eq("organizationPersonId", membership.organizationPersonId as Id<"organizationPeople">),
                )
                .unique()
            : null,
        ]);
        if (!organization || (membership.validTo !== undefined && membership.validTo < membership.validFrom)) {
          throw new Error("analytics_invariant_membership_parent_scope");
        }
        if (membership.role === "manager") {
          if (
            !membership.organizationPersonId ||
            !person ||
            person.organizationId !== membership.organizationId ||
            membership.membershipKey !== `manager:${membership.organizationId}:${membership.organizationPersonId}`
          ) {
            throw new Error("analytics_invariant_manager_membership_key");
          }
          if (membership.validTo === undefined) {
            const sourceMember = await ctx.db
              .query("organizationMembers")
              .withIndex("by_organizationId_and_personId", (q) =>
                q.eq("organizationId", membership.organizationId).eq("personId", membership.organizationPersonId),
              )
              .unique();
            if (sourceMember?.status !== "active") {
              throw new Error("analytics_invariant_active_manager_source_scope");
            }
          }
          continue;
        }
        if (membership.organizationPersonId && (!person || person.organizationId !== membership.organizationId)) {
          throw new Error("analytics_invariant_staff_person_scope");
        }
        const [shop, sourceStaff, sourceShop] = await Promise.all([
          ctx.db
            .query("analyticsShops")
            .withIndex("by_generation_and_shopId", (q) =>
              q.eq("generation", job.generation).eq("shopId", membership.shopId),
            )
            .unique(),
          membership.validTo === undefined ? ctx.db.get(membership.staffId) : null,
          membership.validTo === undefined ? ctx.db.get(membership.shopId) : null,
        ]);
        if (
          membership.membershipKey !== `staff:${membership.staffId}` ||
          !shop ||
          shop.organizationId !== membership.organizationId
        ) {
          throw new Error("analytics_invariant_staff_membership_scope");
        }
        if (membership.validTo === undefined) {
          if (
            !sourceStaff ||
            !sourceShop?.organizationId ||
            sourceStaff.isDeleted ||
            sourceStaff.shopId !== membership.shopId ||
            sourceShop.organizationId !== membership.organizationId ||
            (sourceStaff.organizationId ?? sourceShop.organizationId) !== membership.organizationId ||
            sourceStaff.organizationPersonId !== membership.organizationPersonId
          ) {
            throw new Error("analytics_invariant_active_staff_source_scope");
          }
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantCycles" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantCycles": {
      const page = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_periodStart", (q) => q.eq("generation", job.generation))
        .paginate(opts);
      for (const cycle of page.page) {
        const [organization, shop] = await Promise.all([
          ctx.db
            .query("analyticsOrganizations")
            .withIndex("by_generation_and_organizationId", (q) =>
              q.eq("generation", job.generation).eq("organizationId", cycle.organizationId),
            )
            .unique(),
          ctx.db
            .query("analyticsShops")
            .withIndex("by_generation_and_shopId", (q) => q.eq("generation", job.generation).eq("shopId", cycle.shopId))
            .unique(),
        ]);
        if (
          !organization ||
          !shop ||
          shop.organizationId !== cycle.organizationId ||
          (cycle.targetAtDeadline !== undefined && (cycle.submittedAtDeadline ?? 0) > cycle.targetAtDeadline) ||
          (cycle.targetAtClose !== undefined && (cycle.submittedAtClose ?? 0) > cycle.targetAtClose) ||
          (cycle.completeness === "complete" &&
            (cycle.targetAtDeadline === undefined ||
              cycle.submittedAtDeadline === undefined ||
              cycle.targetAtClose === undefined ||
              cycle.submittedAtClose === undefined ||
              cycle.finalizedAt === undefined))
        ) {
          throw new Error("analytics_invariant_cycle_scope_or_rate");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantSourceOrganizations" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantSourceOrganizations": {
      const page = await ctx.db.query("organizations").paginate(opts);
      for (const organization of page.page) {
        const projected = await ctx.db
          .query("analyticsOrganizations")
          .withIndex("by_generation_and_organizationId", (q) =>
            q.eq("generation", job.generation).eq("organizationId", organization._id),
          )
          .unique();
        if (!projected || organization.isDeleted !== (projected.deletedAt !== undefined)) {
          throw new Error("analytics_invariant_source_organization_missing");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantSourceShops" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantSourceShops": {
      const page = await ctx.db.query("shops").paginate(opts);
      for (const sourceShop of page.page) {
        if (!sourceShop.organizationId) throw new Error("analytics_invariant_source_shop_organization_missing");
        const projected = await ctx.db
          .query("analyticsShops")
          .withIndex("by_generation_and_shopId", (q) => q.eq("generation", job.generation).eq("shopId", sourceShop._id))
          .unique();
        const inactive =
          sourceShop.isDeleted ||
          sourceShop.operatingStatus === "archived" ||
          sourceShop.operatingStatus === "planSuspended";
        if (
          !projected ||
          projected.organizationId !== sourceShop.organizationId ||
          inactive !== (projected.deletedAt !== undefined)
        ) {
          throw new Error("analytics_invariant_source_shop_missing");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantSourcePeople" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantSourcePeople": {
      const page = await ctx.db
        .query("organizationPeople")
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const sourcePerson of page.page) {
        const projected = await ctx.db
          .query("analyticsPeople")
          .withIndex("by_generation_and_organizationPersonId", (q) =>
            q.eq("generation", job.generation).eq("organizationPersonId", sourcePerson._id),
          )
          .unique();
        if (
          !projected ||
          projected.organizationId !== sourcePerson.organizationId ||
          (sourcePerson.status === "removed") !== (projected.deletedAt !== undefined)
        ) {
          throw new Error("analytics_invariant_source_person_missing");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantSourceManagers" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantSourceManagers": {
      const page = await ctx.db
        .query("organizationMembers")
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const sourceMember of page.page) {
        const membership = await ctx.db
          .query("analyticsMemberships")
          .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
            q
              .eq("generation", job.generation)
              .eq("membershipKey", `manager:${sourceMember.organizationId}:${sourceMember.personId}`),
          )
          .order("desc")
          .first();
        const shouldBeOpen = sourceMember.status === "active";
        if (!membership) {
          if (shouldBeOpen) throw new Error("analytics_invariant_source_manager_missing");
          continue;
        }
        if (
          membership.role !== "manager" ||
          membership.organizationId !== sourceMember.organizationId ||
          membership.organizationPersonId !== sourceMember.personId ||
          shouldBeOpen !== (membership.validTo === undefined)
        ) {
          throw new Error("analytics_invariant_source_manager_missing");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: page.isDone ? "invariantSourceStaffs" : job.phase,
          cursor: page.isDone ? undefined : page.continueCursor,
        },
        page.page.length,
      );
      return;
    }
    case "invariantSourceStaffs": {
      const page = await ctx.db
        .query("staffs")
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      for (const sourceStaff of page.page) {
        const [sourceShop, membership] = await Promise.all([
          ctx.db.get(sourceStaff.shopId),
          ctx.db
            .query("analyticsMemberships")
            .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
              q.eq("generation", job.generation).eq("membershipKey", `staff:${sourceStaff._id}`),
            )
            .order("desc")
            .first(),
        ]);
        if (!sourceShop?.organizationId) throw new Error("analytics_invariant_source_staff_shop_missing");
        const organizationId = sourceStaff.organizationId ?? sourceShop.organizationId;
        if (!membership) {
          if (!sourceStaff.isDeleted || organizationId !== sourceShop.organizationId) {
            throw new Error("analytics_invariant_source_staff_missing");
          }
          continue;
        }
        if (
          organizationId !== sourceShop.organizationId ||
          membership.role !== "staff" ||
          membership.organizationId !== organizationId ||
          membership.shopId !== sourceStaff.shopId ||
          membership.organizationPersonId !== sourceStaff.organizationPersonId ||
          sourceStaff.isDeleted === (membership.validTo === undefined)
        ) {
          throw new Error("analytics_invariant_source_staff_missing");
        }
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: job.invariantSnapshotDate ? "invariantOrganizationSelect" : "invariantSnapshotSelect",
          cursor: undefined,
          ...(job.invariantSnapshotDate
            ? {
                targetDate: job.invariantSnapshotDate,
                parentCursor: undefined,
                invariantServiceRollup: emptyInvariantRollup(),
                invariantOrganizationRollup: undefined,
              }
            : {}),
        },
        page.page.length,
      );
      return;
    }
    case "invariantSnapshotSelect": {
      const page = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_generation_and_snapshotDate", (q) => q.eq("generation", job.generation))
        .paginate({ numItems: 1, cursor: job.snapshotCursor ?? null });
      const snapshot = page.page[0];
      if (!snapshot) {
        await requeueInvariantJob(ctx, job, { phase: "invariantFinalize", cursor: undefined });
        return;
      }
      if (snapshot.snapshotDate === job.lastVerifiedSnapshotDate) {
        throw new Error("analytics_invariant_duplicate_service_snapshot");
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: "invariantOrganizationSelect",
          cursor: undefined,
          parentCursor: undefined,
          snapshotCursor: page.continueCursor,
          lastVerifiedSnapshotDate: snapshot.snapshotDate,
          targetDate: snapshot.snapshotDate,
          organizationId: undefined,
          invariantServiceRollup: emptyInvariantRollup(),
          invariantOrganizationRollup: undefined,
        },
        1,
      );
      return;
    }
    case "invariantOrganizationSelect": {
      if (!job.targetDate || !job.invariantServiceRollup) throw new Error("analytics_invariant_snapshot_scope_missing");
      const page = await ctx.db
        .query("analyticsDailyOrganizationKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
        )
        .paginate({ numItems: 1, cursor: job.parentCursor ?? null });
      const organization = page.page[0];
      if (!organization) {
        const service = await ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_generation_and_snapshotDate", (q) =>
            q.eq("generation", job.generation).eq("snapshotDate", job.targetDate as string),
          )
          .unique();
        if (!service) throw new Error("analytics_invariant_service_snapshot_missing");
        assertServiceOrganizationRollup(service, job.invariantServiceRollup);
        if (job.invariantSnapshotDate) {
          await requeueInvariantJob(ctx, job, {
            phase: "invariantFinalize",
            cursor: undefined,
            parentCursor: undefined,
          });
          return;
        }
        await requeueInvariantJob(ctx, job, {
          phase: "invariantSnapshotSelect",
          cursor: undefined,
          parentCursor: undefined,
          targetDate: undefined,
          organizationId: undefined,
          invariantServiceRollup: undefined,
          invariantOrganizationRollup: undefined,
        });
        return;
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: "invariantOrganizationShops",
          cursor: undefined,
          parentCursor: page.continueCursor,
          organizationId: organization.organizationId,
          invariantOrganizationRollup: emptyInvariantRollup(),
        },
        1,
      );
      return;
    }
    case "invariantOrganizationShops": {
      if (!job.targetDate || !job.organizationId || !job.invariantOrganizationRollup || !job.invariantServiceRollup) {
        throw new Error("analytics_invariant_organization_scope_missing");
      }
      const page = await ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_generation_and_organizationId_and_snapshotDate", (q) =>
          q
            .eq("generation", job.generation)
            .eq("organizationId", job.organizationId as Id<"organizations">)
            .eq("snapshotDate", job.targetDate as string),
        )
        .paginate(opts);
      const organizationRollup = { ...job.invariantOrganizationRollup };
      for (const shop of page.page) {
        const uniqueShop = await ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
            q
              .eq("generation", job.generation)
              .eq("shopId", shop.shopId)
              .eq("snapshotDate", job.targetDate as string),
          )
          .unique();
        if (
          !uniqueShop ||
          uniqueShop._id !== shop._id ||
          !hasValidSnapshotRates(shop) ||
          !hasValidCumulativeShopMetrics(shop)
        ) {
          throw new Error("analytics_invariant_shop_unique_or_rate");
        }
        addShopToRollup(organizationRollup, shop);
      }
      if (!page.isDone) {
        await requeueInvariantJob(
          ctx,
          job,
          { cursor: page.continueCursor, invariantOrganizationRollup: organizationRollup },
          page.page.length,
        );
        return;
      }
      const organization = await getDailyOrganizationSnapshot(ctx, job.generation, job.targetDate, job.organizationId);
      if (!organization) throw new Error("analytics_invariant_organization_snapshot_missing");
      assertOrganizationShopRollup(organization, organizationRollup);
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: "invariantOrganizationPeople",
          cursor: undefined,
          invariantOrganizationRollup: organizationRollup,
        },
        page.page.length,
      );
      return;
    }
    case "invariantOrganizationPeople": {
      if (!job.targetDate || !job.organizationId || !job.invariantOrganizationRollup || !job.invariantServiceRollup) {
        throw new Error("analytics_invariant_organization_people_scope_missing");
      }
      const cutoffAt = Math.min(jstDayRangeMs(job.targetDate).endMs, job.sourceWatermarkAt ?? Number.MAX_SAFE_INTEGER);
      const page = await ctx.db
        .query("analyticsPeople")
        .withIndex("by_generation_and_organizationId", (q) =>
          q.eq("generation", job.generation).eq("organizationId", job.organizationId as Id<"organizations">),
        )
        .paginate({ numItems: INVARIANT_MEMBERSHIP_PAGE_SIZE, cursor: job.cursor ?? null });
      let managerStaffCount = job.invariantOrganizationRollup.managerStaffCount;
      for (const person of page.page) {
        if (person.firstObservedAt >= cutoffAt || (person.deletedAt !== undefined && person.deletedAt < cutoffAt)) {
          continue;
        }
        const roles = await getPersonMembershipRolesAt(
          ctx,
          job.generation,
          job.organizationId,
          person.organizationPersonId,
          cutoffAt,
        );
        if (!roles.complete) throw new Error("analytics_invariant_manager_staff_history_truncated");
        if (roles.hasManager && roles.hasStaff) managerStaffCount += 1;
      }
      if (!page.isDone) {
        await requeueInvariantJob(
          ctx,
          job,
          {
            cursor: page.continueCursor,
            invariantOrganizationRollup: { ...job.invariantOrganizationRollup, managerStaffCount },
          },
          page.page.length,
        );
        return;
      }
      const organization = await getDailyOrganizationSnapshot(ctx, job.generation, job.targetDate, job.organizationId);
      if (!organization || organization.managerStaffCount !== managerStaffCount) {
        throw new Error("analytics_invariant_organization_manager_staff_count");
      }
      await requeueInvariantJob(
        ctx,
        job,
        {
          phase: "invariantOrganizationSelect",
          cursor: undefined,
          organizationId: undefined,
          invariantServiceRollup: addOrganizationToInvariantRollup(job.invariantServiceRollup, organization),
          invariantOrganizationRollup: undefined,
        },
        page.page.length,
      );
      return;
    }
    case "invariantFinalize":
      await finishInvariantProof(ctx, job);
      return;
    default:
      throw new Error("analytics_invariant_phase_invalid");
  }
}

async function finishInvariantProof(ctx: MutationCtx, job: Job) {
  const state = await getPipelineState(ctx);
  if (!state || (state.activeGeneration !== job.generation && state.buildingGeneration !== job.generation)) {
    throw new Error("analytics_invariant_generation_changed");
  }
  const backlog = await ctx.db.query("analyticsSourceEvents").paginate({
    numItems: 1,
    cursor: state.sourceEventCursor ?? null,
  });
  if (backlog.page.length > 0 || !backlog.isDone || (await hasBlockingProjectionJobs(ctx, job.generation))) {
    await ctx.db.patch(job._id, {
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: Date.now() + MINUTE_MS,
      updatedAt: Date.now(),
    });
    return;
  }
  if (state.sourceEventCursor !== job.invariantSourceEventCursor) {
    await ctx.db.patch(job._id, {
      phase: "invariantBarrier",
      cursor: undefined,
      parentCursor: undefined,
      snapshotCursor: undefined,
      lastVerifiedSnapshotDate: undefined,
      targetDate: undefined,
      invariantSourceEventCursor: undefined,
      organizationId: undefined,
      invariantServiceRollup: undefined,
      invariantOrganizationRollup: undefined,
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: Date.now(),
      processedCount: 0,
      updatedAt: Date.now(),
    });
    return;
  }
  await completeJob(ctx, job);
}

async function ensureInvariantJob(
  ctx: MutationCtx,
  generation: string,
  jobKey: string,
  restartCompleted: boolean,
  scope?: { snapshotDate: string; sourceWatermarkAt: number },
) {
  const state = await getPipelineState(ctx);
  if (!state || (state.activeGeneration !== generation && state.buildingGeneration !== generation)) {
    throw new Error("analytics_invariant_generation_missing");
  }
  const existing = await getJobByKey(ctx, jobKey);
  if (existing) {
    if (existing.status === "processing" || (existing.status === "pending" && !restartCompleted)) return existing._id;
    if (existing.status === "completed" && !restartCompleted) return existing._id;
    await ctx.db.patch(existing._id, {
      phase: "invariantBarrier",
      cursor: undefined,
      parentCursor: undefined,
      snapshotCursor: undefined,
      lastVerifiedSnapshotDate: undefined,
      targetDate: undefined,
      invariantSnapshotDate: scope?.snapshotDate,
      sourceWatermarkAt: scope?.sourceWatermarkAt,
      invariantSourceEventCursor: undefined,
      organizationId: undefined,
      invariantServiceRollup: undefined,
      invariantOrganizationRollup: undefined,
      status: "pending",
      attemptCount: 0,
      leaseToken: undefined,
      leaseUntil: undefined,
      nextRunAt: Date.now(),
      processedCount: 0,
      lastErrorCode: undefined,
      completedAt: undefined,
      updatedAt: Date.now(),
    });
    await scheduleRecovery(ctx);
    return existing._id;
  }
  const jobId = await insertJob(ctx, {
    jobKey,
    jobType: "invariant",
    generation,
    phase: "invariantBarrier",
    ...(scope ? { invariantSnapshotDate: scope.snapshotDate, sourceWatermarkAt: scope.sourceWatermarkAt } : {}),
    status: "pending",
    attemptCount: 0,
    nextRunAt: Date.now(),
    processedCount: 0,
  });
  await scheduleRecovery(ctx);
  return jobId;
}

export const checkGenerationInvariants = internalMutation({
  args: { generation: v.string() },
  handler: async (ctx, args) => {
    const jobId = await ensureInvariantJob(ctx, args.generation, `invariant:${args.generation}:manual`, true);
    return { generation: args.generation, jobId };
  },
});
