import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getSubmitLinkCutoff, jstDayRangeMs } from "../_lib/dateFormat";
import {
  ANALYTICS_HEALTH_SIGNALS,
  analyticsHealthSignalCountsValidator,
  analyticsMilestoneCountsValidator,
  analyticsRatePairValidator,
  emptyHealthSignalCounts,
  emptyMilestoneCounts,
  emptyRatePair,
} from "./model";
import { ANALYTICS_POLICY } from "./registry";

type AnalyticsRun = Doc<"analyticsRuns">;
type DailyOrganization = Doc<"analyticsDailyOrganizationKpis">;
type DailyShop = Doc<"analyticsDailyShopKpis">;
type RatePair = { numerator: number; denominator: number };

const SCOPE_READ_LIMIT = ANALYTICS_POLICY.batch.scopeReadLimit;
const ORGANIZATION_AUDIT_PAGE_SIZE = 1;
const OUTPUT_AUDIT_PAGE_SIZE = 25;
const CANONICAL_AUDIT_PAGE_SIZE = 25;
const MILESTONE_KEYS = [
  "registered",
  "firstRecruitment",
  "firstSubmission",
  "firstConfirmed",
  "secondConfirmed",
] as const;
const SEGMENT_DIMENSIONS = [
  "registrationCohort",
  "plan",
  "organizationShopCount",
  "shopStaffSize",
  "cadence",
  "lineUsage",
  "submissionTrend",
  "adoptionAge",
] as const satisfies readonly Doc<"analyticsDailySegmentKpis">["dimension"][];

type MilestoneCounts = ReturnType<typeof emptyMilestoneCounts>;
type HealthSignalCounts = ReturnType<typeof emptyHealthSignalCounts>;

type ShopRollup = {
  shopCount: number;
  kpiEligibleShopCount: number;
  activeShopCount: number;
  staffMembershipCount: number;
  unlinkedStaffCount: number;
  shiftTargetCount: number;
  milestoneCounts: MilestoneCounts;
  healthSignalCounts: HealthSignalCounts;
  northStar: RatePair;
  deadlineSubmission: RatePair;
  finalSubmission: RatePair;
};

export type AnalyticsInvariantRollup = ShopRollup & {
  organizationCount: number;
  personCount: number;
  managerMembershipCount: number;
  managerStaffCount: number;
};

export const analyticsInvariantRollupValidator = v.object({
  shopCount: v.number(),
  kpiEligibleShopCount: v.number(),
  activeShopCount: v.number(),
  staffMembershipCount: v.number(),
  unlinkedStaffCount: v.number(),
  shiftTargetCount: v.number(),
  milestoneCounts: analyticsMilestoneCountsValidator,
  healthSignalCounts: analyticsHealthSignalCountsValidator,
  northStar: analyticsRatePairValidator,
  deadlineSubmission: analyticsRatePairValidator,
  finalSubmission: analyticsRatePairValidator,
  organizationCount: v.number(),
  personCount: v.number(),
  managerMembershipCount: v.number(),
  managerStaffCount: v.number(),
});

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function countsAreValid(values: readonly number[]): boolean {
  return values.every(isCount);
}

function rateIsValid(pair: RatePair): boolean {
  return countsAreValid([pair.numerator, pair.denominator]) && pair.numerator <= pair.denominator;
}

function milestoneCountsAreValid(counts: MilestoneCounts, shopLimit?: number): boolean {
  return MILESTONE_KEYS.every((key) => isCount(counts[key]) && (shopLimit === undefined || counts[key] <= shopLimit));
}

function healthCountsAreValid(counts: HealthSignalCounts, shopLimit?: number): boolean {
  return ANALYTICS_HEALTH_SIGNALS.every(
    (key) => isCount(counts[key]) && (shopLimit === undefined || counts[key] <= shopLimit),
  );
}

function sameRate(left: RatePair, right: RatePair): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

function sameMilestones(left: MilestoneCounts, right: MilestoneCounts): boolean {
  return MILESTONE_KEYS.every((key) => left[key] === right[key]);
}

function sameHealthCounts(left: HealthSignalCounts, right: HealthSignalCounts): boolean {
  return ANALYTICS_HEALTH_SIGNALS.every((key) => left[key] === right[key]);
}

function addRate(target: RatePair, value: RatePair): void {
  target.numerator += value.numerator;
  target.denominator += value.denominator;
}

function addMilestones(target: MilestoneCounts, value: MilestoneCounts): void {
  for (const key of MILESTONE_KEYS) target[key] += value[key];
}

function addHealthCounts(target: HealthSignalCounts, value: HealthSignalCounts): void {
  for (const key of ANALYTICS_HEALTH_SIGNALS) target[key] += value[key];
}

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

