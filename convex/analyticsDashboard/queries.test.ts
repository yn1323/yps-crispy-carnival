import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { jstDayRangeMs } from "../_lib/dateFormat";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_CALCULATION_VERSION } from "../analytics/model";

const PAST_DATE = "2026-06-01";
const LATEST_DATE = "2026-06-02";
const PAST_DAY = jstDayRangeMs(PAST_DATE);
const LATEST_DAY = jstDayRangeMs(LATEST_DATE);
const PAST_KPI_COMPUTED_AT = PAST_DAY.endMs + 100;
const LATEST_KPI_COMPUTED_AT = LATEST_DAY.endMs + 200;
const DISPLAY_KPI_WINS_COMPUTED_AT = LATEST_KPI_COMPUTED_AT + 1_000;
const FILTERED_OUT_KPI_COMPUTED_AT = LATEST_KPI_COMPUTED_AT + 10_000;

const baseRequest = {
  from: PAST_DATE,
  to: PAST_DATE,
  cursor: null,
  limit: 50,
  sort: "registeredAt",
  direction: "asc",
  organizationId: null,
  plan: null,
  shopSize: null,
  cohort: null,
  cadence: null,
  lineUsage: null,
  health: null,
  completeness: null,
} as const;

async function insertCompleteRun(ctx: MutationCtx, targetDate: string) {
  const day = jstDayRangeMs(targetDate);
  const startedAt = day.endMs + 10;
  return await ctx.db.insert("analyticsRuns", {
    runKey: `daily:${targetDate}:dashboard-function-test`,
    kind: "daily",
    status: "complete",
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    dataStartDate: PAST_DATE,
    dataStartAt: PAST_DAY.startMs,
    targetDate,
    inputFromAt: PAST_DAY.startMs,
    cutoffAt: day.endMs,
    stage: "publish",
    stepVersion: 6,
    startedAt,
    terminalAt: startedAt + 1,
    updatedAt: startedAt + 1,
  });
}

async function insertOrganization(ctx: MutationCtx) {
  const organizationId = await ctx.db.insert("organizations", {
    name: "利用候補テスト組織",
    isDeleted: false,
    createdAt: PAST_DAY.startMs - 2_000,
    updatedAt: PAST_DAY.startMs - 1_000,
  });
  await ctx.db.insert("analyticsOrganizations", {
    organizationId,
    displayName: "利用候補テスト組織",
    registeredAt: PAST_DAY.startMs - 2_000,
    currentPlan: "free",
    updatedAt: LATEST_DAY.endMs,
  });
  return organizationId;
}

async function insertShop(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    displayName: string;
    registeredAt: number;
  },
) {
  const shopId = await ctx.db.insert("shops", {
    organizationId: args.organizationId,
    operatingStatus: "active",
    name: args.displayName,
    regularClosedDays: [],
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    isDeleted: false,
  });
  await ctx.db.insert("analyticsShops", {
    organizationId: args.organizationId,
    shopId,
    displayName: args.displayName,
    registeredAt: args.registeredAt,
    currentPlan: "free",
    cadenceConfidence: "insufficientData",
    updatedAt: LATEST_DAY.endMs,
  });
  return shopId;
}

async function insertShopKpi(
  ctx: MutationCtx,
  args: {
    runId: Id<"analyticsRuns">;
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    snapshotDate: string;
    computedAt: number;
    nextCyclePeriodStart?: string;
    shiftTargetCount?: number;
    staffMembershipCount?: number;
  },
) {
  const shiftTargetCount = args.shiftTargetCount ?? 0;
  const staffMembershipCount = args.staffMembershipCount ?? 0;
  await ctx.db.insert("analyticsDailyShopKpis", {
    runId: args.runId,
    organizationId: args.organizationId,
    shopId: args.shopId,
    snapshotDate: args.snapshotDate,
    kpiEligible: true,
    staffMembershipCount,
    shiftTargetCount,
    uniquePersonCount: staffMembershipCount,
    unlinkedStaffCount: 0,
    managerMembershipCount: 0,
    managerStaffCount: 0,
    lineLinkedCount: 0,
    lineFollowingCount: 0,
    hasRecentActivity: false,
    cycleCount: 0,
    confirmedCycleCount: 0,
    confirmedBeforeStartCycleCount: 0,
    ...(args.nextCyclePeriodStart === undefined ? {} : { nextCyclePeriodStart: args.nextCyclePeriodStart }),
    issueHealthSignalCount: 0,
    milestoneDates: { registeredAt: PAST_DAY.startMs - 1_000 },
    healthSignals: [],
    cadence: { kind: "insufficientData" },
    northStar: { numerator: 0, denominator: 0 },
    deadlineSubmission: { numerator: 0, denominator: 0 },
    finalSubmission: { numerator: 0, denominator: 0 },
    cumulativeDeadlineSubmission: { numerator: 0, denominator: 0 },
    cumulativeFinalSubmission: { numerator: 0, denominator: 0 },
    cumulativeNotificationSentCount: 0,
    cumulativeNotificationFailedCount: 0,
    completeness: "complete",
    computedAt: args.computedAt,
  });
}

