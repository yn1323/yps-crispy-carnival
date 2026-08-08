import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { addDays, dateJST, getSubmitLinkCutoff, jstDayRangeMs } from "../_lib/dateFormat";
import { DAY_MS } from "../constants";
import { emptyHealthSignalCounts, emptyMilestoneCounts, emptyRatePair } from "./model";
import { ANALYTICS_POLICY } from "./registry";

type AnalyticsRun = Doc<"analyticsRuns">;
type DailyShop = Doc<"analyticsDailyShopKpis">;
type DailySegment = Doc<"analyticsDailySegmentKpis">;
type NotificationKind = Doc<"analyticsDailyNotificationKpis">["kind"];
type NotificationScope = Doc<"analyticsDailyNotificationKpis">["scope"];

export type AnalyticsAggregationPageResult = {
  continueCursor: string | null;
  isDone: boolean;
  processedCount: number;
};

const SCOPE_READ_LIMIT = ANALYTICS_POLICY.batch.scopeReadLimit;
const NOTIFICATION_PAGE_SIZE = ANALYTICS_POLICY.batch.sourceEvents;
const SEGMENT_PAGE_SIZE = ANALYTICS_POLICY.batch.segmentRollup;

function requireDailyTarget(run: AnalyticsRun): string {
  if (run.kind !== "daily" || run.targetDate === undefined) {
    throw new Error("analytics_daily_run_required");
  }
  return run.targetDate;
}

function pageResult(page: {
  continueCursor: string;
  isDone: boolean;
  page: unknown[];
}): AnalyticsAggregationPageResult {
  return {
    continueCursor: page.isDone ? null : page.continueCursor,
    isDone: page.isDone,
    processedCount: page.page.length,
  };
}

function assertScopeLimit<T>(rows: readonly T[], errorCode = "analytics_scope_limit_exceeded"): void {
  if (rows.length > SCOPE_READ_LIMIT) throw new Error(errorCode);
}

function assertSinglePageRow(rows: readonly unknown[]): void {
  if (rows.length > 1) throw new Error("analytics_single_scope_page_overflow");
}

function activeAt(row: { validFrom: number; validTo?: number }, cutoffAt: number): boolean {
  return row.validFrom < cutoffAt && (row.validTo === undefined || cutoffAt <= row.validTo);
}

function activeShopAt(shop: Pick<Doc<"analyticsShops">, "registeredAt" | "deletedAt">, cutoffAt: number): boolean {
  return shop.registeredAt < cutoffAt && (shop.deletedAt === undefined || cutoffAt <= shop.deletedAt);
}

function activeOrganizationAt(
  organization: Pick<Doc<"analyticsOrganizations">, "registeredAt" | "deletedAt">,
  cutoffAt: number,
): boolean {
  return (
    organization.registeredAt < cutoffAt && (organization.deletedAt === undefined || cutoffAt <= organization.deletedAt)
  );
}

function activeCycleAt(cycle: Pick<Doc<"analyticsShiftCycles">, "createdAt" | "deletedAt">, cutoffAt: number): boolean {
  return cycle.createdAt < cutoffAt && (cycle.deletedAt === undefined || cutoffAt <= cycle.deletedAt);
}

function ratio(pair: { numerator: number; denominator: number }): number | undefined {
  return pair.denominator > 0 ? pair.numerator / pair.denominator : undefined;
}

function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0 ? ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2 : ordered[middle];
}

function p90(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * 0.9) - 1)];
}

function addRatePairs(
  left: ReturnType<typeof emptyRatePair>,
  right: ReturnType<typeof emptyRatePair>,
): ReturnType<typeof emptyRatePair> {
  return {
    numerator: left.numerator + right.numerator,
    denominator: left.denominator + right.denominator,
  };
}

function addMilestoneCounts(
  left: ReturnType<typeof emptyMilestoneCounts>,
  right: ReturnType<typeof emptyMilestoneCounts>,
): ReturnType<typeof emptyMilestoneCounts> {
  const result = { ...left };
  for (const key of Object.keys(result) as Array<keyof typeof result>) result[key] += right[key];
  return result;
}

function addHealthCounts(
  left: ReturnType<typeof emptyHealthSignalCounts>,
  right: ReturnType<typeof emptyHealthSignalCounts>,
): ReturnType<typeof emptyHealthSignalCounts> {
  const result = { ...left };
  for (const key of Object.keys(result) as Array<keyof typeof result>) result[key] += right[key];
  return result;
}

function assertRatePair(pair: { numerator: number; denominator: number }): void {
  if (pair.numerator < 0 || pair.denominator < 0 || pair.numerator > pair.denominator) {
    throw new Error("analytics_rate_pair_invalid");
  }
}

async function getShopDimension(ctx: MutationCtx, shopId: Id<"shops">) {
  return await ctx.db
    .query("analyticsShops")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .unique();
}

async function getDailyShopRow(ctx: MutationCtx, run: AnalyticsRun, shopId: Id<"shops">) {
  const targetDate = requireDailyTarget(run);
  const rows = await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_shopId_and_snapshotDate", (q) => q.eq("shopId", shopId).eq("snapshotDate", targetDate))
    .take(2);
  if (rows.length > 1) throw new Error("analytics_daily_shop_duplicate");
  const row = rows[0] ?? null;
  if (row && row.runId !== run._id) throw new Error("analytics_daily_output_run_conflict");
  return row;
}

async function getDailyOrganizationRow(ctx: MutationCtx, run: AnalyticsRun, organizationId: Id<"organizations">) {
  const targetDate = requireDailyTarget(run);
  const rows = await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_organizationId_and_snapshotDate", (q) =>
      q.eq("organizationId", organizationId).eq("snapshotDate", targetDate),
    )
    .take(2);
  if (rows.length > 1) throw new Error("analytics_daily_organization_duplicate");
  const row = rows[0] ?? null;
  if (row && row.runId !== run._id) throw new Error("analytics_daily_output_run_conflict");
  return row;
}

