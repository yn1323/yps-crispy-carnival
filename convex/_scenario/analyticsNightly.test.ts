import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_CALCULATION_VERSION, ANALYTICS_SCHEMA_VERSION } from "../analytics/model";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import { DAY_MS } from "../constants";

type ResetArgs = {
  confirmed: true;
  deploymentLabel: string;
  revision: string;
  sourceCaptureStartAt: string;
  calculationVersion: number;
};

const resetDryRunRef = makeFunctionReference<
  "mutation",
  ResetArgs,
  {
    allowed: boolean;
    configured: {
      deploymentLabel: string;
      revision: string;
      sourceCaptureStartAt: number | null;
      enabledUntil: number | null;
      nightlyCronEnabled: boolean;
    };
  }
>("analytics/reset:dryRun") as unknown as FunctionReference<
  "mutation",
  "internal",
  ResetArgs,
  {
    allowed: boolean;
    configured: {
      deploymentLabel: string;
      revision: string;
      sourceCaptureStartAt: number | null;
      enabledUntil: number | null;
      nightlyCronEnabled: boolean;
    };
  }
>;

const resetStartRef = makeFunctionReference<"mutation", ResetArgs, { runId: Id<"analyticsRuns">; runKey: string }>(
  "analytics/reset:start",
) as unknown as FunctionReference<"mutation", "internal", ResetArgs, { runId: Id<"analyticsRuns">; runKey: string }>;

const startFirstDateRef = makeFunctionReference<"mutation", { targetDate: string }, null>(
  "analytics/nightly:startForDate",
) as unknown as FunctionReference<"mutation", "internal", { targetDate: string }, null>;

const schedulePreviousDayRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/nightly:schedulePreviousDay",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

const scheduleWeeklyMaintenanceRef = makeFunctionReference<"mutation", Record<string, never>, null>(
  "analytics/maintenance:scheduleWeekly",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, null>;

const RESET_NOW = new Date("2026-05-10T10:00:00+09:00").getTime();
const RESET_DATE = "2026-05-10";
const RESET_DATA_START_DATE = "2026-05-11";
const INITIAL_PARTIAL_AT = new Date("2026-05-10T10:15:00+09:00").getTime();
const SOURCE_CAPTURE_START_AT = jstDayRangeMs("2026-05-09").startMs;
const SOURCE_CAPTURE_START_JST = "20260509000000";
const DEPLOYMENT_LABEL = "dev:analytics-scenario";
const REVISION = "analytics-nightly-scenario-v1";

function configureReset() {
  vi.stubEnv("ANALYTICS_DEPLOYMENT_LABEL", DEPLOYMENT_LABEL);
  vi.stubEnv("ANALYTICS_EXPECTED_REVISION", REVISION);
  vi.stubEnv("ANALYTICS_SOURCE_CAPTURE_START_AT", SOURCE_CAPTURE_START_JST);
  vi.stubEnv("ANALYTICS_RESET_ENABLED_UNTIL", String(RESET_NOW + DAY_MS));
  vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "false");
}

function resetArgs(): ResetArgs {
  return {
    confirmed: true,
    deploymentLabel: DEPLOYMENT_LABEL,
    revision: REVISION,
    sourceCaptureStartAt: SOURCE_CAPTURE_START_JST,
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
  };
}