function addShopToRollup(target: ShopRollup, shop: DailyShop): void {
  target.shopCount += 1;
  if (shop.hasRecentActivity) target.activeShopCount += 1;
  target.staffMembershipCount += shop.staffMembershipCount;
  target.unlinkedStaffCount += shop.unlinkedStaffCount;
  target.shiftTargetCount += shop.shiftTargetCount;
  for (const { signal } of shop.healthSignals) target.healthSignalCounts[signal] += 1;
  addRate(target.northStar, shop.northStar);
  addRate(target.deadlineSubmission, shop.deadlineSubmission);
  addRate(target.finalSubmission, shop.finalSubmission);
  if (!shop.kpiEligible) return;

  target.kpiEligibleShopCount += 1;
  target.milestoneCounts.registered += 1;
  if (shop.milestoneDates.firstRecruitmentAt !== undefined) target.milestoneCounts.firstRecruitment += 1;
  if (shop.milestoneDates.firstSubmissionAt !== undefined) target.milestoneCounts.firstSubmission += 1;
  if (shop.milestoneDates.firstConfirmedAt !== undefined) target.milestoneCounts.firstConfirmed += 1;
  if (shop.milestoneDates.secondConfirmedAt !== undefined) target.milestoneCounts.secondConfirmed += 1;
}

function emptyServiceRollup(): AnalyticsInvariantRollup {
  return {
    ...emptyShopRollup(),
    organizationCount: 0,
    personCount: 0,
    managerMembershipCount: 0,
    managerStaffCount: 0,
  };
}

function addOrganizationToRollup(target: AnalyticsInvariantRollup, organization: DailyOrganization): void {
  target.organizationCount += 1;
  target.shopCount += organization.shopCount;
  target.kpiEligibleShopCount += organization.kpiEligibleShopCount;
  target.activeShopCount += organization.activeShopCount;
  target.personCount += organization.uniquePersonCount;
  target.staffMembershipCount += organization.staffMembershipCount;
  target.unlinkedStaffCount += organization.unlinkedStaffCount;
  target.shiftTargetCount += organization.shiftTargetCount;
  target.managerMembershipCount += organization.managerMembershipCount;
  target.managerStaffCount += organization.managerStaffCount;
  addMilestones(target.milestoneCounts, organization.milestoneCounts);
  addHealthCounts(target.healthSignalCounts, organization.healthSignalCounts);
  addRate(target.northStar, organization.northStar);
  addRate(target.deadlineSubmission, organization.deadlineSubmission);
  addRate(target.finalSubmission, organization.finalSubmission);
}

function shopRollupMatches(row: DailyOrganization, expected: ShopRollup): boolean {
  return (
    row.shopCount === expected.shopCount &&
    row.kpiEligibleShopCount === expected.kpiEligibleShopCount &&
    row.activeShopCount === expected.activeShopCount &&
    row.staffMembershipCount === expected.staffMembershipCount &&
    row.unlinkedStaffCount === expected.unlinkedStaffCount &&
    row.shiftTargetCount === expected.shiftTargetCount &&
    sameMilestones(row.milestoneCounts, expected.milestoneCounts) &&
    sameHealthCounts(row.healthSignalCounts, expected.healthSignalCounts) &&
    sameRate(row.northStar, expected.northStar) &&
    sameRate(row.deadlineSubmission, expected.deadlineSubmission) &&
    sameRate(row.finalSubmission, expected.finalSubmission)
  );
}

function serviceRollupMatches(row: Doc<"analyticsDailyServiceKpis">, expected: AnalyticsInvariantRollup): boolean {
  return (
    row.organizationCount === expected.organizationCount &&
    row.shopCount === expected.shopCount &&
    row.kpiEligibleShopCount === expected.kpiEligibleShopCount &&
    row.activeShopCount === expected.activeShopCount &&
    row.personCount === expected.personCount &&
    row.staffMembershipCount === expected.staffMembershipCount &&
    row.unlinkedStaffCount === expected.unlinkedStaffCount &&
    row.shiftTargetCount === expected.shiftTargetCount &&
    row.managerMembershipCount === expected.managerMembershipCount &&
    row.managerStaffCount === expected.managerStaffCount &&
    sameMilestones(row.milestoneCounts, expected.milestoneCounts) &&
    sameHealthCounts(row.healthSignalCounts, expected.healthSignalCounts) &&
    sameRate(row.northStar, expected.northStar) &&
    sameRate(row.deadlineSubmission, expected.deadlineSubmission) &&
    sameRate(row.finalSubmission, expected.finalSubmission)
  );
}