async function getDailyServiceRow(ctx: MutationCtx, run: AnalyticsRun) {
  const targetDate = requireDailyTarget(run);
  const rows = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", targetDate))
    .take(2);
  if (rows.length > 1) throw new Error("analytics_daily_service_duplicate");
  const row = rows[0] ?? null;
  if (row && row.runId !== run._id) throw new Error("analytics_daily_output_run_conflict");
  return row;
}

function notificationKind(notificationContext: string | undefined): NotificationKind {
  const context = notificationContext?.toLowerCase() ?? "";
  if (context.includes("reminder")) return "reminder";
  if (context.includes("confirmation") || context.includes("reissue")) return "confirmation";
  if (context.includes("recruitment")) return "recruitment";
  return "other";
}

type NotificationAggregate = {
  scope: NotificationScope;
  scopeKey: string;
  recruitmentId?: Id<"recruitments">;
  organizationId?: Id<"organizations">;
  shopId?: Id<"shops">;
  channel: Doc<"notificationOutbox">["channel"];
  kind: NotificationKind;
  sentCount: number;
  failedCount: number;
  lastFailedAt?: number;
};

function addNotificationAggregate(
  aggregates: Map<string, NotificationAggregate>,
  args: Omit<NotificationAggregate, "sentCount" | "failedCount" | "lastFailedAt"> & {
    status: "sent" | "failed";
    occurredAt: number;
  },
): void {
  const key = `${args.scopeKey}:${args.channel}:${args.kind}`;
  const aggregate = aggregates.get(key) ?? {
    scope: args.scope,
    scopeKey: args.scopeKey,
    ...(args.recruitmentId ? { recruitmentId: args.recruitmentId } : {}),
    ...(args.organizationId ? { organizationId: args.organizationId } : {}),
    ...(args.shopId ? { shopId: args.shopId } : {}),
    channel: args.channel,
    kind: args.kind,
    sentCount: 0,
    failedCount: 0,
  };
  if (args.status === "sent") aggregate.sentCount += 1;
  else {
    aggregate.failedCount += 1;
    aggregate.lastFailedAt = Math.max(aggregate.lastFailedAt ?? 0, args.occurredAt);
  }
  aggregates.set(key, aggregate);
}

async function upsertNotificationAggregate(
  ctx: MutationCtx,
  run: AnalyticsRun,
  aggregate: NotificationAggregate,
): Promise<void> {
  const targetDate = requireDailyTarget(run);
  const existing = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_runId_and_scopeKey_and_channel_and_kind", (q) =>
      q
        .eq("runId", run._id)
        .eq("scopeKey", aggregate.scopeKey)
        .eq("channel", aggregate.channel)
        .eq("kind", aggregate.kind),
    )
    .unique();
  if (
    existing &&
    (existing.snapshotDate !== targetDate ||
      existing.scope !== aggregate.scope ||
      existing.recruitmentId !== aggregate.recruitmentId ||
      existing.organizationId !== aggregate.organizationId ||
      existing.shopId !== aggregate.shopId)
  ) {
    throw new Error("analytics_notification_scope_conflict");
  }
  const lastFailedAt =
    existing?.lastFailedAt === undefined
      ? aggregate.lastFailedAt
      : aggregate.lastFailedAt === undefined
        ? existing.lastFailedAt
        : Math.max(existing.lastFailedAt, aggregate.lastFailedAt);
  const value = {
    runId: run._id,
    snapshotDate: targetDate,
    scope: aggregate.scope,
    scopeKey: aggregate.scopeKey,
    ...(aggregate.recruitmentId ? { recruitmentId: aggregate.recruitmentId } : {}),
    ...(aggregate.organizationId ? { organizationId: aggregate.organizationId } : {}),
    ...(aggregate.shopId ? { shopId: aggregate.shopId } : {}),
    channel: aggregate.channel,
    kind: aggregate.kind,
    sentCount: (existing?.sentCount ?? 0) + aggregate.sentCount,
    failedCount: (existing?.failedCount ?? 0) + aggregate.failedCount,
    ...(lastFailedAt === undefined ? {} : { lastFailedAt }),
    completeness: "complete" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailyNotificationKpis", value);
}

/**
 * notification pageの加算は、呼出し側がrun fenceの照合、step進行、次page予約を
 * 同じtransactionで行うことを前提にexact-onceになる。
 */