async function seedUsageClasses(ctx: MutationCtx) {
  const organizationId = await insertOrganization(ctx);
  const pastRunId = await insertCompleteRun(ctx, PAST_DATE);
  const latestRunId = await insertCompleteRun(ctx, LATEST_DATE);
  const highShopId = await insertShop(ctx, {
    organizationId,
    displayName: "可能性が高い店舗",
    registeredAt: PAST_DAY.startMs + 100,
  });
  const possibleShopId = await insertShop(ctx, {
    organizationId,
    displayName: "可能性あり店舗",
    registeredAt: PAST_DAY.startMs + 200,
  });
  const unknownShopId = await insertShop(ctx, {
    organizationId,
    displayName: "状態不明店舗",
    registeredAt: PAST_DAY.startMs + 300,
  });

  for (const shopId of [highShopId, possibleShopId, unknownShopId]) {
    await insertShopKpi(ctx, {
      runId: pastRunId,
      organizationId,
      shopId,
      snapshotDate: PAST_DATE,
      computedAt: PAST_KPI_COMPUTED_AT,
    });
  }
  await insertShopKpi(ctx, {
    runId: latestRunId,
    organizationId,
    shopId: highShopId,
    snapshotDate: LATEST_DATE,
    computedAt: LATEST_KPI_COMPUTED_AT,
    nextCyclePeriodStart: "2026-06-10",
  });
  await insertShopKpi(ctx, {
    runId: latestRunId,
    organizationId,
    shopId: possibleShopId,
    snapshotDate: LATEST_DATE,
    computedAt: LATEST_KPI_COMPUTED_AT,
    staffMembershipCount: 1,
  });
  await insertShopKpi(ctx, {
    runId: latestRunId,
    organizationId,
    shopId: unknownShopId,
    snapshotDate: LATEST_DATE,
    computedAt: LATEST_KPI_COMPUTED_AT,
  });
}

