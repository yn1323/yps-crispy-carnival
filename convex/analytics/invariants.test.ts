import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { addDays, jstDayRangeMs } from "../_lib/dateFormat";
import { seedStaff } from "../_test/scenarioBuilders";
import { modules, schema } from "../_test/setup.test-helper";
import { aggregateDailyOrganizationPage, aggregateDailyShopPage } from "./aggregation";
import { type AnalyticsInvariantPageResult, inspectCanonicalFactsPage, inspectDailyOutputPage } from "./invariants";
import { assertOpportunityRedactionReady } from "./maintenance";
import { ANALYTICS_CALCULATION_VERSION, emptyHealthSignalCounts, emptyMilestoneCounts } from "./model";

const NOW = Date.parse("2026-05-08T04:00:00.000Z");
const TARGET_DATE = "2026-05-07";
const DAY = jstDayRangeMs(TARGET_DATE);

const scheduleWeeklyRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/maintenance:scheduleWeekly",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

type MaintenanceStepArgs = {
  runId: Id<"analyticsRuns">;
  kind: "maintenance";
  stepVersion: number;
  stage: string;
  cursor?: string;
  substage?: string;
};

const maintenanceProcessPageRef = makeFunctionReference<"mutation", MaintenanceStepArgs, null>(
  "analytics/maintenance:processPage",
) as unknown as FunctionReference<"mutation", "internal", MaintenanceStepArgs, null>;

function emptyDailyOrganization(runId: Doc<"analyticsRuns">["_id"], organizationId: Doc<"organizations">["_id"]) {
  return {
    runId,
    organizationId,
    snapshotDate: TARGET_DATE,
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
    northStar: { numerator: 0, denominator: 0 },
    deadlineSubmission: { numerator: 0, denominator: 0 },
    finalSubmission: { numerator: 0, denominator: 0 },
    completeness: "complete" as const,
    computedAt: NOW,
  };
}