export async function aggregateDailyNotificationPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  args: { status: "sent" | "failed"; cursor: string | null },
): Promise<AnalyticsAggregationPageResult> {
  const targetDate = requireDailyTarget(run);
  const { startMs } = jstDayRangeMs(targetDate);
  const page =
    args.status === "sent"
      ? await ctx.db
          .query("notificationOutbox")
          .withIndex("by_status_sentAt", (q) =>
            q.eq("status", "sent").gte("sentAt", startMs).lt("sentAt", run.cutoffAt),
          )
          .paginate({
            numItems: NOTIFICATION_PAGE_SIZE,
            cursor: args.cursor,
            maximumRowsRead: NOTIFICATION_PAGE_SIZE,
          })
      : await ctx.db
          .query("notificationOutbox")
          .withIndex("by_status_failedAt", (q) =>
            q.eq("status", "failed").gte("failedAt", startMs).lt("failedAt", run.cutoffAt),
          )
          .paginate({
            numItems: NOTIFICATION_PAGE_SIZE,
            cursor: args.cursor,
            maximumRowsRead: NOTIFICATION_PAGE_SIZE,
          });
  const aggregates = new Map<string, NotificationAggregate>();
  for (const notification of page.page) {
    const occurredAt = args.status === "sent" ? notification.sentAt : notification.failedAt;
    if (occurredAt === undefined) throw new Error("analytics_notification_terminal_at_missing");
    const kind = notificationKind(notification.notificationContext);
    addNotificationAggregate(aggregates, {
      scope: "service",
      scopeKey: "service",
      channel: notification.channel,
      kind,
      status: args.status,
      occurredAt,
    });
    if (notification.shopId) {
      addNotificationAggregate(aggregates, {
        scope: "shop",
        scopeKey: `shop:${notification.shopId}`,
        ...(notification.organizationId ? { organizationId: notification.organizationId } : {}),
        shopId: notification.shopId,
        channel: notification.channel,
        kind,
        status: args.status,
        occurredAt,
      });
    }
    if (!notification.recruitmentId) continue;
    const cycle = await ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", notification.recruitmentId as Id<"recruitments">))
      .unique();
    if (!cycle || !activeCycleAt(cycle, run.cutoffAt)) continue;
    if (notification.shopId && notification.shopId !== cycle.shopId) {
      throw new Error("analytics_notification_cycle_scope_mismatch");
    }
    if (notification.organizationId && notification.organizationId !== cycle.organizationId) {
      throw new Error("analytics_notification_cycle_scope_mismatch");
    }
    const closeAt = cycle.confirmedAt ?? getSubmitLinkCutoff(cycle.periodStart);
    if (occurredAt < cycle.createdAt || closeAt <= occurredAt) continue;
    addNotificationAggregate(aggregates, {
      scope: "recruitment",
      scopeKey: `recruitment:${cycle.recruitmentId}`,
      recruitmentId: cycle.recruitmentId,
      organizationId: cycle.organizationId,
      shopId: cycle.shopId,
      channel: notification.channel,
      kind,
      status: args.status,
      occurredAt,
    });
  }
  for (const aggregate of aggregates.values()) await upsertNotificationAggregate(ctx, run, aggregate);
  return pageResult(page);
}

async function boundedActiveStaffMemberships(ctx: MutationCtx, shopId: Id<"shops">, cutoffAt: number) {
  const rows = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_shopId_and_role_and_validFrom", (q) =>
      q.eq("shopId", shopId).eq("role", "staff").lt("validFrom", cutoffAt),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_shop_staff_scope_too_large");
  return rows.filter(
    (row): row is Extract<Doc<"analyticsMemberships">, { role: "staff" }> =>
      row.role === "staff" && activeAt(row, cutoffAt),
  );
}

async function boundedActiveManagerMemberships(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  cutoffAt: number,
) {
  const rows = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_organizationId_and_role_and_validFrom", (q) =>
      q.eq("organizationId", organizationId).eq("role", "manager").lt("validFrom", cutoffAt),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_organization_manager_scope_too_large");
  return rows.filter(
    (row): row is Extract<Doc<"analyticsMemberships">, { role: "manager" }> =>
      row.role === "manager" && activeAt(row, cutoffAt),
  );
}

function assertUniqueActiveMemberships(rows: readonly Doc<"analyticsMemberships">[]): void {
  const keys = new Set<string>();
  for (const row of rows) {
    if (keys.has(row.membershipKey)) throw new Error("analytics_active_membership_duplicate");
    keys.add(row.membershipKey);
  }
}

function isEligibleConfirmationLeadTimeCycle(
  cycle: Doc<"analyticsShiftCycles">,
  cutoffAt: number,
  targetDate: string,
): boolean {
  return (
    activeCycleAt(cycle, cutoffAt) &&
    cycle.periodStart <= targetDate &&
    cycle.completeness === "complete" &&
    cycle.confirmedAt !== undefined &&
    cycle.confirmedAt < cutoffAt &&
    cycle.confirmationLeadTimeMs !== undefined &&
    cycle.confirmationLeadTimeMs >= 0
  );
}

async function notificationFailureAtForShop(
  ctx: MutationCtx,
  run: AnalyticsRun,
  shopId: Id<"shops">,
): Promise<number | undefined> {
  const targetDate = requireDailyTarget(run);
  const fromDate = addDays(targetDate, -(ANALYTICS_POLICY.health.notificationFailureWindowDays - 1));
  const rows = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_shopId_and_snapshotDate", (q) =>
      q.eq("shopId", shopId).gte("snapshotDate", fromDate).lte("snapshotDate", targetDate),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_shop_notification_scope_too_large");
  const runCache = new Map<Id<"analyticsRuns">, Doc<"analyticsRuns"> | null>();
  let latest: number | undefined;
  for (const row of rows) {
    if (!row.runId || row.lastFailedAt === undefined) continue;
    let visible = row.runId === run._id;
    if (!visible) {
      let sourceRun = runCache.get(row.runId);
      if (sourceRun === undefined) {
        sourceRun = await ctx.db.get(row.runId);
        runCache.set(row.runId, sourceRun);
      }
      visible =
        sourceRun?.kind === "daily" && sourceRun.status === "complete" && sourceRun.targetDate === row.snapshotDate;
    }
    if (visible) latest = Math.max(latest ?? 0, row.lastFailedAt);
  }
  return latest;
}