describe("Analytics Dashboard店舗一覧の利用候補", () => {
  it("USAGE-QUERY-01 過去期間を表示しても利用候補は最新complete runで判定する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const organizationId = await insertOrganization(ctx);
      const pastRunId = await insertCompleteRun(ctx, PAST_DATE);
      const latestRunId = await insertCompleteRun(ctx, LATEST_DATE);
      const shopId = await insertShop(ctx, {
        organizationId,
        displayName: "最新run利用店舗",
        registeredAt: PAST_DAY.startMs,
      });
      const filteredOutShopId = await insertShop(ctx, {
        organizationId,
        displayName: "filter対象外店舗",
        registeredAt: PAST_DAY.startMs + 1,
      });
      await insertShopKpi(ctx, {
        runId: pastRunId,
        organizationId,
        shopId,
        snapshotDate: PAST_DATE,
        computedAt: PAST_KPI_COMPUTED_AT,
      });
      await insertShopKpi(ctx, {
        runId: latestRunId,
        organizationId,
        shopId,
        snapshotDate: LATEST_DATE,
        computedAt: LATEST_KPI_COMPUTED_AT,
        nextCyclePeriodStart: "2026-06-10",
      });
      await insertShopKpi(ctx, {
        runId: pastRunId,
        organizationId,
        shopId: filteredOutShopId,
        snapshotDate: PAST_DATE,
        computedAt: FILTERED_OUT_KPI_COMPUTED_AT,
      });
      await insertShopKpi(ctx, {
        runId: latestRunId,
        organizationId,
        shopId: filteredOutShopId,
        snapshotDate: LATEST_DATE,
        computedAt: FILTERED_OUT_KPI_COMPUTED_AT,
      });
    });

    const response = await t.query(internal.analyticsDashboard.queries.getShops, {
      ...baseRequest,
      usage: "high",
    });

    expect(response).not.toBeNull();
    if (!response) throw new Error("店舗一覧がnullを返しました");
    expect(response.rows).toHaveLength(1);
    expect(response.rows[0]).toMatchObject({
      displayName: "最新run利用店舗",
      usageLikelihood: "high",
      usageReasons: ["hasUpcomingCycle"],
      kpis: {
        snapshotDate: PAST_DATE,
        nextCyclePeriodStart: null,
        computedAt: PAST_KPI_COMPUTED_AT,
      },
    });
    expect(response.metadata).toMatchObject({
      asOf: LATEST_DAY.endMs,
      latestCompleteSnapshotDate: LATEST_DATE,
      computedAt: LATEST_KPI_COMPUTED_AT,
    });
  });

  it("USAGE-QUERY-01 metadataは表示期間KPIのcomputedAtが新しければ表示側を採用する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const organizationId = await insertOrganization(ctx);
      const pastRunId = await insertCompleteRun(ctx, PAST_DATE);
      const latestRunId = await insertCompleteRun(ctx, LATEST_DATE);
      const shopId = await insertShop(ctx, {
        organizationId,
        displayName: "表示KPIが新しい店舗",
        registeredAt: PAST_DAY.startMs,
      });
      await insertShopKpi(ctx, {
        runId: pastRunId,
        organizationId,
        shopId,
        snapshotDate: PAST_DATE,
        computedAt: DISPLAY_KPI_WINS_COMPUTED_AT,
      });
      await insertShopKpi(ctx, {
        runId: latestRunId,
        organizationId,
        shopId,
        snapshotDate: LATEST_DATE,
        computedAt: LATEST_KPI_COMPUTED_AT,
        nextCyclePeriodStart: "2026-06-10",
      });
    });

    const response = await t.query(internal.analyticsDashboard.queries.getShops, {
      ...baseRequest,
      usage: "high",
    });

    expect(response?.rows.map((row) => row.displayName)).toEqual(["表示KPIが新しい店舗"]);
    expect(response?.metadata.computedAt).toBe(DISPLAY_KPI_WINS_COMPUTED_AT);
  });

  it("USAGE-QUERY-02 利用の可能性filterをgetShopsの返却集合へ適用する", async () => {
    const t = convexTest(schema, modules);
    await t.run(seedUsageClasses);

    const cases = [
      ["candidate", ["可能性が高い店舗", "可能性あり店舗"]],
      ["high", ["可能性が高い店舗"]],
      ["possible", ["可能性あり店舗"]],
      ["unknown", ["状態不明店舗"]],
    ] as const;

    for (const [usage, expectedNames] of cases) {
      const response = await t.query(internal.analyticsDashboard.queries.getShops, {
        ...baseRequest,
        usage,
      });
      expect(response).not.toBeNull();
      expect(response?.rows.map((row) => row.displayName)).toEqual(expectedNames);
    }
  });

  it("USAGE-PAGE-01 一致0件のraw pageでも続きのcursorとwarningを維持する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const organizationId = await insertOrganization(ctx);
      const pastRunId = await insertCompleteRun(ctx, PAST_DATE);
      const latestRunId = await insertCompleteRun(ctx, LATEST_DATE);
      const unknownShopId = await insertShop(ctx, {
        organizationId,
        displayName: "先頭の状態不明店舗",
        registeredAt: PAST_DAY.startMs + 100,
      });
      const highShopId = await insertShop(ctx, {
        organizationId,
        displayName: "次ページの候補店舗",
        registeredAt: PAST_DAY.startMs + 200,
      });
      for (const shopId of [unknownShopId, highShopId]) {
        await insertShopKpi(ctx, {
          runId: pastRunId,
          organizationId,
          shopId,
          snapshotDate: PAST_DATE,
          computedAt: PAST_KPI_COMPUTED_AT,
        });
      }
      await insertShopKpi(ctx, {
        runId: latestRunId,
        organizationId,
        shopId: unknownShopId,
        snapshotDate: LATEST_DATE,
        computedAt: LATEST_KPI_COMPUTED_AT,
      });
      await insertShopKpi(ctx, {
        runId: latestRunId,
        organizationId,
        shopId: highShopId,
        snapshotDate: LATEST_DATE,
        computedAt: LATEST_KPI_COMPUTED_AT,
        nextCyclePeriodStart: "2026-06-10",
      });
    });

    const firstPage = await t.query(internal.analyticsDashboard.queries.getShops, {
      ...baseRequest,
      limit: 1,
      usage: "high",
    });

    expect(firstPage).not.toBeNull();
    if (!firstPage) throw new Error("店舗一覧がnullを返しました");
    expect(firstPage.rows).toEqual([]);
    expect(firstPage.metadata.pageInfo).toMatchObject({
      cursor: null,
      isDone: false,
      pageSize: 1,
      returnedCount: 0,
    });
    expect(firstPage.metadata.pageInfo.continueCursor).not.toBeNull();
    expect(firstPage.metadata.warnings).toContain(
      "filtered_page_incomplete: 条件に一致する候補の確認は次のページへ続きます",
    );

    const continueCursor = firstPage.metadata.pageInfo.continueCursor;
    if (!continueCursor) throw new Error("続きのcursorがありません");
    const secondPage = await t.query(internal.analyticsDashboard.queries.getShops, {
      ...baseRequest,
      cursor: continueCursor,
      limit: 1,
      usage: "high",
    });
    expect(secondPage?.rows.map((row) => row.displayName)).toEqual(["次ページの候補店舗"]);
  });

  it("USAGE-COMPAT-01 usage未指定を表すnullでは従来どおり全店舗を返す", async () => {
    const t = convexTest(schema, modules);
    await t.run(seedUsageClasses);

    const response = await t.query(internal.analyticsDashboard.queries.getShops, {
      ...baseRequest,
      usage: null,
    });

    expect(response).not.toBeNull();
    expect(response?.rows.map((row) => row.displayName)).toEqual([
      "可能性が高い店舗",
      "可能性あり店舗",
      "状態不明店舗",
    ]);
  });
});
