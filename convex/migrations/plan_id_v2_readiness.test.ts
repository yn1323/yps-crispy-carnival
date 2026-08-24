import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";
import { ANALYTICS_CALCULATION_VERSION, ANALYTICS_PAYLOAD_VERSION, ANALYTICS_SCHEMA_VERSION } from "../analytics/model";

const firstPage = { cursor: null, numItems: 100 } as const;

async function insertAnalyticsReset(ctx: MutationCtx) {
  const now = 1_000;
  return await ctx.db.insert("analyticsRuns", {
    runKey: "reset:plan-ids-v2-readiness",
    kind: "reset",
    status: "complete",
    calculationVersion: ANALYTICS_CALCULATION_VERSION,
    dataStartDate: "2026-08-25",
    dataStartAt: now,
    inputFromAt: now,
    cutoffAt: now,
    sourceCaptureStartAt: now,
    resetWatermarkAt: now + 1,
    stage: "resetVerify",
    stepVersion: 1,
    startedAt: now,
    terminalAt: now + 2,
    updatedAt: now + 2,
  });
}

describe("m042 plan ID readiness", () => {
  it("preのlegacy targetを許可し、m042後のpostでcanonicalだけを許可する", async () => {
    const t = createConvexTestWithMigrations();
    await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "m042_readiness_clean", complimentary: true }));

    const pre = await t.query(internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyOrganizations, {
      phase: "pre",
      paginationOpts: firstPage,
    });
    expect(pre).toMatchObject({
      scannedCount: 1,
      isDone: true,
      totals: { legacyTarget: 1, canonicalTarget: 0, blocking: 0 },
    });

    await runMigrationToCompletion(t, internal.migrations.m042_organization_billing_plan_ids_v2.migration);

    const post = await t.query(
      internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyOrganizations,
      { phase: "post", paginationOpts: firstPage },
    );
    expect(post).toMatchObject({
      scannedCount: 1,
      isDone: true,
      totals: { legacyTarget: 0, canonicalTarget: 1, blocking: 0 },
    });
  });

  it("unexpected state、global Stripe証跡、scheduled job、未完了billing通知をboundedに停止する", async () => {
    const t = createConvexTestWithMigrations();
    await t.run(async (ctx) => {
      const stripeTarget = await seedOrganizationManagerShop(ctx, {
        subject: "m042_readiness_stripe",
        complimentary: true,
      });
      await seedOrganizationManagerShop(ctx, { subject: "m042_readiness_unexpected", plan: "free" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: stripeTarget.organizationId,
        stripeCustomerId: "cus_m042_readiness",
        livemode: false,
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.scheduler.runAfter(60_000, internal.organizationBilling.mutations.processDeadline, {
        organizationId: stripeTarget.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: 1,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "pending",
        dedupeKey: "m042-readiness-billing",
        organizationId: stripeTarget.organizationId,
        purpose: "billing",
        payload: {
          kind: "email",
          from: "from@example.com",
          to: "to@example.com",
          subject: "billing",
          html: "<p>billing</p>",
          context: "organizationBilling.readiness",
        },
        attemptCount: 0,
        nextRunAt: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    });

    const page1 = await t.query(
      internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyOrganizations,
      { phase: "pre", paginationOpts: { cursor: null, numItems: 1 } },
    );
    expect(page1).toMatchObject({ scannedCount: 1, isDone: false });
    const page2 = await t.query(
      internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyOrganizations,
      { phase: "pre", paginationOpts: { cursor: page1.continueCursor, numItems: 1 } },
    );
    expect(page2).toMatchObject({ scannedCount: 1, isDone: true });
    expect(page1.totals.legacyTarget + page2.totals.legacyTarget).toBe(1);
    expect(page1.totals.unexpectedBillingState + page2.totals.unexpectedBillingState).toBe(1);
    expect(page1.totals.stripeCustomerEvidence + page2.totals.stripeCustomerEvidence).toBe(1);
    expect(page1.totals.blocking + page2.totals.blocking).toBe(2);

    await expect(
      t.query(internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyStripeRows, {
        scope: "customers",
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({ totals: { stripeRows: 1, blocking: 1 } });
    await expect(
      t.query(internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyScheduledBillingJobs, {
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({ totals: { liveBillingJobs: 1, blocking: 1 } });
    await expect(
      t.query(internal.migrations.m042_organization_billing_plan_ids_v2_readiness.verifyBillingNotificationOutbox, {
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({ totals: { pending: 1, blocking: 1 } });
  });
});

describe("m043 analytics plan ID readiness", () => {
  it("known v1をmigrate後のpostで0にし、calculationVersion 2 reset watermarkを別に必須化する", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m043_readiness_known" });
      const sourceId = await ctx.db.insert("analyticsSourceEvents", {
        schemaVersion: 1,
        eventKey: "m043-readiness-known",
        eventType: "organization.changed",
        occurredAt: 1,
        organizationId: seeded.organizationId,
        payloadVersion: 1,
        payload: { kind: "organization", change: "updated", currentPlan: "business" },
        createdAt: 1,
      });
      const materializedId = await ctx.db.insert("analyticsOrganizations", {
        organizationId: seeded.organizationId,
        displayName: "readiness",
        registeredAt: 1,
        currentPlan: "business",
        updatedAt: 1,
      });
      return { sourceId, materializedId };
    });

    const pre = await t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifySourceEvents, {
      phase: "pre",
      paginationOpts: firstPage,
    });
    expect(pre.totals).toMatchObject({ legacyVersion: 1, business: 1, blocking: 0 });
    await expect(
      t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifyResetGeneration, {}),
    ).resolves.toMatchObject({ completedReset: false, blocking: 1 });

    await runMigrationToCompletion(t, internal.migrations.m043_analytics_plan_ids_v2.migration);
    const post = await t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifySourceEvents, {
      phase: "post",
      paginationOpts: firstPage,
    });
    expect(post.totals).toMatchObject({ legacyVersion: 0, canonicalVersion: 1, pro: 1, blocking: 0 });

    const materializedBeforeReset = await t.query(
      internal.migrations.m043_analytics_plan_ids_v2_readiness.verifyOrganizations,
      { phase: "post", paginationOpts: firstPage },
    );
    expect(materializedBeforeReset.totals).toMatchObject({ business: 1, blocking: 1 });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.materializedId, { currentPlan: "pro" });
      await insertAnalyticsReset(ctx);
    });
    await expect(
      t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifyOrganizations, {
        phase: "post",
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({ totals: { pro: 1, business: 0, blocking: 0 } });
    await expect(
      t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifyResetGeneration, {}),
    ).resolves.toMatchObject({ completedReset: true, completedResetCalculationVersion: 2, blocking: 0 });
  });

  it("unknown versionとversionに反するplanをpre/postの両方で停止する", async () => {
    const t = createConvexTestWithMigrations();
    await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m043_readiness_invalid" });
      const insert = async (schemaVersion: number, payloadVersion: number, plan: "standard" | "business") =>
        await ctx.db.insert("analyticsSourceEvents", {
          schemaVersion,
          eventKey: `m043-readiness-${schemaVersion}-${plan}`,
          eventType: "plan.changed",
          occurredAt: 1,
          organizationId: seeded.organizationId,
          payloadVersion,
          payload: { kind: "plan", plan, billingVersion: 1, effectiveAt: 1, statusDeltas: [] },
          createdAt: 1,
        });
      await insert(3, 3, "business");
      await insert(1, 1, "standard");
      await insert(ANALYTICS_SCHEMA_VERSION, ANALYTICS_PAYLOAD_VERSION, "business");
    });

    for (const phase of ["pre", "post"] as const) {
      const result = await t.query(internal.migrations.m043_analytics_plan_ids_v2_readiness.verifySourceEvents, {
        phase,
        paginationOpts: firstPage,
      });
      expect(result.totals).toMatchObject({
        unknownVersion: 1,
        legacyStandard: 1,
        canonicalBusiness: 1,
      });
      expect(result.totals.blocking).toBe(phase === "pre" ? 3 : 4);
    }
  });
});

describe("m044 dashboard announcement plan ID readiness", () => {
  it("preでは移行可能なlegacyだけを許可し、postでは残存legacyと各曖昧shapeを分類して停止する", async () => {
    const t = createConvexTestWithMigrations();
    await t.run(async (ctx) => {
      const base = {
        title: "readiness",
        bodyHtml: "<p>readiness</p>",
        displayDate: "2026-08-25",
        isPublished: true,
        isDeleted: false,
      };
      await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: "pro,business" });
      await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: "standard" });
      await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: "business", planIdVersion: 2 });
      await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: "enterprise" });
      await ctx.db.insert("dashboardAnnouncements", { ...base, organizationPlan: " , " });
      await ctx.db.insert("dashboardAnnouncements", { ...base, planIdVersion: 2 });
    });

    const pre = await t.query(internal.migrations.m044_dashboard_announcement_plan_ids_v2_readiness.verify, {
      phase: "pre",
      paginationOpts: firstPage,
    });
    expect(pre.totals).toMatchObject({
      legacy: 1,
      canonicalTargetWithoutVersion: 1,
      legacyTargetWithVersion: 1,
      versionWithoutTargets: 1,
      emptyTargets: 1,
      unknownTargets: 1,
      blocking: 5,
    });

    await runMigrationToCompletion(t, internal.migrations.m044_dashboard_announcement_plan_ids_v2.migration);
    const post = await t.query(internal.migrations.m044_dashboard_announcement_plan_ids_v2_readiness.verify, {
      phase: "post",
      paginationOpts: firstPage,
    });
    expect(post.totals).toMatchObject({ canonical: 1, legacy: 0, blocking: 5 });
  });
});