async function finishScheduledAnalytics(t: TestConvex<typeof schema>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function getOverview(
  t: TestConvex<typeof schema>,
  from: string,
  to = from,
  comparison: { from: string; to: string } | null = null,
) {
  return await t.query(internal.analyticsDashboard.queries.getOverview, {
    from,
    to,
    compareFrom: comparison?.from ?? null,
    compareTo: comparison?.to ?? null,
    organizationId: null,
    shopId: null,
  });
}

describe("Analytics夜間バッチシナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(RESET_NOW);
    configureReset();
    expect(Date.now()).toBe(RESET_NOW);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reset当日の初回partialを公開し、翌03時は再実行せず翌々03時に未処理eventをfull日次へ引き継ぐ", async () => {
    const t = convexTest(schema, modules);
    const registeredAt = new Date("2026-04-01T09:00:00+09:00").getTime();
    vi.setSystemTime(registeredAt);
    const operational = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_reset_first_publish",
        shopName: "切替前登録店舗",
      }),
    );

    vi.setSystemTime(RESET_NOW);
    configureReset();
    await t.run(async (ctx) => {
      await ctx.db.insert("analyticsRuns", {
        runKey: "reset:obsolete-baseline",
        kind: "reset",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: "2026-04-02",
        dataStartAt: jstDayRangeMs("2026-04-02").startMs,
        inputFromAt: registeredAt,
        cutoffAt: registeredAt,
        sourceCaptureStartAt: registeredAt,
        stage: "resetVerify",
        stepVersion: 1,
        startedAt: registeredAt,
        terminalAt: registeredAt + 1,
        updatedAt: registeredAt + 1,
      });
      const payload = {
        kind: "organization" as const,
        change: "updated" as const,
        displayName: "capture以降の表示名",
      };
      await ctx.db.insert("analyticsSourceEvents", {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        eventKey: "scenario:before-capture",
        eventType: "organization.changed",
        occurredAt: SOURCE_CAPTURE_START_AT - 1,
        organizationId: operational.organizationId,
        payloadVersion: 1,
        payload,
        createdAt: RESET_NOW,
      });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: "scenario:after-capture",
        eventType: "organization.changed",
        occurredAt: SOURCE_CAPTURE_START_AT + 1,
        organizationId: operational.organizationId,
        payload,
      });
    });
    const resetPreview = await t.mutation(resetDryRunRef, resetArgs());
    expect(resetPreview.allowed, JSON.stringify(resetPreview)).toBe(true);
    expect(resetPreview).toMatchObject({
      configured: {
        deploymentLabel: DEPLOYMENT_LABEL,
        revision: REVISION,
        sourceCaptureStartAt: SOURCE_CAPTURE_START_AT,
        enabledUntil: RESET_NOW + DAY_MS,
        nightlyCronEnabled: false,
      },
      priorRuns: { count: 1, truncated: false },
      sourceEventsBeforeCapture: { count: 1, truncated: false },
    });
    const reset = await t.mutation(resetStartRef, resetArgs());
    const duringReset = await getOverview(t, "2026-05-11");
    expect(duringReset).toMatchObject({ metadata: { availability: "unavailable" }, current: null });

    await finishScheduledAnalytics(t);
    const baseline = await t.run(async (ctx) => {
      const resetRun = await ctx.db.get(reset.runId);
      const organization = await ctx.db
        .query("analyticsOrganizations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", operational.organizationId))
        .unique();
      const shop = await ctx.db
        .query("analyticsShops")
        .withIndex("by_shopId", (q) => q.eq("shopId", operational.shopId))
        .unique();
      const sourceEvents = await ctx.db.query("analyticsSourceEvents").collect();
      const runs = await ctx.db.query("analyticsRuns").collect();
      const operationalOrganization = await ctx.db.get(operational.organizationId);
      const operationalShop = await ctx.db.get(operational.shopId);
      return { resetRun, organization, shop, sourceEvents, runs, operationalOrganization, operationalShop };
    });
    expect(baseline.resetRun).toMatchObject({
      status: "complete",
      kind: "reset",
      dataStartDate: RESET_DATA_START_DATE,
      dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
    });
    expect(baseline.organization?.registeredAt).toBe(registeredAt);
    expect(Math.floor(baseline.shop?.registeredAt ?? 0)).toBe(registeredAt);
    expect(baseline.shop?.registeredAt).toBeLessThan(baseline.resetRun?.dataStartAt ?? 0);
    expect(baseline.sourceEvents.map((event) => event.eventKey)).toEqual(["scenario:after-capture"]);
    expect(baseline.runs.map((run) => run._id)).toEqual([reset.runId]);
    expect(baseline.operationalOrganization).not.toBeNull();
    expect(baseline.operationalShop).not.toBeNull();

    const beforeFirstDaily = await getOverview(t, RESET_DATE);
    expect(beforeFirstDaily).toMatchObject({ metadata: { availability: "unavailable" }, current: null });

    vi.setSystemTime(INITIAL_PARTIAL_AT);
    const staffId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("staffs", {
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        name: "partial境界追加スタッフ",
        email: "partial-catch-up@example.com",
        emailNormalized: "partial-catch-up@example.com",
        isDeleted: false,
      });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: "scenario:partial:staff-active",
        eventType: "staffMembership.changed",
        occurredAt: INITIAL_PARTIAL_AT,
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        subjectId: id,
        payload: {
          kind: "staffMembership",
          staffId: id,
          status: "active",
          isShiftTarget: true,
          validFrom: INITIAL_PARTIAL_AT,
          lineLinked: false,
          lineFollowing: false,
        },
      });
      return id;
    });
    await t.mutation(startFirstDateRef, { targetDate: RESET_DATE });
    const duringDaily = await getOverview(t, RESET_DATE);
    expect(duringDaily).toMatchObject({ metadata: { availability: "unavailable" }, current: null });

    await finishScheduledAnalytics(t);
    const published = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "complete").eq("targetDate", RESET_DATE),
        )
        .unique();
      if (!run) throw new Error("daily run was not published");
      const [service, organization, shop] = await Promise.all([
        ctx.db
          .query("analyticsDailyServiceKpis")
          .withIndex("by_runId", (q) => q.eq("runId", run._id))
          .unique(),
        ctx.db
          .query("analyticsDailyOrganizationKpis")
          .withIndex("by_runId", (q) => q.eq("runId", run._id))
          .unique(),
        ctx.db
          .query("analyticsDailyShopKpis")
          .withIndex("by_runId", (q) => q.eq("runId", run._id))
          .unique(),
      ]);
      const allDailyDates = await ctx.db.query("analyticsDailyServiceKpis").collect();
      return { run, service, organization, shop, allDailyDates };
    });
    expect(published.service?.runId).toBe(published.run._id);
    if (!published.service) throw new Error("partial service row was not published");
    expect(published.organization?.runId).toBe(published.run._id);
    expect(published.shop?.runId).toBe(published.run._id);
    expect(published.run).toMatchObject({
      runKey: `daily:${RESET_DATE}`,
      dataStartDate: RESET_DATE,
      dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
      targetDate: RESET_DATE,
      inputFromAt: SOURCE_CAPTURE_START_AT,
      cutoffAt: INITIAL_PARTIAL_AT,
    });
    expect(published.shop).toMatchObject({
      kpiEligible: false,
      completeness: "complete",
      milestoneDates: { registeredAt: baseline.shop?.registeredAt },
    });
    expect(published.shop?.milestoneDates.firstRecruitmentAt).toBeUndefined();
    expect(published.service).toMatchObject({
      shopCount: 1,
      kpiEligibleShopCount: 0,
      milestoneCounts: { registered: 0 },
    });
    expect(published.allDailyDates.map((row) => row.snapshotDate)).toEqual([RESET_DATE]);

    const overview = await getOverview(t, RESET_DATE);
    expect(overview).toMatchObject({
      metadata: {
        availability: "available",
        asOf: INITIAL_PARTIAL_AT,
        dataStartDate: RESET_DATE,
        latestCompleteSnapshotDate: RESET_DATE,
        warnings: [],
      },
      current: { counts: { organizationCount: 1, shopCount: 1, kpiEligibleShopCount: 0 } },
    });

    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "true");
    vi.setSystemTime(new Date("2026-05-11T03:00:00+09:00"));
    await t.mutation(schedulePreviousDayRef, {});
    await finishScheduledAnalytics(t);
    const afterSameDateCron = await t.run(async (ctx) => ({
      dailyRuns: (await ctx.db.query("analyticsRuns").collect()).filter((run) => run.kind === "daily"),
      serviceRows: await ctx.db.query("analyticsDailyServiceKpis").collect(),
    }));
    expect(afterSameDateCron).toEqual({ dailyRuns: [published.run], serviceRows: [published.service] });

    vi.setSystemTime(new Date("2026-05-12T03:00:00+09:00"));
    await t.mutation(schedulePreviousDayRef, {});
    await finishScheduledAnalytics(t);
    const caughtUp = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "complete").eq("targetDate", RESET_DATA_START_DATE),
        )
        .unique();
      if (!run) throw new Error("full daily run was not published");
      const memberships = await ctx.db
        .query("analyticsMemberships")
        .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", `staff:${staffId}`))
        .collect();
      const service = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_runId", (q) => q.eq("runId", run._id))
        .unique();
      return { run, memberships, service };
    });
    expect(caughtUp.run).toMatchObject({
      runKey: `daily:${RESET_DATA_START_DATE}`,
      dataStartDate: RESET_DATE,
      dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
      targetDate: RESET_DATA_START_DATE,
      inputFromAt: INITIAL_PARTIAL_AT,
      cutoffAt: jstDayRangeMs(RESET_DATA_START_DATE).endMs,
    });
    expect(caughtUp.memberships).toHaveLength(1);
    expect(caughtUp.service).toMatchObject({ staffMembershipCount: 1, shiftTargetCount: 1 });

    const fullRange = await getOverview(t, RESET_DATA_START_DATE, RESET_DATA_START_DATE, {
      from: RESET_DATE,
      to: RESET_DATE,
    });
    expect(fullRange).toMatchObject({
      metadata: {
        availability: "available",
        dataStartDate: RESET_DATE,
        latestCompleteSnapshotDate: RESET_DATA_START_DATE,
      },
      current: { counts: { staffMembershipCount: 1, shiftTargetCount: 1 } },
      comparison: { counts: { staffMembershipCount: 0, shiftTargetCount: 0 } },
    });
  });

  it("初回partialを実行しない場合はresetのdataStartDateを日末cutoffの初回fullとして公開する", async () => {
    const t = convexTest(schema, modules);
    const resetRunId = await t.run(
      async (ctx) =>
        await ctx.db.insert("analyticsRuns", {
          runKey: "reset:initial-full-fallback",
          kind: "reset",
          status: "complete",
          calculationVersion: ANALYTICS_CALCULATION_VERSION,
          dataStartDate: RESET_DATA_START_DATE,
          dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
          inputFromAt: SOURCE_CAPTURE_START_AT,
          cutoffAt: RESET_NOW,
          sourceCaptureStartAt: SOURCE_CAPTURE_START_AT,
          resetWatermarkAt: RESET_NOW,
          stage: "resetVerify",
          stepVersion: 1,
          startedAt: RESET_NOW,
          terminalAt: RESET_NOW + 1,
          updatedAt: RESET_NOW + 1,
        }),
    );

    vi.setSystemTime(new Date("2026-05-12T03:00:00+09:00"));
    await t.mutation(startFirstDateRef, { targetDate: RESET_DATA_START_DATE });
    expect(await getOverview(t, RESET_DATA_START_DATE)).toMatchObject({
      metadata: { availability: "unavailable" },
      current: null,
    });
    await finishScheduledAnalytics(t);

    const published = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "complete").eq("targetDate", RESET_DATA_START_DATE),
        )
        .unique();
      return { reset: await ctx.db.get(resetRunId), run };
    });
    expect(published.reset).toMatchObject({
      dataStartDate: RESET_DATA_START_DATE,
      dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
    });
    expect(published.run).toMatchObject({
      runKey: `daily:${RESET_DATA_START_DATE}`,
      dataStartDate: RESET_DATA_START_DATE,
      dataStartAt: jstDayRangeMs(RESET_DATA_START_DATE).startMs,
      targetDate: RESET_DATA_START_DATE,
      inputFromAt: SOURCE_CAPTURE_START_AT,
      cutoffAt: jstDayRangeMs(RESET_DATA_START_DATE).endMs,
    });
    expect(await getOverview(t, RESET_DATA_START_DATE)).toMatchObject({
      metadata: {
        availability: "available",
        dataStartDate: RESET_DATA_START_DATE,
        latestCompleteSnapshotDate: RESET_DATA_START_DATE,
      },
      current: { counts: { organizationCount: 0, shopCount: 0 } },
    });
  });

  it("D1失敗を永久欠損にし、D2は最後のcomplete cutoffからsource eventを再適用して公開する", async () => {
    const t = convexTest(schema, modules);
    const d1 = "2026-05-09";
    const d2 = "2026-05-10";
    const d1RunAt = new Date("2026-05-10T03:00:00+09:00").getTime();
    const d2RunAt = new Date("2026-05-11T03:00:00+09:00").getTime();
    vi.setSystemTime(d1RunAt);
    const seeded = await t.run(async (ctx) => {
      const operational = await seedOrganizationManagerShop(ctx, {
        subject: "analytics_failed_day_gap",
        shopName: "欠損日検証店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        name: "欠損日検証スタッフ",
        email: "gap@example.com",
        emailNormalized: "gap@example.com",
        isDeleted: false,
      });
      const resetRunId = await ctx.db.insert("analyticsRuns", {
        runKey: "reset:scenario-baseline",
        kind: "reset",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: d1,
        dataStartAt: jstDayRangeMs(d1).startMs,
        inputFromAt: SOURCE_CAPTURE_START_AT,
        cutoffAt: SOURCE_CAPTURE_START_AT,
        sourceCaptureStartAt: SOURCE_CAPTURE_START_AT,
        stage: "resetVerify",
        stepVersion: 1,
        startedAt: d1RunAt - DAY_MS,
        terminalAt: d1RunAt - DAY_MS + 1,
        updatedAt: d1RunAt - DAY_MS + 1,
      });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId: operational.organizationId,
        displayName: "欠損日検証事業者",
        registeredAt: jstDayRangeMs(d1).startMs - DAY_MS,
        updatedAt: jstDayRangeMs(d1).startMs - DAY_MS,
      });
      const analyticsShopId = await ctx.db.insert("analyticsShops", {
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        displayName: "欠損日検証店舗",
        registeredAt: jstDayRangeMs(d1).startMs - DAY_MS,
        statusEffectiveAt: jstDayRangeMs(d1).startMs - DAY_MS,
        cadenceConfidence: "insufficientData",
        // D1 cutoff以後のfactを意図的に置き、shops stageをtransactionごと失敗させる。
        updatedAt: jstDayRangeMs(d1).endMs,
      });
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: "scenario:failed-day:staff-active",
        eventType: "staffMembership.changed",
        occurredAt: SOURCE_CAPTURE_START_AT + 1_000,
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        subjectId: staffId,
        payload: {
          kind: "staffMembership",
          staffId,
          status: "active",
          isShiftTarget: true,
          validFrom: SOURCE_CAPTURE_START_AT + 1_000,
          lineLinked: false,
          lineFollowing: false,
        },
      });
      return { ...operational, staffId, resetRunId, analyticsShopId };
    });

    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "true");
    await t.mutation(schedulePreviousDayRef, {});
    await finishScheduledAnalytics(t);
    const failed = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "failed").eq("targetDate", d1),
        )
        .unique();
      const rows = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", d1))
        .collect();
      const runs = await ctx.db.query("analyticsRuns").collect();
      return { run, rows, runs };
    });
    expect(failed.run, JSON.stringify(failed.runs)).not.toBeNull();
    expect(failed.rows).toEqual([]);

    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.analyticsShopId, { updatedAt: jstDayRangeMs(d1).endMs - 1 });
    });
    vi.setSystemTime(d2RunAt);
    await t.mutation(schedulePreviousDayRef, {});
    await finishScheduledAnalytics(t);

    const recovered = await t.run(async (ctx) => {
      const run = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "complete").eq("targetDate", d2),
        )
        .unique();
      const memberships = await ctx.db
        .query("analyticsMemberships")
        .withIndex("by_membershipKey_and_validFrom", (q) => q.eq("membershipKey", `staff:${seeded.staffId}`))
        .collect();
      const failedRuns = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) =>
          q.eq("kind", "daily").eq("status", "failed").eq("targetDate", d1),
        )
        .collect();
      const d1Rows = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_snapshotDate", (q) => q.eq("snapshotDate", d1))
        .collect();
      return { run, memberships, failedRuns, d1Rows };
    });
    expect(recovered.run).toMatchObject({
      status: "complete",
      targetDate: d2,
      inputFromAt: SOURCE_CAPTURE_START_AT,
    });
    expect(recovered.memberships).toHaveLength(1);
    expect(recovered.failedRuns).toHaveLength(1);
    expect(recovered.d1Rows).toEqual([]);

    const gap = await getOverview(t, d1, d2);
    expect(gap).toMatchObject({ metadata: { availability: "unavailable" }, current: null });
    expect(gap?.metadata.warnings).toContain("選択期間に欠損日があります（1日、最初: 2026-05-09）");
    const d2Only = await getOverview(t, d2);
    expect(d2Only).toMatchObject({
      metadata: { availability: "available", latestCompleteSnapshotDate: d2 },
      current: {
        counts: {
          organizationCount: 1,
          shopCount: 1,
          staffMembershipCount: 1,
          shiftTargetCount: 1,
        },
      },
    });
  });

  it("週次maintenanceは期限前にopportunityのPIIをredactし、後続dailyに必要な最新resetを保持する", async () => {
    const t = convexTest(schema, modules);
    const maintenanceNow = new Date("2032-05-10T04:00:00+09:00").getTime();
    const dailyDate = "2032-05-09";
    const dailyStartAt = jstDayRangeMs(dailyDate).startMs;
    const submitDeadlineAt = dailyStartAt - 2 * 60 * 60 * 1_000;
    const confirmedAt = dailyStartAt - 60 * 60 * 1_000;
    const seeded = await t.run(async (ctx) => {
      const operational = await seedOrganizationManagerShop(ctx, {
        subject: "analytics_maintenance_retention",
        shopName: "保持境界検証店舗",
      });
      const staffId = await ctx.db.insert("staffs", {
        organizationId: operational.organizationId,
        organizationPersonId: operational.personId,
        shopId: operational.shopId,
        name: "保持境界スタッフ",
        email: "retention@example.com",
        emailNormalized: "retention@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: operational.shopId,
        periodStart: dailyDate,
        periodEnd: "2032-05-15",
        deadline: "2032-05-08",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const resetRunId = await ctx.db.insert("analyticsRuns", {
        runKey: "reset:latest-must-survive",
        kind: "reset",
        status: "complete",
        calculationVersion: ANALYTICS_CALCULATION_VERSION,
        dataStartDate: "2026-05-09",
        dataStartAt: SOURCE_CAPTURE_START_AT,
        inputFromAt: SOURCE_CAPTURE_START_AT,
        cutoffAt: SOURCE_CAPTURE_START_AT,
        sourceCaptureStartAt: SOURCE_CAPTURE_START_AT,
        stage: "resetVerify",
        stepVersion: 1,
        startedAt: RESET_NOW,
        terminalAt: RESET_NOW + 1,
        updatedAt: RESET_NOW + 1,
      });
      await ctx.db.insert("analyticsOrganizations", {
        organizationId: operational.organizationId,
        displayName: "保持境界検証事業者",
        registeredAt: RESET_NOW,
        updatedAt: RESET_NOW,
      });
      await ctx.db.insert("analyticsShops", {
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        displayName: "保持境界検証店舗",
        registeredAt: RESET_NOW,
        statusEffectiveAt: RESET_NOW,
        firstRecruitmentAt: dailyStartAt - DAY_MS,
        firstConfirmedRecruitmentId: recruitmentId,
        firstConfirmedAt: confirmedAt,
        latestActivityAt: confirmedAt,
        cadenceConfidence: "insufficientData",
        updatedAt: confirmedAt,
      });
      await ctx.db.insert("analyticsPeople", {
        organizationId: operational.organizationId,
        organizationPersonId: operational.personId,
        firstObservedAt: RESET_NOW,
        updatedAt: RESET_NOW,
      });
      await ctx.db.insert("analyticsShiftCycles", {
        recruitmentId,
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        createdAt: dailyStartAt - DAY_MS,
        submitDeadlineAt,
        periodStart: dailyDate,
        periodEnd: "2032-05-15",
        confirmedAt,
        closedAt: confirmedAt,
        targetAtDeadline: 1,
        submittedAtDeadline: 0,
        targetAtClose: 1,
        submittedAtClose: 0,
        notificationSentCount: 0,
        notificationFailedCount: 0,
        reminderSentCount: 0,
        confirmedBeforeStart: true,
        completeness: "complete",
        finalizedAt: confirmedAt,
        updatedAt: confirmedAt,
      });
      const opportunityId = await ctx.db.insert("analyticsShiftCycleOpportunities", {
        recruitmentId,
        organizationId: operational.organizationId,
        shopId: operational.shopId,
        staffId,
        organizationPersonId: operational.personId,
        targetedAtDeadline: true,
        targetedAtClose: true,
        reminderCount: 0,
        completeness: "complete",
        identityState: "active",
        expiresAt: maintenanceNow + 5 * DAY_MS,
      });
      return { resetRunId, opportunityId };
    });

    vi.setSystemTime(maintenanceNow);
    vi.stubEnv("ANALYTICS_NIGHTLY_CRON_ENABLED", "true");
    await t.mutation(schedulePreviousDayRef, {});
    await finishScheduledAnalytics(t);
    await t.mutation(scheduleWeeklyMaintenanceRef, {});
    await finishScheduledAnalytics(t);

    const result = await t.run(async (ctx) => {
      const maintenance = await ctx.db
        .query("analyticsRuns")
        .withIndex("by_kind_and_status_and_targetDate", (q) => q.eq("kind", "maintenance").eq("status", "complete"))
        .unique();
      return {
        maintenance,
        runs: await ctx.db.query("analyticsRuns").collect(),
        reset: await ctx.db.get(seeded.resetRunId),
        opportunity: await ctx.db.get(seeded.opportunityId),
      };
    });
    expect(result.maintenance, JSON.stringify(result.runs)).not.toBeNull();
    expect(result.reset).toMatchObject({ status: "complete", runKey: "reset:latest-must-survive" });
    expect(result.opportunity).toMatchObject({ identityState: "redacted" });
    expect(result.opportunity?.staffId).toBeUndefined();
    expect(result.opportunity?.organizationPersonId).toBeUndefined();
  });
});