async function buildDailyShopValue(ctx: MutationCtx, run: AnalyticsRun, shop: Doc<"analyticsShops">) {
  const targetDate = requireDailyTarget(run);
  if (shop.updatedAt >= run.cutoffAt) throw new Error("analytics_shop_future_fact");
  const [staffMemberships, managerMemberships, cycles, notificationFailedAt] = await Promise.all([
    boundedActiveStaffMemberships(ctx, shop.shopId, run.cutoffAt),
    boundedActiveManagerMemberships(ctx, shop.organizationId, run.cutoffAt),
    ctx.db
      .query("analyticsShiftCycles")
      .withIndex("by_shopId_and_periodStart", (q) => q.eq("shopId", shop.shopId))
      .take(SCOPE_READ_LIMIT + 1),
    notificationFailureAtForShop(ctx, run, shop.shopId),
  ]);
  assertScopeLimit(cycles, "analytics_shop_cycle_scope_too_large");
  const historicalCycles = cycles.filter((cycle) => cycle.periodStart <= targetDate);
  const upcomingCycles = cycles.filter((cycle) => cycle.periodStart > targetDate);
  assertUniqueActiveMemberships(staffMemberships);
  assertUniqueActiveMemberships(managerMemberships);

  const staffPeople = new Set<Id<"organizationPeople">>();
  let shiftTargetCount = 0;
  let unlinkedStaffCount = 0;
  let lineLinkedCount = 0;
  let lineFollowingCount = 0;
  for (const membership of staffMemberships) {
    if (membership.role !== "staff") continue;
    if (membership.organizationId !== shop.organizationId || membership.shopId !== shop.shopId) {
      throw new Error("analytics_shop_membership_scope_mismatch");
    }
    if (membership.organizationPersonId) staffPeople.add(membership.organizationPersonId);
    else unlinkedStaffCount += 1;
    if (!membership.isShiftTarget) continue;
    shiftTargetCount += 1;
    if (membership.lineLinked) lineLinkedCount += 1;
    if (membership.lineFollowing) lineFollowingCount += 1;
  }
  const managerStaffCount = managerMemberships.filter((membership) =>
    staffPeople.has(membership.organizationPersonId),
  ).length;

  const activeHistoricalCycles = historicalCycles.filter((cycle) => {
    if (cycle.organizationId !== shop.organizationId || cycle.shopId !== shop.shopId) {
      throw new Error("analytics_shop_cycle_scope_mismatch");
    }
    if (cycle.completeness === "partial") throw new Error("analytics_cycle_partial_not_supported");
    return activeCycleAt(cycle, run.cutoffAt);
  });
  const activeUpcomingCycles = upcomingCycles.filter((cycle) => {
    if (cycle.organizationId !== shop.organizationId || cycle.shopId !== shop.shopId) {
      throw new Error("analytics_shop_cycle_scope_mismatch");
    }
    if (cycle.completeness === "partial") throw new Error("analytics_cycle_partial_not_supported");
    return activeCycleAt(cycle, run.cutoffAt);
  });
  const northStar = emptyRatePair();
  const deadlineSubmission = emptyRatePair();
  const finalSubmission = emptyRatePair();
  const cumulativeDeadlineSubmission = emptyRatePair();
  const cumulativeFinalSubmission = emptyRatePair();
  let confirmedCycleCount = 0;
  let confirmedBeforeStartCycleCount = 0;
  let cumulativeNotificationSentCount = 0;
  let cumulativeNotificationFailedCount = 0;
  let lastNotificationFailedAt = notificationFailedAt;
  for (const cycle of activeHistoricalCycles) {
    cumulativeNotificationSentCount += cycle.notificationSentCount;
    cumulativeNotificationFailedCount += cycle.notificationFailedCount;
    if (cycle.lastNotificationFailedAt !== undefined && cycle.lastNotificationFailedAt < run.cutoffAt) {
      lastNotificationFailedAt = Math.max(lastNotificationFailedAt ?? 0, cycle.lastNotificationFailedAt);
    }
    if (cycle.completeness === "complete") {
      cumulativeDeadlineSubmission.numerator += cycle.submittedAtDeadline ?? 0;
      cumulativeDeadlineSubmission.denominator += cycle.targetAtDeadline ?? 0;
      cumulativeFinalSubmission.numerator += cycle.submittedAtClose ?? 0;
      cumulativeFinalSubmission.denominator += cycle.targetAtClose ?? 0;
    }
    if (cycle.confirmedAt !== undefined && cycle.confirmedAt < run.cutoffAt) confirmedCycleCount += 1;
    if (cycle.confirmedBeforeStart && cycle.confirmedAt !== undefined && cycle.confirmedAt < run.cutoffAt) {
      confirmedBeforeStartCycleCount += 1;
    }
    if (cycle.periodStart !== targetDate || cycle.completeness !== "complete") continue;
    northStar.denominator += 1;
    if (cycle.confirmedBeforeStart) northStar.numerator += 1;
    deadlineSubmission.numerator += cycle.submittedAtDeadline ?? 0;
    deadlineSubmission.denominator += cycle.targetAtDeadline ?? 0;
    finalSubmission.numerator += cycle.submittedAtClose ?? 0;
    finalSubmission.denominator += cycle.targetAtClose ?? 0;
  }
  for (const pair of [
    northStar,
    deadlineSubmission,
    finalSubmission,
    cumulativeDeadlineSubmission,
    cumulativeFinalSubmission,
  ]) {
    assertRatePair(pair);
  }

  const leadTimes = activeHistoricalCycles.flatMap((cycle) => {
    if (
      cycle.completeness === "complete" &&
      cycle.confirmedAt !== undefined &&
      cycle.confirmedAt < run.cutoffAt &&
      cycle.confirmationLeadTimeMs !== undefined &&
      cycle.confirmationLeadTimeMs < 0
    ) {
      throw new Error("analytics_confirmation_lead_time_invalid");
    }
    return isEligibleConfirmationLeadTimeCycle(cycle, run.cutoffAt, targetDate) &&
      cycle.confirmationLeadTimeMs !== undefined
      ? [cycle.confirmationLeadTimeMs]
      : [];
  });
  const recentCycles = activeHistoricalCycles
    .filter((cycle) => cycle.completeness === "complete")
    .sort((left, right) => right.periodStart.localeCompare(left.periodStart) || right.createdAt - left.createdAt)
    .slice(0, ANALYTICS_POLICY.health.cadenceHistoryCycles);
  const upcoming = activeUpcomingCycles.sort(
    (left, right) => left.periodStart.localeCompare(right.periodStart) || left.createdAt - right.createdAt,
  )[0];
  const latestCycle = [...activeHistoricalCycles].sort(
    (left, right) => right.periodStart.localeCompare(left.periodStart) || right.createdAt - left.createdAt,
  )[0];
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
  const healthSignals: DailyShop["healthSignals"] = [];
  if (upcoming) healthSignals.push({ signal: "hasUpcomingCycle", startedAt: upcoming.createdAt });
  else if (cadenceDays === undefined) healthSignals.push({ signal: "insufficientData", startedAt: run.cutoffAt });
  else {
    const latestStart = starts.at(-1) ?? shop.registeredAt;
    const expectedNextStart = latestStart + cadenceDays * DAY_MS;
    healthSignals.push({ signal: "nextCycleMissing", startedAt: expectedNextStart });
    const toleranceDays = Math.max(
      ANALYTICS_POLICY.health.cadenceToleranceMinimumDays,
      cadenceDays * ANALYTICS_POLICY.health.cadenceToleranceRatio,
    );
    if (run.cutoffAt > expectedNextStart + toleranceDays * DAY_MS) {
      healthSignals.push({ signal: "cadenceDelayed", startedAt: expectedNextStart });
    }
  }
  const failureWindowStart = run.cutoffAt - ANALYTICS_POLICY.health.notificationFailureWindowDays * DAY_MS;
  if (
    lastNotificationFailedAt !== undefined &&
    failureWindowStart <= lastNotificationFailedAt &&
    lastNotificationFailedAt < run.cutoffAt
  ) {
    healthSignals.push({ signal: "notificationFailure", startedAt: lastNotificationFailedAt });
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
    healthSignals.push({ signal: "submissionDrop", startedAt: latestCompleteCycle?.closedAt ?? run.cutoffAt });
  } else if (
    (latestCompleteCycle?.targetAtClose ?? 0) < ANALYTICS_POLICY.health.submissionDropMinimumTargets ||
    priorMedian === undefined
  ) {
    if (!healthSignals.some(({ signal }) => signal === "insufficientData")) {
      healthSignals.push({ signal: "insufficientData", startedAt: run.cutoffAt });
    }
  }
  if (latestCycle) {
    const periodStartAt = getSubmitLinkCutoff(latestCycle.periodStart);
    if ((!latestCycle.confirmedAt || run.cutoffAt <= latestCycle.confirmedAt) && periodStartAt < run.cutoffAt) {
      healthSignals.push({ signal: "confirmationDelay", startedAt: periodStartAt });
    } else if (latestCycle.confirmedAt !== undefined && latestCycle.confirmedAt < run.cutoffAt) {
      const normalLeadTimeMs = median(
        recentCycles
          .filter((cycle) => cycle.recruitmentId !== latestCycle.recruitmentId)
          .slice(0, ANALYTICS_POLICY.health.cadenceHistoryCycles)
          .flatMap((cycle) => (cycle.confirmationLeadTimeMs === undefined ? [] : [cycle.confirmationLeadTimeMs])),
      );
      if (normalLeadTimeMs !== undefined) {
        const toleranceMs = Math.max(
          ANALYTICS_POLICY.health.cadenceToleranceMinimumDays * DAY_MS,
          normalLeadTimeMs * ANALYTICS_POLICY.health.cadenceToleranceRatio,
        );
        if ((latestCycle.confirmationLeadTimeMs ?? 0) > normalLeadTimeMs + toleranceMs) {
          healthSignals.push({
            signal: "confirmationDelay",
            startedAt: latestCycle.createdAt + normalLeadTimeMs + toleranceMs,
          });
        }
      }
    }
  }
  // 切替前の活動履歴は復元しないため、既存店舗は観測開始日をactivity baselineにする。
  const activityAt = shop.latestActivityAt ?? Math.max(shop.registeredAt, run.dataStartAt);
  if (activityAt >= run.cutoffAt) throw new Error("analytics_shop_future_activity");
  const hasRecentActivity = activityAt >= run.cutoffAt - ANALYTICS_POLICY.health.activityWindowDays * DAY_MS;
  if (!hasRecentActivity) {
    healthSignals.push({
      signal: "longInactive",
      startedAt: activityAt + ANALYTICS_POLICY.health.activityWindowDays * DAY_MS,
    });
  }
  const issueHealthSignalCount = healthSignals.filter(
    ({ signal }) => signal !== "hasUpcomingCycle" && signal !== "insufficientData",
  ).length;
  const confirmationLeadTimeMedianMs = median(leadTimes);
  const confirmationLeadTimeP90Ms = p90(leadTimes);
  const kpiEligible = shop.registeredAt >= run.dataStartAt;
  return {
    runId: run._id,
    organizationId: shop.organizationId,
    shopId: shop.shopId,
    snapshotDate: targetDate,
    kpiEligible,
    staffMembershipCount: staffMemberships.length,
    shiftTargetCount,
    uniquePersonCount: staffPeople.size,
    unlinkedStaffCount,
    managerMembershipCount: managerMemberships.length,
    managerStaffCount,
    lineLinkedCount,
    lineFollowingCount,
    hasRecentActivity,
    cycleCount: activeHistoricalCycles.length,
    confirmedCycleCount,
    confirmedBeforeStartCycleCount,
    ...(upcoming ? { nextCyclePeriodStart: upcoming.periodStart } : {}),
    issueHealthSignalCount,
    milestoneDates: {
      registeredAt: shop.registeredAt,
      ...(shop.firstRecruitmentAt !== undefined && shop.firstRecruitmentAt < run.cutoffAt
        ? { firstRecruitmentAt: shop.firstRecruitmentAt }
        : {}),
      ...(shop.firstSubmissionAt !== undefined && shop.firstSubmissionAt < run.cutoffAt
        ? { firstSubmissionAt: shop.firstSubmissionAt }
        : {}),
      ...(shop.firstConfirmedAt !== undefined && shop.firstConfirmedAt < run.cutoffAt
        ? { firstConfirmedAt: shop.firstConfirmedAt }
        : {}),
      ...(shop.secondConfirmedAt !== undefined && shop.secondConfirmedAt < run.cutoffAt
        ? { secondConfirmedAt: shop.secondConfirmedAt }
        : {}),
    },
    healthSignals,
    cadence,
    northStar,
    deadlineSubmission,
    finalSubmission,
    cumulativeDeadlineSubmission,
    cumulativeFinalSubmission,
    cumulativeNotificationSentCount,
    cumulativeNotificationFailedCount,
    ...(confirmationLeadTimeMedianMs === undefined ? {} : { confirmationLeadTimeMedianMs }),
    ...(confirmationLeadTimeP90Ms === undefined ? {} : { confirmationLeadTimeP90Ms }),
    ...(lastNotificationFailedAt === undefined ? {} : { lastNotificationFailedAt }),
    completeness: "complete" as const,
    computedAt: Date.now(),
  };
}

