import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { SCENARIO_NOW } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { ANALYTICS_PIPELINE_KEY, ANALYTICS_SCHEMA_VERSION } from "./model";

const GENERATION = "manager-membership-bootstrap";

async function runAnalyticsJobToTerminal(
  t: TestConvex<typeof schema>,
  jobKey: string,
  options: { maxSteps?: number; stepMs?: number } = {},
) {
  let job = null;
  for (let step = 0; step < (options.maxSteps ?? 120); step += 1) {
    vi.advanceTimersByTime(options.stepMs ?? 0);
    await t.finishInProgressScheduledFunctions();
    job = await t.run((ctx) =>
      ctx.db
        .query("analyticsAggregationJobs")
        .withIndex("by_jobKey", (q) => q.eq("jobKey", jobKey))
        .unique(),
    );
    if (job?.status === "completed" || job?.status === "failed") break;
  }
  return job;
}

describe("Analytics bootstrap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初回bootstrapでactive管理者のmembershipを一意に作成する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_manager_bootstrap",
        shopName: "Analytics検証店舗",
      }),
    );

    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);
    expect(bootstrap?.status).toBe("completed");

    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const memberships = await t.run((ctx) =>
      ctx.db
        .query("analyticsMemberships")
        .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
          q.eq("generation", GENERATION).eq("membershipKey", `manager:${seeded.organizationId}:${seeded.personId}`),
        )
        .collect(),
    );

    expect(
      memberships.map((membership) => ({
        organizationId: membership.organizationId,
        organizationPersonId: membership.organizationPersonId,
        role: membership.role,
        validTo: membership.validTo,
      })),
    ).toEqual([
      {
        organizationId: seeded.organizationId,
        organizationPersonId: seeded.personId,
        role: "manager",
        validTo: undefined,
      },
    ]);
  });

  it("初回提出より先に初回確定した店舗でもbootstrapを完了する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_confirmation_before_submission",
        shopName: "提出前確定店舗",
      }),
    );

    vi.setSystemTime(SCENARIO_NOW + 1_000);
    const { recruitmentId, staffId } = await t.run(async (ctx) => {
      const staffId = await ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "提出スタッフ",
        email: "submission@example.com",
        isDeleted: false,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-05-11",
        periodEnd: "2026-05-17",
        deadline: "2026-05-09",
        shopClosedDates: [],
        status: "confirmed",
        confirmedAt: SCENARIO_NOW + 2_000,
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return { recruitmentId, staffId };
    });
    vi.setSystemTime(SCENARIO_NOW + 3_000);
    await t.run((ctx) =>
      ctx.db.insert("shiftSubmissions", {
        recruitmentId,
        staffId,
        firstSubmittedAt: SCENARIO_NOW + 3_000,
        submittedAt: SCENARIO_NOW + 3_000,
      }),
    );

    vi.setSystemTime(SCENARIO_NOW + 4_000);
    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);

    expect(bootstrap?.status).toBe("completed");
    const shop = await t.run((ctx) =>
      ctx.db
        .query("analyticsShops")
        .withIndex("by_generation_and_shopId", (q) => q.eq("generation", GENERATION).eq("shopId", seeded.shopId))
        .unique(),
    );
    expect(shop).not.toBeNull();
    expect(shop?.firstRecruitmentAt).toBeGreaterThanOrEqual(SCENARIO_NOW + 1_000);
    expect(shop?.firstRecruitmentAt).toBeLessThan(SCENARIO_NOW + 2_000);
    expect(shop?.firstConfirmedAt).toBe(SCENARIO_NOW + 2_000);
    expect(shop?.firstSubmissionAt).toBe(SCENARIO_NOW + 3_000);
  });

  it("readOnly管理者の履歴を保持しないgenerationでもmanual invariantを完了する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_read_only_manager",
        shopName: "参照専用管理者店舗",
      }),
    );
    await t.run((ctx) => ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: SCENARIO_NOW }));

    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);
    expect(bootstrap?.status).toBe("completed");

    const memberships = await t.run((ctx) =>
      ctx.db
        .query("analyticsMemberships")
        .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
          q.eq("generation", GENERATION).eq("membershipKey", `manager:${seeded.organizationId}:${seeded.personId}`),
        )
        .collect(),
    );
    expect(memberships).toEqual([]);

    await t.mutation(internal.analytics.pipeline.checkGenerationInvariants, { generation: GENERATION });
    const invariant = await runAnalyticsJobToTerminal(t, `invariant:${GENERATION}:manual`);
    expect(invariant?.status).toBe("completed");
  });

  it("削除前の履歴がないstaffを含むgenerationでもmanual invariantを完了する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_deleted_staff_without_history",
        shopName: "削除済みスタッフ店舗",
      }),
    );
    const staffId = await t.run((ctx) =>
      ctx.db.insert("staffs", {
        organizationId: seeded.organizationId,
        shopId: seeded.shopId,
        name: "削除済みスタッフ",
        email: "deleted@example.com",
        isDeleted: true,
      }),
    );

    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);
    expect(bootstrap?.status).toBe("completed");

    const memberships = await t.run((ctx) =>
      ctx.db
        .query("analyticsMemberships")
        .withIndex("by_generation_and_membershipKey_and_validFrom", (q) =>
          q.eq("generation", GENERATION).eq("membershipKey", `staff:${staffId}`),
        )
        .collect(),
    );
    expect(memberships).toEqual([]);

    await t.mutation(internal.analytics.pipeline.checkGenerationInvariants, { generation: GENERATION });
    const invariant = await runAnalyticsJobToTerminal(t, `invariant:${GENERATION}:manual`);
    expect(invariant?.status).toBe("completed");
  });

  it("bootstrap以前のunavailable cycleを除外してbaselineをcompleteにする", async () => {
    const t = convexTest(schema, modules);
    vi.setSystemTime(SCENARIO_NOW - 60_000);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_historical_unavailable_cycle",
        shopName: "過去cycle検証店舗",
      }),
    );
    const recruitmentId = await t.run((ctx) =>
      ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-05-10",
        periodEnd: "2026-05-16",
        deadline: "2026-05-08",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      }),
    );

    vi.setSystemTime(SCENARIO_NOW);
    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);
    expect(bootstrap?.status).toBe("completed");

    const daily = await runAnalyticsJobToTerminal(t, `daily:${GENERATION}:2026-05-10`, {
      maxSteps: 240,
      stepMs: 60_000,
    });
    expect(daily?.status).toBe("completed");

    const result = await t.run(async (ctx) => {
      const cycle = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_recruitmentId", (q) =>
          q.eq("generation", GENERATION).eq("recruitmentId", recruitmentId),
        )
        .unique();
      const shop = await ctx.db
        .query("analyticsDailyShopKpis")
        .withIndex("by_generation_and_shopId_and_snapshotDate", (q) =>
          q.eq("generation", GENERATION).eq("shopId", seeded.shopId).eq("snapshotDate", "2026-05-10"),
        )
        .unique();
      const service = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", GENERATION).eq("snapshotDate", "2026-05-10"),
        )
        .unique();
      return { cycle, shop, service };
    });

    expect(result.cycle?.completeness).toBe("unavailable");
    expect(result.shop?.northStar).toEqual({ numerator: 0, denominator: 0 });
    expect(result.shop?.completeness).toBe("complete");
    expect(result.service?.completeness).toBe("complete");
    await expect(
      t.mutation(internal.analytics.pipeline.activateGeneration, {
        generation: GENERATION,
        confirmed: true,
      }),
    ).resolves.toEqual({ activeGeneration: GENERATION, previousGeneration: undefined });
  });

  it("dataStart以後のpartial cycleがあるbaselineはactivationを拒否する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "analytics_current_partial_cycle",
        shopName: "現行partial検証店舗",
      }),
    );
    vi.setSystemTime(SCENARIO_NOW + 1_000);
    const recruitmentId = await t.run((ctx) =>
      ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-05-10",
        periodEnd: "2026-05-16",
        deadline: "2026-05-08",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      }),
    );

    vi.setSystemTime(SCENARIO_NOW + 2_000);
    await t.mutation(internal.analytics.pipeline.startBootstrap, { generation: GENERATION });
    const bootstrap = await runAnalyticsJobToTerminal(t, `bootstrap:${GENERATION}`);
    expect(bootstrap?.status).toBe("completed");

    const daily = await runAnalyticsJobToTerminal(t, `daily:${GENERATION}:2026-05-10`, {
      maxSteps: 240,
      stepMs: 60_000,
    });
    expect(daily?.status).toBe("completed");

    const result = await t.run(async (ctx) => {
      const cycle = await ctx.db
        .query("analyticsShiftCycles")
        .withIndex("by_generation_and_recruitmentId", (q) =>
          q.eq("generation", GENERATION).eq("recruitmentId", recruitmentId),
        )
        .unique();
      const service = await ctx.db
        .query("analyticsDailyServiceKpis")
        .withIndex("by_generation_and_snapshotDate", (q) =>
          q.eq("generation", GENERATION).eq("snapshotDate", "2026-05-10"),
        )
        .unique();
      return { cycle, service };
    });

    expect(result.cycle?.completeness).toBe("partial");
    expect(result.service?.completeness).toBe("partial");
    await expect(
      t.mutation(internal.analytics.pipeline.activateGeneration, {
        generation: GENERATION,
        confirmed: true,
      }),
    ).rejects.toThrow("Analytics baseline snapshot is incomplete");
  });
});