function addSegmentToRollup(target: ShopRollup, row: Doc<"analyticsDailySegmentKpis">): void {
  target.shopCount += row.shopCount;
  target.kpiEligibleShopCount += row.kpiEligibleShopCount;
  addMilestones(target.milestoneCounts, row.milestoneCounts);
  addHealthCounts(target.healthSignalCounts, row.healthSignalCounts);
  addRate(target.northStar, row.northStar);
  addRate(target.deadlineSubmission, row.deadlineSubmission);
  addRate(target.finalSubmission, row.finalSubmission);
}

function segmentRollupMatches(rollup: ShopRollup, service: Doc<"analyticsDailyServiceKpis">): boolean {
  return (
    rollup.shopCount === service.shopCount &&
    rollup.kpiEligibleShopCount === service.kpiEligibleShopCount &&
    sameMilestones(rollup.milestoneCounts, service.milestoneCounts) &&
    sameHealthCounts(rollup.healthSignalCounts, service.healthSignalCounts) &&
    sameRate(rollup.northStar, service.northStar) &&
    sameRate(rollup.deadlineSubmission, service.deadlineSubmission) &&
    sameRate(rollup.finalSubmission, service.finalSubmission)
  );
}

function commonRowIsValid(
  row: { runId: AnalyticsRun["_id"]; snapshotDate: string; completeness: string; computedAt: number },
  run: AnalyticsRun,
): boolean {
  const lastRunWriteAt = run.terminalAt ?? run.updatedAt;
  return (
    row.runId === run._id &&
    row.snapshotDate === run.targetDate &&
    row.computedAt >= run.startedAt &&
    row.computedAt <= lastRunWriteAt &&
    row.completeness !== "partial"
  );
}

function serviceRowIsValid(row: Doc<"analyticsDailyServiceKpis">): boolean {
  return (
    row.completeness === "complete" &&
    countsAreValid([
      row.organizationCount,
      row.shopCount,
      row.kpiEligibleShopCount,
      row.activeShopCount,
      row.personCount,
      row.staffMembershipCount,
      row.unlinkedStaffCount,
      row.shiftTargetCount,
      row.managerMembershipCount,
      row.managerStaffCount,
    ]) &&
    row.kpiEligibleShopCount <= row.shopCount &&
    row.activeShopCount <= row.shopCount &&
    row.unlinkedStaffCount <= row.staffMembershipCount &&
    row.shiftTargetCount <= row.staffMembershipCount &&
    row.managerStaffCount <= row.managerMembershipCount &&
    milestoneCountsAreValid(row.milestoneCounts, row.kpiEligibleShopCount) &&
    healthCountsAreValid(row.healthSignalCounts, row.shopCount) &&
    [row.northStar, row.deadlineSubmission, row.finalSubmission].every(rateIsValid)
  );
}

function organizationRowIsValid(row: DailyOrganization): boolean {
  return (
    row.completeness === "complete" &&
    countsAreValid([
      row.shopCount,
      row.kpiEligibleShopCount,
      row.activeShopCount,
      row.uniquePersonCount,
      row.staffMembershipCount,
      row.unlinkedStaffCount,
      row.shiftTargetCount,
      row.managerMembershipCount,
      row.managerStaffCount,
    ]) &&
    row.kpiEligibleShopCount <= row.shopCount &&
    row.activeShopCount <= row.shopCount &&
    row.unlinkedStaffCount <= row.staffMembershipCount &&
    row.shiftTargetCount <= row.staffMembershipCount &&
    row.managerStaffCount <= row.managerMembershipCount &&
    milestoneCountsAreValid(row.milestoneCounts, row.kpiEligibleShopCount) &&
    healthCountsAreValid(row.healthSignalCounts, row.shopCount) &&
    [row.northStar, row.deadlineSubmission, row.finalSubmission].every(rateIsValid)
  );
}

function shopRowIsValid(row: DailyShop): boolean {
  const healthSignals = new Set(row.healthSignals.map(({ signal }) => signal));
  return (
    row.kpiEligible !== undefined &&
    row.completeness === "complete" &&
    countsAreValid([
      row.staffMembershipCount,
      row.shiftTargetCount,
      row.uniquePersonCount,
      row.unlinkedStaffCount,
      row.managerMembershipCount,
      row.managerStaffCount,
      row.lineLinkedCount,
      row.lineFollowingCount,
      row.cycleCount,
      row.confirmedCycleCount,
      row.confirmedBeforeStartCycleCount,
      row.issueHealthSignalCount,
      row.cumulativeNotificationSentCount,
      row.cumulativeNotificationFailedCount,
    ]) &&
    row.shiftTargetCount <= row.staffMembershipCount &&
    row.unlinkedStaffCount <= row.staffMembershipCount &&
    row.managerStaffCount <= row.managerMembershipCount &&
    row.lineLinkedCount <= row.staffMembershipCount &&
    row.lineFollowingCount <= row.lineLinkedCount &&
    row.confirmedCycleCount <= row.cycleCount &&
    row.confirmedBeforeStartCycleCount <= row.confirmedCycleCount &&
    healthSignals.size === row.healthSignals.length &&
    [
      row.northStar,
      row.deadlineSubmission,
      row.finalSubmission,
      row.cumulativeDeadlineSubmission,
      row.cumulativeFinalSubmission,
    ].every(rateIsValid)
  );
}