/** One analyticsShops row per page. Scope internals are hard-bounded and fail closed. */
export async function aggregateDailyShopPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  cursor: string | null,
): Promise<AnalyticsAggregationPageResult> {
  requireDailyTarget(run);
  const page = await ctx.db
    .query("analyticsShops")
    .withIndex("by_registeredAt")
    .paginate({ numItems: 1, cursor, maximumRowsRead: 1 });
  assertSinglePageRow(page.page);
  const shop = page.page[0];
  if (shop) {
    const existing = await getDailyShopRow(ctx, run, shop.shopId);
    if (!activeShopAt(shop, run.cutoffAt)) {
      if (existing) await ctx.db.delete(existing._id);
    } else {
      const value = await buildDailyShopValue(ctx, run, shop);
      if (existing) await ctx.db.replace(existing._id, value);
      else await ctx.db.insert("analyticsDailyShopKpis", value);
    }
  }
  return pageResult(page);
}

type ShopRollup = {
  shopCount: number;
  kpiEligibleShopCount: number;
  activeShopCount: number;
  staffMembershipCount: number;
  unlinkedStaffCount: number;
  shiftTargetCount: number;
  milestoneCounts: ReturnType<typeof emptyMilestoneCounts>;
  healthSignalCounts: ReturnType<typeof emptyHealthSignalCounts>;
  northStar: ReturnType<typeof emptyRatePair>;
  deadlineSubmission: ReturnType<typeof emptyRatePair>;
  finalSubmission: ReturnType<typeof emptyRatePair>;
};