describe("Analytics bounded invariants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("初回partialはdataStartAtが対象日の翌日境界に一致する場合だけ有効とする", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("analyticsRuns", {
        runKey: `daily:${TARGET_DATE}:initial-partial`,
        kind: "daily",
        status: "running",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.endMs,
        targetDate: TARGET_DATE,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.startMs + 60_000,
        stage: "publish",
        stepVersion: 6,
        startedAt: NOW - 1_000,
        updatedAt: NOW,
      });
      await ctx.db.insert("analyticsDailyServiceKpis", {
        runId,
        snapshotDate: TARGET_DATE,
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
        northStar: { numerator: 0, denominator: 0 },
        deadlineSubmission: { numerator: 0, denominator: 0 },
        finalSubmission: { numerator: 0, denominator: 0 },
        completeness: "complete",
        computedAt: NOW,
      });
      const validRun = await ctx.db.get(runId);
      if (!validRun) throw new Error("test run missing");
      const valid = await inspectDailyOutputPage(ctx, validRun, { substage: "service" });

      await ctx.db.patch(runId, { dataStartAt: DAY.startMs });
      const invalidRun = await ctx.db.get(runId);
      if (!invalidRun) throw new Error("test run missing");
      const invalid = await inspectDailyOutputPage(ctx, invalidRun, { substage: "service" });
      return { valid, invalid };
    });

    expect(result.valid.status).toBe("continue");
    expect(result.invalid).toEqual({ status: "invalid" });
  });

  it("501 organizationsでもservice・publish・weekly canonical auditをpageで完了する", async () => {
    const t = convexTest(schema, modules);
    const runId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("analyticsRuns", {
        runKey: `daily:${TARGET_DATE}`,
        kind: "daily",
        status: "running",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        targetDate: TARGET_DATE,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.endMs,
        stage: "publish",
        stepVersion: 6,
        startedAt: NOW - 1_000,
        updatedAt: NOW + 1,
      });
      for (let index = 0; index < 501; index += 1) {
        const organizationId = await ctx.db.insert("organizations", {
          name: `organization-${index}`,
          isDeleted: false,
          createdAt: NOW - 10_000,
          updatedAt: NOW - 10_000,
        });
        await ctx.db.insert("analyticsOrganizations", {
          organizationId,
          displayName: `organization-${index}`,
          registeredAt: NOW - 10_000,
          updatedAt: NOW - 10_000,
        });
        await ctx.db.insert("analyticsDailyOrganizationKpis", emptyDailyOrganization(id, organizationId));
      }
      await ctx.db.insert("analyticsDailyServiceKpis", {
        runId: id,
        snapshotDate: TARGET_DATE,
        organizationCount: 501,
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
        northStar: { numerator: 0, denominator: 0 },
        deadlineSubmission: { numerator: 0, denominator: 0 },
        finalSubmission: { numerator: 0, denominator: 0 },
        completeness: "complete",
        computedAt: NOW,
      });
      return id;
    });

    let output: AnalyticsInvariantPageResult = { status: "continue", substage: "service" };
    for (let pageCount = 0; output.status === "continue" && pageCount < 600; pageCount += 1) {
      const args: Extract<AnalyticsInvariantPageResult, { status: "continue" }> = output;
      const next: AnalyticsInvariantPageResult = await t.run(async (ctx) => {
        const run = await ctx.db.get(runId);
        if (!run) throw new Error("test run missing");
        return await inspectDailyOutputPage(ctx, run, {
          substage: args.substage,
          cursor: args.cursor,
          rollup: args.rollup,
        });
      });
      output = next;
    }
    expect(output).toEqual({ status: "valid" });

    let canonical: AnalyticsInvariantPageResult = { status: "continue", substage: "organizations" };
    for (let pageCount = 0; canonical.status === "continue" && pageCount < 100; pageCount += 1) {
      const args: Extract<AnalyticsInvariantPageResult, { status: "continue" }> = canonical;
      const next: AnalyticsInvariantPageResult = await t.run(
        async (ctx) => await inspectCanonicalFactsPage(ctx, { substage: args.substage, cursor: args.cursor }),
      );
      canonical = next;
    }
    expect(canonical).toEqual({ status: "valid" });
  });

  it("切替前店舗もcurrent health・cycle rateへ含め、milestoneだけをeligibleから除外する", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        name: "legacy shop organization",
        isDeleted: false,
        createdAt: DAY.startMs - 10_000,
        updatedAt: DAY.startMs - 10_000,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "legacy shop",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const includedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "included manager",
        email: "included@example.com",
        emailNormalized: "included@example.com",
        status: "active",
        createdAt: DAY.startMs - 10_000,
        updatedAt: DAY.startMs - 10_000,
      });
      const excludedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId,
        name: "excluded manager",
        email: "excluded@example.com",
        emailNormalized: "excluded@example.com",
        status: "active",
        createdAt: DAY.startMs - 10_000,
        updatedAt: DAY.startMs - 10_000,
      });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId,
        displayName: "legacy shop organization",
        registeredAt: DAY.startMs - 10_000,
        updatedAt: DAY.startMs - 1,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId,
        shopId,
        displayName: "legacy shop",
        registeredAt: DAY.startMs - 10_000,
        cadenceConfidence: "insufficientData",
        updatedAt: DAY.startMs - 1,
      });
      for (const organizationPersonId of [includedPersonId, excludedPersonId]) {
        await ctx.db.insert("analyticsPeople", {
          organizationId,
          organizationPersonId,
          firstObservedAt: DAY.startMs - 10_000,
          updatedAt: DAY.startMs - 1,
        });
      }
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `manager:${includedPersonId}`,
        organizationId,
        organizationPersonId: includedPersonId,
        role: "manager",
        validFrom: DAY.startMs - 10_000,
        validTo: DAY.endMs,
        isShiftTarget: false,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: DAY.startMs - 1,
      });
      await ctx.db.insert("analyticsMemberships", {
        membershipKey: `manager:${excludedPersonId}`,
        organizationId,
        organizationPersonId: excludedPersonId,
        role: "manager",
        validFrom: DAY.endMs,
        isShiftTarget: false,
        lineLinked: false,
        lineFollowing: false,
        updatedAt: DAY.startMs - 1,
      });
      const runId = await ctx.db.insert("analyticsRuns", {
        runKey: `daily:${TARGET_DATE}:legacy-shop`,
        kind: "daily",
        status: "running",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        targetDate: TARGET_DATE,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.endMs,
        stage: "organizations",
        stepVersion: 4,
        startedAt: NOW - 1_000,
        updatedAt: NOW,
      });
      await ctx.db.insert("analyticsDailyShopKpis", {
        runId,
        organizationId,
        shopId,
        snapshotDate: TARGET_DATE,
        kpiEligible: false,
        staffMembershipCount: 2,
        shiftTargetCount: 2,
        uniquePersonCount: 2,
        unlinkedStaffCount: 0,
        managerMembershipCount: 1,
        managerStaffCount: 0,
        lineLinkedCount: 1,
        lineFollowingCount: 1,
        hasRecentActivity: true,
        cycleCount: 1,
        confirmedCycleCount: 1,
        confirmedBeforeStartCycleCount: 1,
        issueHealthSignalCount: 0,
        milestoneDates: { registeredAt: DAY.startMs - 10_000 },
        healthSignals: [{ signal: "hasUpcomingCycle", startedAt: DAY.startMs }],
        cadence: { kind: "insufficientData" },
        northStar: { numerator: 1, denominator: 1 },
        deadlineSubmission: { numerator: 1, denominator: 2 },
        finalSubmission: { numerator: 2, denominator: 2 },
        cumulativeDeadlineSubmission: { numerator: 1, denominator: 2 },
        cumulativeFinalSubmission: { numerator: 2, denominator: 2 },
        cumulativeNotificationSentCount: 0,
        cumulativeNotificationFailedCount: 0,
        completeness: "complete",
        computedAt: NOW,
      });
      const run = await ctx.db.get(runId);
      if (!run) throw new Error("test run missing");
      await aggregateDailyOrganizationPage(ctx, run, null);
      return {
        organization: await ctx.db
          .query("analyticsDailyOrganizationKpis")
          .withIndex("by_organizationId_and_snapshotDate", (q) =>
            q.eq("organizationId", organizationId).eq("snapshotDate", TARGET_DATE),
          )
          .unique(),
        service: await ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", TARGET_DATE))
          .unique(),
      };
    });

    for (const row of [result.organization, result.service]) {
      expect(row).toMatchObject({
        shopCount: 1,
        kpiEligibleShopCount: 0,
        managerMembershipCount: 1,
        milestoneCounts: emptyMilestoneCounts(),
        healthSignalCounts: { hasUpcomingCycle: 1 },
        northStar: { numerator: 1, denominator: 1 },
        deadlineSubmission: { numerator: 1, denominator: 2 },
        finalSubmission: { numerator: 2, denominator: 2 },
        completeness: "complete",
      });
    }
  });

  it("targetDate開始cycleは当日KPIだけへ含め、翌日以降のcycleだけをupcomingにする", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        name: "cycle boundary organization",
        isDeleted: false,
        createdAt: DAY.startMs - 10_000,
        updatedAt: DAY.startMs - 10_000,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "cycle boundary shop",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId,
        shopId,
        displayName: "cycle boundary shop",
        registeredAt: DAY.startMs - 10_000,
        cadenceConfidence: "insufficientData",
        updatedAt: DAY.startMs - 1,
      });
      const runId = await ctx.db.insert("analyticsRuns", {
        runKey: `daily:${TARGET_DATE}:cycle-boundary`,
        kind: "daily",
        status: "running",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        targetDate: TARGET_DATE,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.endMs,
        stage: "shops",
        stepVersion: 3,
        startedAt: NOW - 1_000,
        updatedAt: NOW,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: TARGET_DATE,
        periodEnd: addDays(TARGET_DATE, 6),
        deadline: addDays(TARGET_DATE, -1),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: DAY.startMs + 2,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId,
        shopId,
        createdAt: DAY.startMs + 1,
        submitDeadlineAt: DAY.startMs + 2,
        periodStart: TARGET_DATE,
        periodEnd: addDays(TARGET_DATE, 6),
        confirmedAt: DAY.startMs + 2,
        closedAt: DAY.startMs + 2,
        targetAtDeadline: 1,
        submittedAtDeadline: 1,
        targetAtClose: 1,
        submittedAtClose: 1,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        confirmedBeforeStart: true,
        completeness: "complete",
        finalizedAt: DAY.startMs + 2,
        updatedAt: DAY.startMs + 2,
      });
      const run = await ctx.db.get(runId);
      if (!run) throw new Error("test run missing");
      await aggregateDailyShopPage(ctx, run, null);
      const targetOnly = await ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_shopId_and_snapshotDate", (q) => q.eq("shopId", shopId).eq("snapshotDate", TARGET_DATE))
        .unique();
      return {
        organizationId,
        shopId,
        runId,
        targetOnly: targetOnly
          ? {
              cycleCount: targetOnly.cycleCount,
              nextCyclePeriodStart: targetOnly.nextCyclePeriodStart,
              signals: targetOnly.healthSignals.map(({ signal }) => signal),
              northStar: targetOnly.northStar,
            }
          : null,
      };
    });
    const withTomorrow = await t.run(async (ctx) => {
      const periodStart = addDays(TARGET_DATE, 1);
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: fixture.shopId,
        periodStart,
        periodEnd: addDays(periodStart, 6),
        deadline: addDays(periodStart, -1),
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: DAY.startMs + 2,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: fixture.organizationId,
        shopId: fixture.shopId,
        createdAt: DAY.startMs + 1,
        submitDeadlineAt: DAY.startMs + 2,
        periodStart,
        periodEnd: addDays(periodStart, 6),
        confirmedAt: DAY.startMs + 2,
        closedAt: DAY.startMs + 2,
        targetAtDeadline: 1,
        submittedAtDeadline: 1,
        targetAtClose: 1,
        submittedAtClose: 1,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        confirmedBeforeStart: true,
        completeness: "complete",
        finalizedAt: DAY.startMs + 2,
        updatedAt: DAY.startMs + 2,
      });
      const run = await ctx.db.get(fixture.runId);
      if (!run) throw new Error("test run missing");
      await aggregateDailyShopPage(ctx, run, null);
      const row = await ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_shopId_and_snapshotDate", (q) => q.eq("shopId", fixture.shopId).eq("snapshotDate", TARGET_DATE))
        .unique();
      return row
        ? {
            cycleCount: row.cycleCount,
            nextCyclePeriodStart: row.nextCyclePeriodStart,
            signals: row.healthSignals.map(({ signal }) => signal),
          }
        : null;
    });

    expect(fixture.targetOnly).toMatchObject({
      cycleCount: 1,
      northStar: { numerator: 1, denominator: 1 },
    });
    expect(fixture.targetOnly?.nextCyclePeriodStart).toBeUndefined();
    expect(fixture.targetOnly?.signals).not.toContain("hasUpcomingCycle");
    expect(withTomorrow).toMatchObject({
      cycleCount: 1,
      nextCyclePeriodStart: addDays(TARGET_DATE, 1),
    });
    expect(withTomorrow?.signals).toContain("hasUpcomingCycle");
  });

  it("historicalとupcomingを合算した店舗cycleが500件を超えたらfail closedにする", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        const organizationId = await ctx.db.insert("organizations", {
          name: "cycle scope limit organization",
          isDeleted: false,
          createdAt: DAY.startMs - 10_000,
          updatedAt: DAY.startMs - 10_000,
        });
        const shopId = await ctx.db.insert("shops", {
          organizationId,
          name: "cycle scope limit shop",
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          regularClosedDays: [],
          isDeleted: false,
        });
        await ctx.db.insert("analyticsShops", {
          organizationId,
          shopId,
          displayName: "cycle scope limit shop",
          registeredAt: DAY.startMs - 10_000,
          cadenceConfidence: "insufficientData",
          updatedAt: DAY.startMs - 1,
        });
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: TARGET_DATE,
          periodEnd: addDays(TARGET_DATE, 6),
          deadline: addDays(TARGET_DATE, -1),
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: DAY.startMs + 2,
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        for (let index = 0; index < 501; index += 1) {
          const periodStart = index < 250 ? TARGET_DATE : addDays(TARGET_DATE, 1);
          await ctx.db.insert("analyticsShiftCycles", {
            recruitmentId,
            organizationId,
            shopId,
            createdAt: DAY.startMs + 1,
            submitDeadlineAt: DAY.startMs + 2,
            periodStart,
            periodEnd: addDays(periodStart, 6),
            notificationSentCount: 0,
            notificationFailedCount: 0,
            reminderSentCount: 0,
            completeness: "unavailable",
            updatedAt: DAY.startMs + 2,
          });
        }
        const runId = await ctx.db.insert("analyticsRuns", {
          runKey: `daily:${TARGET_DATE}:cycle-scope-limit`,
          kind: "daily",
          status: "running",
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          dataStartDate: TARGET_DATE,
          dataStartAt: DAY.startMs,
          targetDate: TARGET_DATE,
          inputFromAt: DAY.startMs,
          cutoffAt: DAY.endMs,
          stage: "shops",
          stepVersion: 3,
          startedAt: NOW - 1_000,
          updatedAt: NOW,
        });
        const run = await ctx.db.get(runId);
        if (!run) throw new Error("test run missing");
        await aggregateDailyShopPage(ctx, run, null);
      }),
    ).rejects.toThrow("analytics_shop_cycle_scope_too_large");
  });

  it("切替前店舗のactivityはdataStartAtを起点にし、30日境界を超えてからlongInactiveにする", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const oldRegisteredAt = DAY.startMs - 100 * 24 * 60 * 60 * 1_000;
      const organizationId = await ctx.db.insert("organizations", {
        name: "activity baseline organization",
        isDeleted: false,
        createdAt: oldRegisteredAt,
        updatedAt: DAY.startMs - 10_000,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "activity baseline shop",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId,
        shopId,
        displayName: "activity baseline shop",
        registeredAt: oldRegisteredAt,
        cadenceConfidence: "insufficientData",
        updatedAt: DAY.startMs - 1,
      });
      return { shopId };
    });
    const aggregateFor = async (targetDate: string) =>
      await t.run(async (ctx) => {
        const range = jstDayRangeMs(targetDate);
        const runId = await ctx.db.insert("analyticsRuns", {
          runKey: `daily:${targetDate}:activity-boundary`,
          kind: "daily",
          status: "running",
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          dataStartDate: TARGET_DATE,
          dataStartAt: DAY.startMs,
          targetDate,
          inputFromAt: DAY.startMs,
          cutoffAt: range.endMs,
          stage: "shops",
          stepVersion: 3,
          startedAt: NOW - 1_000,
          updatedAt: NOW,
        });
        const run = await ctx.db.get(runId);
        if (!run) throw new Error("test run missing");
        await aggregateDailyShopPage(ctx, run, null);
        const row = await ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_shopId_and_snapshotDate", (q) => q.eq("shopId", fixture.shopId).eq("snapshotDate", targetDate))
          .unique();
        return row
          ? {
              hasRecentActivity: row.hasRecentActivity,
              longInactive: row.healthSignals.find(({ signal }) => signal === "longInactive"),
            }
          : null;
      });
    const atBoundary = await aggregateFor(addDays(TARGET_DATE, 29));
    const afterBoundary = await aggregateFor(addDays(TARGET_DATE, 30));

    expect(atBoundary).toEqual({ hasRecentActivity: true, longInactive: undefined });
    expect(afterBoundary).toEqual({
      hasRecentActivity: false,
      longInactive: { signal: "longInactive", startedAt: DAY.startMs + 30 * 24 * 60 * 60 * 1_000 },
    });
  });

  it("weekly maintenanceは監査より先に14日以内のopportunity PIIをcycle単位でredactする", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "true");
    const opportunityIds = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", {
        name: "redaction organization",
        isDeleted: false,
        createdAt: NOW - 10_000,
        updatedAt: NOW - 10_000,
      });
      const shopId = await ctx.db.insert("shops", {
        organizationId,
        name: "redaction shop",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-05-08",
        periodEnd: "2026-05-14",
        deadline: "2026-05-07",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: NOW - 1_000,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      await ctx.db.insert("analyticsRuns", {
        runKey: "reset:redaction-baseline",
        kind: "reset",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.startMs,
        sourceCaptureStartAt: DAY.startMs,
        stage: "resetVerify",
        stepVersion: 1,
        startedAt: NOW - 20_000,
        terminalAt: NOW - 19_000,
        updatedAt: NOW - 19_000,
      });
      await ctx.db.insert("analyticsRuns", {
        runKey: `daily:${TARGET_DATE}:redaction-baseline`,
        kind: "daily",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        targetDate: TARGET_DATE,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.endMs,
        stage: "publish",
        stepVersion: 7,
        startedAt: NOW - 10_000,
        terminalAt: NOW - 9_000,
        updatedAt: NOW - 9_000,
      });
      const ids = [];
      for (let index = 0; index < 51; index += 1) {
        const staffId = await seedStaff(ctx, {
          shopId,
          name: `redaction staff ${index}`,
          email: `redaction-${index}@example.com`,
        });
        ids.push(
          await ctx.db.insert("analyticsShiftCycleOpportunities", {
            recruitmentId,
            organizationId,
            shopId,
            staffId,
            targetedAtDeadline: true,
            targetedAtClose: true,
            reminderCount: 0,
            completeness: "complete",
            identityState: "active",
            expiresAt: NOW + 13 * 24 * 60 * 60 * 1_000,
          }),
        );
      }
      return ids;
    });

    await t.mutation(scheduleWeeklyRef, {});
    const maintenance = await t.run(async (ctx) => {
      const runs = await ctx.db.query("analyticsRuns").collect();
      return runs.find((run) => run.kind === "maintenance") ?? null;
    });
    expect(maintenance).toMatchObject({ status: "running", stage: "maintenanceCleanup", stepVersion: 0 });
    if (!maintenance) throw new Error("maintenance run missing");
    await expect(
      t.run(async (ctx) => await assertOpportunityRedactionReady(ctx, maintenance.cutoffAt)),
    ).rejects.toThrow("analytics_opportunity_redaction_incomplete");

    await t.mutation(maintenanceProcessPageRef, {
      runId: maintenance._id,
      kind: "maintenance",
      stepVersion: 0,
      stage: "maintenanceCleanup",
      substage: "opportunityPii",
    });

    const state = await t.run(async (ctx) => ({
      opportunities: await Promise.all(opportunityIds.map(async (id) => await ctx.db.get(id))),
      run: await ctx.db.get(maintenance._id),
    }));
    expect(state.opportunities).toHaveLength(51);
    expect(state.opportunities.every((opportunity) => opportunity?.identityState === "redacted")).toBe(true);
    expect(state.opportunities.every((opportunity) => opportunity?.staffId === undefined)).toBe(true);
    expect(state.run).toMatchObject({ status: "running", stage: "maintenanceCleanup", stepVersion: 1 });
    await expect(
      t.run(async (ctx) => await assertOpportunityRedactionReady(ctx, maintenance.cutoffAt)),
    ).resolves.toBeNull();
  });

  it("run manifest cleanupは保護対象だけのpageでもcursorを進め、後続orphanを削除する", async () => {
    const t = convexTest(schema, modules);
    const fixture = await t.run(async (ctx) => {
      const oldAt = jstDayRangeMs("2019-01-01").startMs;
      await ctx.db.insert("analyticsRuns", {
        runKey: "reset:manifest-current",
        kind: "reset",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        inputFromAt: DAY.startMs,
        cutoffAt: DAY.startMs,
        sourceCaptureStartAt: DAY.startMs,
        stage: "resetVerify",
        stepVersion: 1,
        startedAt: NOW - 3_000,
        terminalAt: NOW - 2_000,
        updatedAt: NOW - 2_000,
      });
      const protectedRunIds: Array<Id<"analyticsRuns">> = [];
      for (let index = 0; index < 50; index += 1) {
        const runId = await ctx.db.insert("analyticsRuns", {
          runKey: `daily:manifest-protected:${index}`,
          kind: "daily",
          status: "complete",
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          dataStartDate: "2019-01-01",
          dataStartAt: oldAt,
          targetDate: "2019-01-01",
          inputFromAt: oldAt,
          cutoffAt: oldAt + 1,
          stage: "publish",
          stepVersion: 7,
          startedAt: oldAt + index,
          terminalAt: oldAt + index,
          updatedAt: oldAt + index,
        });
        protectedRunIds.push(runId);
        await ctx.db.insert("analyticsDailyServiceKpis", {
          runId,
          snapshotDate: "2019-01-01",
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
          northStar: { numerator: 0, denominator: 0 },
          deadlineSubmission: { numerator: 0, denominator: 0 },
          finalSubmission: { numerator: 0, denominator: 0 },
          completeness: "complete",
          computedAt: oldAt + index,
        });
      }
      const orphanRunId = await ctx.db.insert("analyticsRuns", {
        runKey: "daily:manifest-orphan",
        kind: "daily",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: "2019-01-01",
        dataStartAt: oldAt,
        targetDate: "2019-01-02",
        inputFromAt: oldAt,
        cutoffAt: oldAt + 1,
        stage: "publish",
        stepVersion: 7,
        startedAt: oldAt + 100,
        terminalAt: oldAt + 100,
        updatedAt: oldAt + 100,
      });
      const maintenanceRunId = await ctx.db.insert("analyticsRuns", {
        runKey: "maintenance:manifest-cursor",
        kind: "maintenance",
        status: "running",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: TARGET_DATE,
        dataStartAt: DAY.startMs,
        inputFromAt: DAY.endMs,
        cutoffAt: NOW,
        stage: "maintenanceCleanup",
        stepVersion: 0,
        startedAt: NOW,
        updatedAt: NOW,
      });
      return { maintenanceRunId, orphanRunId, protectedRunIds };
    });

    await t.mutation(maintenanceProcessPageRef, {
      runId: fixture.maintenanceRunId,
      kind: "maintenance",
      stepVersion: 0,
      stage: "maintenanceCleanup",
      substage: "runManifests",
    });
    const continuation = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.find((job) => job.args[0]?.runId === fixture.maintenanceRunId)?.args[0] ?? null;
    });
    expect(continuation).toMatchObject({
      kind: "maintenance",
      stepVersion: 1,
      stage: "maintenanceCleanup",
      substage: "runManifests",
    });
    if (!continuation) throw new Error("manifest continuation missing");
    await t.mutation(maintenanceProcessPageRef, continuation as MaintenanceStepArgs);

    const state = await t.run(async (ctx) => ({
      orphan: await ctx.db.get(fixture.orphanRunId),
      protectedRuns: await Promise.all(fixture.protectedRunIds.map(async (runId) => await ctx.db.get(runId))),
      maintenance: await ctx.db.get(fixture.maintenanceRunId),
    }));
    expect(state.orphan).toBeNull();
    expect(state.protectedRuns.every((run) => run !== null)).toBe(true);
    expect(state.maintenance).toMatchObject({ stage: "maintenanceAudit", stepVersion: 2 });
  });
});