function segmentRowIsValid(row: Doc<"analyticsDailySegmentKpis">): boolean {
  return (
    row.kpiEligibleShopCount !== undefined &&
    row.completeness === "complete" &&
    countsAreValid([row.shopCount, row.kpiEligibleShopCount]) &&
    row.kpiEligibleShopCount <= row.shopCount &&
    milestoneCountsAreValid(row.milestoneCounts, row.kpiEligibleShopCount) &&
    healthCountsAreValid(row.healthSignalCounts, row.shopCount) &&
    [row.northStar, row.deadlineSubmission, row.finalSubmission].every(rateIsValid)
  );
}

function notificationRowIsValid(row: Doc<"analyticsDailyNotificationKpis">): boolean {
  if (row.completeness !== "complete" || !countsAreValid([row.sentCount, row.failedCount])) return false;
  switch (row.scope) {
    case "service":
      return row.scopeKey === "service";
    case "shop":
      return row.shopId !== undefined && row.scopeKey === `shop:${row.shopId}`;
    case "recruitment":
      return (
        row.recruitmentId !== undefined &&
        row.organizationId !== undefined &&
        row.shopId !== undefined &&
        row.scopeKey === `recruitment:${row.recruitmentId}`
      );
  }
}

function uniqueBy<T>(rows: readonly T[], key: (row: T) => string): boolean {
  return new Set(rows.map(key)).size === rows.length;
}

function copyRollup(value: AnalyticsInvariantRollup): AnalyticsInvariantRollup {
  return {
    ...value,
    milestoneCounts: { ...value.milestoneCounts },
    healthSignalCounts: { ...value.healthSignalCounts },
    northStar: { ...value.northStar },
    deadlineSubmission: { ...value.deadlineSubmission },
    finalSubmission: { ...value.finalSubmission },
  };
}

function requireRollup(value: AnalyticsInvariantRollup | undefined): AnalyticsInvariantRollup {
  if (!value) throw new Error("analytics_invariant_accumulator_missing");
  const counts = [
    value.organizationCount,
    value.shopCount,
    value.kpiEligibleShopCount,
    value.activeShopCount,
    value.personCount,
    value.staffMembershipCount,
    value.unlinkedStaffCount,
    value.shiftTargetCount,
    value.managerMembershipCount,
    value.managerStaffCount,
  ];
  if (
    !countsAreValid(counts) ||
    !milestoneCountsAreValid(value.milestoneCounts) ||
    !healthCountsAreValid(value.healthSignalCounts) ||
    ![value.northStar, value.deadlineSubmission, value.finalSubmission].every(rateIsValid)
  ) {
    throw new Error("analytics_invariant_accumulator_invalid");
  }
  return copyRollup(value);
}

function assertScopeLimit(rows: readonly unknown[]): void {
  if (rows.length > SCOPE_READ_LIMIT) throw new Error("analytics_scope_limit_exceeded");
}

export type AnalyticsInvariantPageResult =
  | { status: "continue"; substage: string; cursor?: string; rollup?: AnalyticsInvariantRollup }
  | { status: "valid" }
  | { status: "invalid" };

type OutputAuditArgs = {
  substage?: string;
  cursor?: string;
  rollup?: AnalyticsInvariantRollup;
};

function continuation(
  substage: string,
  args: { cursor?: string; rollup?: AnalyticsInvariantRollup } = {},
): AnalyticsInvariantPageResult {
  return {
    status: "continue",
    substage,
    ...(args.cursor ? { cursor: args.cursor } : {}),
    ...(args.rollup ? { rollup: args.rollup } : {}),
  };
}

function outputPhase(substage: string | undefined): string {
  const phase = substage ?? "service";
  if (["service", "organizations", "shops", "notifications"].includes(phase)) return phase;
  if (
    phase.startsWith("segments:") &&
    SEGMENT_DIMENSIONS.includes(phase.slice("segments:".length) as (typeof SEGMENT_DIMENSIONS)[number])
  ) {
    return phase;
  }
  throw new Error("analytics_run_invariant_failed");
}

async function getAuditedService(
  ctx: MutationCtx,
  run: AnalyticsRun,
): Promise<Doc<"analyticsDailyServiceKpis"> | null> {
  const rows = await ctx.db
    .query("analyticsDailyServiceKpis")
    .withIndex("by_runId", (q) => q.eq("runId", run._id))
    .take(2);
  if (rows.length !== 1) return null;
  const service = rows[0];
  return service && commonRowIsValid(service, run) && serviceRowIsValid(service) ? service : null;
}