function emptyShopRollup(): ShopRollup {
  return {
    shopCount: 0,
    kpiEligibleShopCount: 0,
    activeShopCount: 0,
    staffMembershipCount: 0,
    unlinkedStaffCount: 0,
    shiftTargetCount: 0,
    milestoneCounts: emptyMilestoneCounts(),
    healthSignalCounts: emptyHealthSignalCounts(),
    northStar: emptyRatePair(),
    deadlineSubmission: emptyRatePair(),
    finalSubmission: emptyRatePair(),
  };
}

function addShopToRollup(rollup: ShopRollup, shop: DailyShop): void {
  if (shop.kpiEligible === undefined) throw new Error("analytics_daily_shop_eligibility_missing");
  if (shop.completeness !== "complete") throw new Error("analytics_daily_shop_incomplete");
  rollup.shopCount += 1;
  if (shop.hasRecentActivity) rollup.activeShopCount += 1;
  rollup.staffMembershipCount += shop.staffMembershipCount;
  rollup.unlinkedStaffCount += shop.unlinkedStaffCount;
  rollup.shiftTargetCount += shop.shiftTargetCount;
  for (const { signal } of shop.healthSignals) rollup.healthSignalCounts[signal] += 1;
  rollup.northStar = addRatePairs(rollup.northStar, shop.northStar);
  rollup.deadlineSubmission = addRatePairs(rollup.deadlineSubmission, shop.deadlineSubmission);
  rollup.finalSubmission = addRatePairs(rollup.finalSubmission, shop.finalSubmission);
  if (!shop.kpiEligible) return;
  rollup.kpiEligibleShopCount += 1;
  rollup.milestoneCounts.registered += 1;
  if (shop.milestoneDates.firstRecruitmentAt !== undefined) rollup.milestoneCounts.firstRecruitment += 1;
  if (shop.milestoneDates.firstSubmissionAt !== undefined) rollup.milestoneCounts.firstSubmission += 1;
  if (shop.milestoneDates.firstConfirmedAt !== undefined) rollup.milestoneCounts.firstConfirmed += 1;
  if (shop.milestoneDates.secondConfirmedAt !== undefined) rollup.milestoneCounts.secondConfirmed += 1;
}

async function boundedOrganizationShops(ctx: MutationCtx, organizationId: Id<"organizations">, cutoffAt: number) {
  const rows = await ctx.db
    .query("analyticsShops")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_organization_shop_scope_too_large");
  return rows.filter((shop) => activeShopAt(shop, cutoffAt));
}

async function boundedOrganizationPeople(ctx: MutationCtx, organizationId: Id<"organizations">, cutoffAt: number) {
  const rows = await ctx.db
    .query("analyticsPeople")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_organization_people_scope_too_large");
  return rows.filter(
    (person) => person.firstObservedAt < cutoffAt && (person.deletedAt === undefined || cutoffAt <= person.deletedAt),
  );
}

async function boundedOrganizationStaffMemberships(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  cutoffAt: number,
) {
  const rows = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_organizationId_and_role_and_validFrom", (q) =>
      q.eq("organizationId", organizationId).eq("role", "staff").lt("validFrom", cutoffAt),
    )
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(rows, "analytics_organization_staff_scope_too_large");
  return rows.filter(
    (row): row is Extract<Doc<"analyticsMemberships">, { role: "staff" }> =>
      row.role === "staff" && activeAt(row, cutoffAt),
  );
}