describe("Analytics projection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("追随済みの空heartbeatでは分析asOfを更新しない", async () => {
    const t = convexTest(schema, modules);
    const previousProjectedAt = SCENARIO_NOW - 60_000;
    const leaseToken = "projection-heartbeat-lease";
    const jobId = await t.run(async (ctx) => {
      await ctx.db.insert("analyticsPipelineStates", {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        pipelineKey: ANALYTICS_PIPELINE_KEY,
        activeGeneration: GENERATION,
        dataStartDate: "2026-08-01",
        lastProjectedAt: previousProjectedAt,
        projectionCaughtUpAt: previousProjectedAt,
        status: "active",
        updatedAt: previousProjectedAt,
      });
      return await ctx.db.insert("analyticsAggregationJobs", {
        schemaVersion: ANALYTICS_SCHEMA_VERSION,
        jobKey: `projection:${ANALYTICS_PIPELINE_KEY}`,
        jobType: "projection",
        generation: GENERATION,
        phase: "events",
        status: "processing",
        attemptCount: 0,
        leaseToken,
        leaseUntil: SCENARIO_NOW + 60_000,
        nextRunAt: SCENARIO_NOW,
        processedCount: 0,
        updatedAt: SCENARIO_NOW,
      });
    });

    await t.mutation(internal.analytics.pipeline.processJob, { jobId, leaseToken });

    const state = await t.run(async (ctx) =>
      ctx.db
        .query("analyticsPipelineStates")
        .withIndex("by_pipelineKey", (q) => q.eq("pipelineKey", ANALYTICS_PIPELINE_KEY))
        .unique(),
    );
    expect(state?.lastProjectedAt).toBe(previousProjectedAt);
    expect(state?.projectionCaughtUpAt).toBe(SCENARIO_NOW);
  });
});