async function inspectOrganizationOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  service: Doc<"analyticsDailyServiceKpis">,
  args: OutputAuditArgs,
): Promise<AnalyticsInvariantPageResult> {
  const rollup = requireRollup(args.rollup);
  const page = await ctx.db
    .query("analyticsDailyOrganizationKpis")
    .withIndex("by_runId", (q) => q.eq("runId", run._id))
    .paginate({
      numItems: ORGANIZATION_AUDIT_PAGE_SIZE,
      cursor: args.cursor ?? null,
      maximumRowsRead: ORGANIZATION_AUDIT_PAGE_SIZE,
    });
  for (const organization of page.page) {
    if (!commonRowIsValid(organization, run) || !organizationRowIsValid(organization)) return { status: "invalid" };
    const matchingOrganizations = await ctx.db
      .query("analyticsDailyOrganizationKpis")
      .withIndex("by_organizationId_and_snapshotDate", (q) =>
        q.eq("organizationId", organization.organizationId).eq("snapshotDate", organization.snapshotDate),
      )
      .take(2);
    if (matchingOrganizations.length !== 1 || matchingOrganizations[0]?._id !== organization._id) {
      return { status: "invalid" };
    }
    const shops = await ctx.db
      .query("analyticsDailyShopKpis")
      .withIndex("by_organizationId_and_snapshotDate", (q) =>
        q.eq("organizationId", organization.organizationId).eq("snapshotDate", organization.snapshotDate),
      )
      .take(SCOPE_READ_LIMIT + 1);
    assertScopeLimit(shops);
    if (
      shops.some(
        (shop) =>
          shop.runId !== run._id ||
          shop.organizationId !== organization.organizationId ||
          !commonRowIsValid(shop, run) ||
          !shopRowIsValid(shop),
      ) ||
      !uniqueBy(shops, (shop) => String(shop.shopId))
    ) {
      return { status: "invalid" };
    }
    const shopRollup = emptyShopRollup();
    for (const shop of shops) addShopToRollup(shopRollup, shop);
    if (!shopRollupMatches(organization, shopRollup)) return { status: "invalid" };
    addOrganizationToRollup(rollup, organization);
  }
  if (!page.isDone) {
    return continuation("organizations", { cursor: page.continueCursor, rollup });
  }
  if (!serviceRollupMatches(service, rollup)) return { status: "invalid" };
  return continuation("shops", { rollup: emptyServiceRollup() });
}

async function inspectShopOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  service: Doc<"analyticsDailyServiceKpis">,
  args: OutputAuditArgs,
): Promise<AnalyticsInvariantPageResult> {
  const rollup = requireRollup(args.rollup);
  const page = await ctx.db
    .query("analyticsDailyShopKpis")
    .withIndex("by_runId", (q) => q.eq("runId", run._id))
    .paginate({
      numItems: OUTPUT_AUDIT_PAGE_SIZE,
      cursor: args.cursor ?? null,
      maximumRowsRead: OUTPUT_AUDIT_PAGE_SIZE,
    });
  for (const shop of page.page) {
    if (!commonRowIsValid(shop, run) || !shopRowIsValid(shop)) return { status: "invalid" };
    const [matchingShops, organizations] = await Promise.all([
      ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_shopId_and_snapshotDate", (q) =>
          q.eq("shopId", shop.shopId).eq("snapshotDate", shop.snapshotDate),
        )
        .take(2),
      ctx.db
        .query("analyticsDailyOrganizationKpis")
        .withIndex("by_organizationId_and_snapshotDate", (q) =>
          q.eq("organizationId", shop.organizationId).eq("snapshotDate", shop.snapshotDate),
        )
        .take(2),
    ]);
    if (
      matchingShops.length !== 1 ||
      matchingShops[0]?._id !== shop._id ||
      organizations.length !== 1 ||
      organizations[0]?.runId !== run._id
    ) {
      return { status: "invalid" };
    }
    rollup.shopCount += 1;
  }
  if (!page.isDone) return continuation("shops", { cursor: page.continueCursor, rollup });
  if (rollup.shopCount !== service.shopCount) return { status: "invalid" };
  return continuation(`segments:${SEGMENT_DIMENSIONS[0]}`, { rollup: emptyServiceRollup() });
}