async function buildDailyOrganizationValue(
  ctx: MutationCtx,
  run: AnalyticsRun,
  organization: Doc<"analyticsOrganizations">,
) {
  const targetDate = requireDailyTarget(run);
  if (organization.updatedAt >= run.cutoffAt) throw new Error("analytics_organization_future_fact");
  const [shopRows, dimensionShops, people, staffMemberships, managerMemberships] = await Promise.all([
    ctx.db
      .query("analyticsDailyShopKpis")
      .withIndex("by_organizationId_and_snapshotDate", (q) =>
        q.eq("organizationId", organization.organizationId).eq("snapshotDate", targetDate),
      )
      .take(SCOPE_READ_LIMIT + 1),
    boundedOrganizationShops(ctx, organization.organizationId, run.cutoffAt),
    boundedOrganizationPeople(ctx, organization.organizationId, run.cutoffAt),
    boundedOrganizationStaffMemberships(ctx, organization.organizationId, run.cutoffAt),
    boundedActiveManagerMemberships(ctx, organization.organizationId, run.cutoffAt),
  ]);
  assertScopeLimit(shopRows, "analytics_organization_daily_shop_scope_too_large");
  if (shopRows.some((row) => row.runId !== run._id)) throw new Error("analytics_daily_output_run_conflict");
  assertUniqueActiveMemberships(staffMemberships);
  assertUniqueActiveMemberships(managerMemberships);
  const expectedShopIds = dimensionShops.map((shop) => String(shop.shopId)).sort();
  const actualShopIds = shopRows.map((shop) => String(shop.shopId)).sort();
  if (JSON.stringify(expectedShopIds) !== JSON.stringify(actualShopIds)) {
    throw new Error("analytics_organization_shop_snapshot_mismatch");
  }

  const rollup = emptyShopRollup();
  for (const shop of shopRows) addShopToRollup(rollup, shop);
  const managerPeople = new Set(managerMemberships.map((membership) => membership.organizationPersonId));
  const staffPeople = new Set(
    staffMemberships.flatMap((membership) =>
      membership.role === "staff" && membership.organizationPersonId ? [membership.organizationPersonId] : [],
    ),
  );
  const managerStaffCount = [...managerPeople].filter((personId) => staffPeople.has(personId)).length;
  for (const pair of [rollup.northStar, rollup.deadlineSubmission, rollup.finalSubmission]) assertRatePair(pair);
  return {
    runId: run._id,
    organizationId: organization.organizationId,
    snapshotDate: targetDate,
    ...(organization.currentPlan ? { currentPlan: organization.currentPlan } : {}),
    shopCount: rollup.shopCount,
    kpiEligibleShopCount: rollup.kpiEligibleShopCount,
    activeShopCount: rollup.activeShopCount,
    uniquePersonCount: people.length,
    staffMembershipCount: rollup.staffMembershipCount,
    unlinkedStaffCount: rollup.unlinkedStaffCount,
    shiftTargetCount: rollup.shiftTargetCount,
    managerMembershipCount: managerMemberships.length,
    managerStaffCount,
    milestoneCounts: rollup.milestoneCounts,
    healthSignalCounts: rollup.healthSignalCounts,
    northStar: rollup.northStar,
    deadlineSubmission: rollup.deadlineSubmission,
    finalSubmission: rollup.finalSubmission,
    completeness: "complete" as const,
    computedAt: Date.now(),
  };
}

async function initializeDailyService(ctx: MutationCtx, run: AnalyticsRun): Promise<void> {
  if (await getDailyServiceRow(ctx, run)) throw new Error("analytics_daily_service_already_initialized");
  await ctx.db.insert("analyticsDailyServiceKpis", {
    runId: run._id,
    snapshotDate: requireDailyTarget(run),
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
    completeness: "complete",
    computedAt: Date.now(),
  });
}

async function addOrganizationToDailyService(
  ctx: MutationCtx,
  run: AnalyticsRun,
  organization: Awaited<ReturnType<typeof buildDailyOrganizationValue>>,
): Promise<void> {
  const service = await getDailyServiceRow(ctx, run);
  if (!service) throw new Error("analytics_daily_service_missing");
  const northStar = addRatePairs(service.northStar, organization.northStar);
  const deadlineSubmission = addRatePairs(service.deadlineSubmission, organization.deadlineSubmission);
  const finalSubmission = addRatePairs(service.finalSubmission, organization.finalSubmission);
  for (const pair of [northStar, deadlineSubmission, finalSubmission]) assertRatePair(pair);
  await ctx.db.replace(service._id, {
    runId: run._id,
    snapshotDate: requireDailyTarget(run),
    organizationCount: service.organizationCount + 1,
    shopCount: service.shopCount + organization.shopCount,
    kpiEligibleShopCount: service.kpiEligibleShopCount + organization.kpiEligibleShopCount,
    activeShopCount: service.activeShopCount + organization.activeShopCount,
    personCount: service.personCount + organization.uniquePersonCount,
    staffMembershipCount: service.staffMembershipCount + organization.staffMembershipCount,
    unlinkedStaffCount: service.unlinkedStaffCount + organization.unlinkedStaffCount,
    shiftTargetCount: service.shiftTargetCount + organization.shiftTargetCount,
    managerMembershipCount: service.managerMembershipCount + organization.managerMembershipCount,
    managerStaffCount: service.managerStaffCount + organization.managerStaffCount,
    milestoneCounts: addMilestoneCounts(service.milestoneCounts, organization.milestoneCounts),
    healthSignalCounts: addHealthCounts(service.healthSignalCounts, organization.healthSignalCounts),
    northStar,
    deadlineSubmission,
    finalSubmission,
    completeness: "complete",
    computedAt: Date.now(),
  });
}

