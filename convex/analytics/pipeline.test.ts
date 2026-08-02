import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { SCENARIO_NOW } from "../_test/scenarioBuilders";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const GENERATION = "manager-membership-bootstrap";

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
    let bootstrap = null;
    for (let step = 0; step < 40; step += 1) {
      vi.advanceTimersByTime(0);
      await t.finishInProgressScheduledFunctions();
      bootstrap = await t.run((ctx) =>
        ctx.db
          .query("analyticsAggregationJobs")
          .withIndex("by_jobKey", (q) => q.eq("jobKey", `bootstrap:${GENERATION}`))
          .unique(),
      );
      if (bootstrap?.status === "completed") break;
    }
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
});