async function inspectSegmentOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  service: Doc<"analyticsDailyServiceKpis">,
  dimension: (typeof SEGMENT_DIMENSIONS)[number],
  args: OutputAuditArgs,
): Promise<AnalyticsInvariantPageResult> {
  if (!run.targetDate) return { status: "invalid" };
  const rollup = requireRollup(args.rollup);
  const page = await ctx.db
    .query("analyticsDailySegmentKpis")
    .withIndex("by_snapshotDate_and_dimension_and_bucket", (q) =>
      q.eq("snapshotDate", run.targetDate as string).eq("dimension", dimension),
    )
    .paginate({
      numItems: OUTPUT_AUDIT_PAGE_SIZE,
      cursor: args.cursor ?? null,
      maximumRowsRead: OUTPUT_AUDIT_PAGE_SIZE,
    });
  for (const segment of page.page) {
    if (!commonRowIsValid(segment, run) || !segmentRowIsValid(segment)) return { status: "invalid" };
    const matchingSegments = await ctx.db
      .query("analyticsDailySegmentKpis")
      .withIndex("by_snapshotDate_and_dimension_and_bucket", (q) =>
        q.eq("snapshotDate", segment.snapshotDate).eq("dimension", segment.dimension).eq("bucket", segment.bucket),
      )
      .take(2);
    if (matchingSegments.length !== 1 || matchingSegments[0]?._id !== segment._id) return { status: "invalid" };
    addSegmentToRollup(rollup, segment);
  }
  if (!page.isDone) {
    return continuation(`segments:${dimension}`, { cursor: page.continueCursor, rollup });
  }
  if (!segmentRollupMatches(rollup, service)) return { status: "invalid" };
  const index = SEGMENT_DIMENSIONS.indexOf(dimension);
  const next = SEGMENT_DIMENSIONS[index + 1];
  return next ? continuation(`segments:${next}`, { rollup: emptyServiceRollup() }) : continuation("notifications");
}

async function inspectNotificationOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  args: OutputAuditArgs,
): Promise<AnalyticsInvariantPageResult> {
  const page = await ctx.db
    .query("analyticsDailyNotificationKpis")
    .withIndex("by_runId", (q) => q.eq("runId", run._id))
    .paginate({
      numItems: OUTPUT_AUDIT_PAGE_SIZE,
      cursor: args.cursor ?? null,
      maximumRowsRead: OUTPUT_AUDIT_PAGE_SIZE,
    });
  for (const notification of page.page) {
    if (!commonRowIsValid(notification, run) || !notificationRowIsValid(notification)) {
      return { status: "invalid" };
    }
    const matchingNotifications = await ctx.db
      .query("analyticsDailyNotificationKpis")
      .withIndex("by_runId_and_scopeKey_and_channel_and_kind", (q) =>
        q
          .eq("runId", run._id)
          .eq("scopeKey", notification.scopeKey)
          .eq("channel", notification.channel)
          .eq("kind", notification.kind),
      )
      .take(2);
    if (matchingNotifications.length !== 1 || matchingNotifications[0]?._id !== notification._id) {
      return { status: "invalid" };
    }
  }
  return page.isDone ? { status: "valid" } : continuation("notifications", { cursor: page.continueCursor });
}

/** One bounded page of the daily output invariant. Caller schedules the returned continuation. */
export async function inspectDailyOutputPage(
  ctx: MutationCtx,
  run: AnalyticsRun,
  args: OutputAuditArgs,
): Promise<AnalyticsInvariantPageResult> {
  const targetRange = run.targetDate === undefined ? null : jstDayRangeMs(run.targetDate);
  const completeDay = targetRange !== null && run.cutoffAt === targetRange.endMs;
  const initialPartial =
    targetRange !== null &&
    run.targetDate !== undefined &&
    run.targetDate === run.dataStartDate &&
    run.dataStartAt === targetRange.endMs &&
    targetRange.startMs <= run.cutoffAt &&
    run.cutoffAt < targetRange.endMs;
  if (run.kind !== "daily" || run.targetDate === undefined || (!completeDay && !initialPartial)) {
    return { status: "invalid" };
  }
  const phase = outputPhase(args.substage);
  const service = await getAuditedService(ctx, run);
  if (!service) return { status: "invalid" };
  if (phase === "service") return continuation("organizations", { rollup: emptyServiceRollup() });
  if (phase === "organizations") return await inspectOrganizationOutputPage(ctx, run, service, args);
  if (phase === "shops") return await inspectShopOutputPage(ctx, run, service, args);
  if (phase === "notifications") return await inspectNotificationOutputPage(ctx, run, args);
  return await inspectSegmentOutputPage(
    ctx,
    run,
    service,
    phase.slice("segments:".length) as (typeof SEGMENT_DIMENSIONS)[number],
    args,
  );
}