/** One analyticsOrganizations row per page; all child scopes are absolute and bounded. */
export async function aggregateDailyOrganizationPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  cursor: string | null,
): Promise<AnalyticsAggregationPageResult> {
  requireDailyTarget(run);
  if (cursor === null) await initializeDailyService(ctx, run);
  const page = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_registeredAt")
    .paginate({ numItems: 1, cursor, maximumRowsRead: 1 });
  assertSinglePageRow(page.page);
  const organization = page.page[0];
  if (organization) {
    const existing = await getDailyOrganizationRow(ctx, run, organization.organizationId);
    if (!activeOrganizationAt(organization, run.cutoffAt)) {
      if (existing) await ctx.db.delete(existing._id);
    } else {
      const value = await buildDailyOrganizationValue(ctx, run, organization);
      if (existing) await ctx.db.replace(existing._id, value);
      else await ctx.db.insert("analyticsDailyOrganizationKpis", value);
      await addOrganizationToDailyService(ctx, run, value);
    }
  }
  return pageResult(page);
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

function lineUsageBucket(row: DailyShop): string {
  if (row.shiftTargetCount === 0) return "notApplicable";
  if (row.lineLinkedCount === 0) return "0%";
  const rate = row.lineLinkedCount / row.shiftTargetCount;
  if (rate < 0.5) return "1-49%";
  if (rate < 0.8) return "50-79%";
  return "80%+";
}

function cadenceBucket(cadence: DailyShop["cadence"]): string {
  if (cadence.kind === "insufficientData") return "insufficientData";
  if (cadence.days <= 9) return "weekly";
  if (cadence.days <= 18) return "biweekly";
  if (cadence.days <= 40) return "monthly";
  return "other";
}

async function getSegmentRow(
  ctx: MutationCtx,
  run: AnalyticsRun,
  dimension: DailySegment["dimension"],
  bucket: string,
) {
  const targetDate = requireDailyTarget(run);
  const rows = await ctx.db
    .query("analyticsDailySegmentKpis")
    .withIndex("by_snapshotDate_and_dimension_and_bucket", (q) =>
      q.eq("snapshotDate", targetDate).eq("dimension", dimension).eq("bucket", bucket),
    )
    .take(2);
  if (rows.length > 1) throw new Error("analytics_daily_segment_duplicate");
  const row = rows[0] ?? null;
  if (row && row.runId !== run._id) throw new Error("analytics_daily_output_run_conflict");
  return row;
}

async function addSegmentShop(
  ctx: MutationCtx,
  run: AnalyticsRun,
  dimension: DailySegment["dimension"],
  bucket: string,
  shop: DailyShop,
): Promise<void> {
  const targetDate = requireDailyTarget(run);
  const existing = await getSegmentRow(ctx, run, dimension, bucket);
  const shopRollup = emptyShopRollup();
  addShopToRollup(shopRollup, shop);
  const kpiEligibleShopCount = (existing?.kpiEligibleShopCount ?? 0) + shopRollup.kpiEligibleShopCount;
  const value = {
    runId: run._id,
    snapshotDate: targetDate,
    dimension,
    bucket,
    shopCount: (existing?.shopCount ?? 0) + 1,
    kpiEligibleShopCount,
    milestoneCounts: addMilestoneCounts(
      existing?.milestoneCounts ?? emptyMilestoneCounts(),
      shopRollup.milestoneCounts,
    ),
    healthSignalCounts: addHealthCounts(
      existing?.healthSignalCounts ?? emptyHealthSignalCounts(),
      shopRollup.healthSignalCounts,
    ),
    northStar: addRatePairs(existing?.northStar ?? emptyRatePair(), shopRollup.northStar),
    deadlineSubmission: addRatePairs(existing?.deadlineSubmission ?? emptyRatePair(), shopRollup.deadlineSubmission),
    finalSubmission: addRatePairs(existing?.finalSubmission ?? emptyRatePair(), shopRollup.finalSubmission),
    completeness: "complete" as const,
    computedAt: Date.now(),
  };
  if (existing) await ctx.db.replace(existing._id, value);
  else await ctx.db.insert("analyticsDailySegmentKpis", value);
}

/**
 * Segment rows are page-additive under the caller's step fence. Service totals are
 * already accumulated with organization pages, so this stage never rescans all tenants.
 */
export async function aggregateDailySegmentsAndServicePage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  cursor: string | null,
): Promise<AnalyticsAggregationPageResult> {
  const targetDate = requireDailyTarget(run);
  const page = await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", targetDate))
    .paginate({ numItems: SEGMENT_PAGE_SIZE, cursor, maximumRowsRead: SEGMENT_PAGE_SIZE });
  for (const row of page.page) {
    if (row.runId !== run._id) throw new Error("analytics_daily_output_run_conflict");
    const [shop, organization] = await Promise.all([
      getShopDimension(ctx, row.shopId),
      getDailyOrganizationRow(ctx, run, row.organizationId),
    ]);
    if (!shop || !organization) throw new Error("analytics_segment_dimension_missing");
    const buckets: Array<[DailySegment["dimension"], string]> = [
      ["registrationCohort", dateJST(shop.registeredAt).slice(0, 7)],
      ["plan", shop.currentPlan ?? "unknown"],
      ["organizationShopCount", organizationShopCountBucket(organization.shopCount)],
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
        Math.floor((run.cutoffAt - shop.registeredAt) / DAY_MS) <= 30
          ? "0-30"
          : Math.floor((run.cutoffAt - shop.registeredAt) / DAY_MS) <= 90
            ? "31-90"
            : "91+",
      ],
    ];
    for (const [dimension, bucket] of buckets) await addSegmentShop(ctx, run, dimension, bucket, row);
  }
  if (page.isDone && !(await getDailyServiceRow(ctx, run))) throw new Error("analytics_daily_service_missing");
  return pageResult(page);
}