async function uniqueOrganization(ctx: MutationCtx, organizationId: Doc<"analyticsOrganizations">["organizationId"]) {
  const rows = await ctx.db
    .query("analyticsOrganizations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(2);
  return rows.length === 1 ? rows[0] : null;
}

async function uniqueShop(ctx: MutationCtx, shopId: Doc<"analyticsShops">["shopId"]) {
  const rows = await ctx.db
    .query("analyticsShops")
    .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
    .take(2);
  return rows.length === 1 ? rows[0] : null;
}

async function uniquePerson(ctx: MutationCtx, personId: Doc<"analyticsPeople">["organizationPersonId"]) {
  const rows = await ctx.db
    .query("analyticsPeople")
    .withIndex("by_organizationPersonId", (q) => q.eq("organizationPersonId", personId))
    .take(2);
  return rows.length === 1 ? rows[0] : null;
}

async function uniqueCycle(ctx: MutationCtx, recruitmentId: Doc<"analyticsShiftCycles">["recruitmentId"]) {
  const rows = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitmentId))
    .take(2);
  return rows.length === 1 ? rows[0] : null;
}

function opportunityMatchesCycle(
  opportunity: Doc<"analyticsShiftCycleOpportunities">,
  cycle: Doc<"analyticsShiftCycles">,
): boolean {
  if (
    cycle.organizationId !== opportunity.organizationId ||
    cycle.shopId !== opportunity.shopId ||
    opportunity.completeness !== "complete" ||
    !countsAreValid([opportunity.reminderCount])
  ) {
    return false;
  }
  return opportunity.identityState === "redacted"
    ? opportunity.staffId === undefined && opportunity.organizationPersonId === undefined
    : opportunity.staffId !== undefined;
}

async function canonicalMembershipIsValid(ctx: MutationCtx, membership: Doc<"analyticsMemberships">): Promise<boolean> {
  const matching = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_membershipKey_and_validFrom", (q) =>
      q.eq("membershipKey", membership.membershipKey).eq("validFrom", membership.validFrom),
    )
    .take(2);
  if (matching.length !== 1 || matching[0]?._id !== membership._id) return false;
  if (membership.validTo !== undefined && membership.validTo < membership.validFrom) return false;
  const organization = await uniqueOrganization(ctx, membership.organizationId);
  if (!organization) return false;
  if (membership.role === "manager") {
    const person = await uniquePerson(ctx, membership.organizationPersonId);
    return person?.organizationId === membership.organizationId;
  }
  const [shop, person] = await Promise.all([
    uniqueShop(ctx, membership.shopId),
    membership.organizationPersonId ? uniquePerson(ctx, membership.organizationPersonId) : null,
  ]);
  return (
    shop?.organizationId === membership.organizationId &&
    (!membership.organizationPersonId || person?.organizationId === membership.organizationId)
  );
}

async function canonicalCycleIsValid(ctx: MutationCtx, cycle: Doc<"analyticsShiftCycles">): Promise<boolean> {
  const matching = await uniqueCycle(ctx, cycle.recruitmentId);
  const shop = await uniqueShop(ctx, cycle.shopId);
  if (matching?._id !== cycle._id || shop?.organizationId !== cycle.organizationId) return false;
  if (cycle.completeness !== "complete") return true;
  if (
    cycle.targetAtDeadline === undefined ||
    cycle.submittedAtDeadline === undefined ||
    cycle.targetAtClose === undefined ||
    cycle.submittedAtClose === undefined ||
    !rateIsValid({ numerator: cycle.submittedAtDeadline, denominator: cycle.targetAtDeadline }) ||
    !rateIsValid({ numerator: cycle.submittedAtClose, denominator: cycle.targetAtClose })
  ) {
    return false;
  }
  const opportunities = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", cycle.recruitmentId))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(opportunities);
  if (opportunities.some((opportunity) => !opportunityMatchesCycle(opportunity, cycle))) return false;
  const activeKeys = opportunities.flatMap((opportunity) =>
    opportunity.identityState === "active" && opportunity.staffId
      ? [`${opportunity.recruitmentId}:${opportunity.staffId}`]
      : [],
  );
  if (new Set(activeKeys).size !== activeKeys.length) return false;
  const closeAt = cycle.confirmedAt ?? getSubmitLinkCutoff(cycle.periodStart);
  const targetAtDeadline = opportunities.filter((row) => row.targetedAtDeadline).length;
  const submittedAtDeadline = opportunities.filter(
    (row) =>
      row.targetedAtDeadline && row.firstSubmittedAt !== undefined && row.firstSubmittedAt < cycle.submitDeadlineAt,
  ).length;
  const targetAtClose = opportunities.filter((row) => row.targetedAtClose).length;
  const submittedAtClose = opportunities.filter(
    (row) => row.targetedAtClose && row.firstSubmittedAt !== undefined && row.firstSubmittedAt < closeAt,
  ).length;
  return (
    targetAtDeadline === cycle.targetAtDeadline &&
    submittedAtDeadline === cycle.submittedAtDeadline &&
    targetAtClose === cycle.targetAtClose &&
    submittedAtClose === cycle.submittedAtClose
  );
}

async function canonicalOpportunityIsValid(
  ctx: MutationCtx,
  opportunity: Doc<"analyticsShiftCycleOpportunities">,
): Promise<boolean> {
  const cycle = await uniqueCycle(ctx, opportunity.recruitmentId);
  if (!cycle || !opportunityMatchesCycle(opportunity, cycle)) return false;
  if (opportunity.identityState === "redacted" || !opportunity.staffId) return true;
  const matching = await ctx.db
    .query("analyticsShiftCycleOpportunities")
    .withIndex("by_recruitmentId_and_staffId", (q) =>
      q.eq("recruitmentId", opportunity.recruitmentId).eq("staffId", opportunity.staffId),
    )
    .take(2);
  if (matching.length !== 1 || matching[0]?._id !== opportunity._id) return false;
  const memberships = await ctx.db
    .query("analyticsMemberships")
    .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", `staff:${opportunity.staffId}`))
    .take(SCOPE_READ_LIMIT + 1);
  assertScopeLimit(memberships);
  if (
    memberships.length > 0 &&
    !memberships.some(
      (membership) =>
        membership.role === "staff" &&
        membership.organizationId === opportunity.organizationId &&
        membership.shopId === opportunity.shopId,
    )
  ) {
    return false;
  }
  if (opportunity.organizationPersonId) {
    const person = await uniquePerson(ctx, opportunity.organizationPersonId);
    if (person?.organizationId !== opportunity.organizationId) return false;
  }
  return true;
}

const CANONICAL_PHASES = ["organizations", "shops", "people", "memberships", "cycles", "opportunities"] as const;
type CanonicalPhase = (typeof CANONICAL_PHASES)[number];

function canonicalPhase(substage: string | undefined): CanonicalPhase {
  const phase = substage ?? CANONICAL_PHASES[0];
  if (!CANONICAL_PHASES.includes(phase as CanonicalPhase)) throw new Error("analytics_run_invariant_failed");
  return phase as CanonicalPhase;
}

function nextCanonicalPhase(phase: CanonicalPhase): AnalyticsInvariantPageResult {
  const next = CANONICAL_PHASES[CANONICAL_PHASES.indexOf(phase) + 1];
  return next ? continuation(next) : { status: "valid" };
}

/** One bounded page of the current canonical reference audit. */
export async function inspectCanonicalFactsPage(
  ctx: MutationCtx,
  args: { substage?: string; cursor?: string },
): Promise<AnalyticsInvariantPageResult> {
  const phase = canonicalPhase(args.substage);
  const pageSize = phase === "cycles" || phase === "opportunities" ? 1 : CANONICAL_AUDIT_PAGE_SIZE;
  switch (phase) {
    case "organizations": {
      const page = await ctx.db
        .query("analyticsOrganizations")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) {
        if ((await uniqueOrganization(ctx, row.organizationId))?._id !== row._id) return { status: "invalid" };
      }
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
    case "shops": {
      const page = await ctx.db
        .query("analyticsShops")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) {
        if (
          (await uniqueShop(ctx, row.shopId))?._id !== row._id ||
          (await uniqueOrganization(ctx, row.organizationId)) === null
        ) {
          return { status: "invalid" };
        }
      }
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
    case "people": {
      const page = await ctx.db
        .query("analyticsPeople")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) {
        if (
          (await uniquePerson(ctx, row.organizationPersonId))?._id !== row._id ||
          (await uniqueOrganization(ctx, row.organizationId)) === null
        ) {
          return { status: "invalid" };
        }
      }
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
    case "memberships": {
      const page = await ctx.db
        .query("analyticsMemberships")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) if (!(await canonicalMembershipIsValid(ctx, row))) return { status: "invalid" };
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
    case "cycles": {
      const page = await ctx.db
        .query("analyticsShiftCycles")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) if (!(await canonicalCycleIsValid(ctx, row))) return { status: "invalid" };
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
    case "opportunities": {
      const page = await ctx.db
        .query("analyticsShiftCycleOpportunities")
        .paginate({ numItems: pageSize, cursor: args.cursor ?? null, maximumRowsRead: pageSize });
      for (const row of page.page) if (!(await canonicalOpportunityIsValid(ctx, row))) return { status: "invalid" };
      return page.isDone ? nextCanonicalPhase(phase) : continuation(phase, { cursor: page.continueCursor });
    }
  }
}

export async function assertNoDueCyclesAtCutoff(ctx: MutationCtx, run: AnalyticsRun): Promise<void> {
  const dueCycle = await ctx.db
    .query("analyticsShiftCycles")
    .withIndex("by_needsFinalizationAt", (q) => q.gt("needsFinalizationAt", 0).lte("needsFinalizationAt", run.cutoffAt))
    .first();
  if (dueCycle) throw new Error("analytics_run_invariant_failed");
}
