import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

const firstPage = { cursor: null, numItems: 100 } as const;

describe("billing compatibility Narrow readiness", () => {
  it("restricted、restricted fallback、legacy plan ID、readOnly管理者をblockingとして数える", async () => {
    const t = createConvexTestWithMigrations();
    await t.run(async (ctx) => {
      const restricted = await seedOrganizationManagerShop(ctx, {
        subject: "m047_restricted",
        complimentary: true,
      });
      const fallback = await seedOrganizationManagerShop(ctx, {
        subject: "m047_fallback",
        complimentary: true,
      });
      const restrictedBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", restricted.organizationId))
        .unique();
      const fallbackBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", fallback.organizationId))
        .unique();
      if (!restrictedBilling || !fallbackBilling) throw new Error("billing state not found");
      await ctx.db.patch(restrictedBilling._id, {
        state: {
          kind: "restricted",
          planIdVersion: 2,
          reason: "freeConditionsNotMet",
          limitPlan: "free",
          recoveryManagerPersonIds: [restricted.personId],
          previousActiveShopIds: [restricted.shopId],
          restrictedAt: 100,
        },
      });
      await ctx.db.patch(fallbackBilling._id, {
        state: {
          kind: "pendingActivation",
          planIdVersion: 2,
          plan: "standard",
          fallback: "restricted",
          restrictedFallbackState: {
            kind: "restricted",
            reason: "paymentActivationFailed",
            recoveryManagerPersonIds: [fallback.personId],
            previousActiveShopIds: [fallback.shopId],
            restrictedAt: 100,
          },
          startedAt: 100,
        },
      });
      await ctx.db.patch(restricted.memberId, { status: "readOnly" });
      const legacy = await seedOrganizationManagerShop(ctx, {
        subject: "m047_legacy",
        complimentary: true,
      });
      const legacyBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", legacy.organizationId))
        .unique();
      if (!legacyBilling) throw new Error("legacy billing state not found");
      await ctx.db.patch(legacyBilling._id, { state: { kind: "active", plan: "free" } });
    });

    await expect(
      t.query(internal.migrations.billing_compatibility_narrow_readiness.verifyBillingStates, {
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({
      totals: { restricted: 1, restrictedFallback: 1, legacyPlanId: 1, blocking: 3 },
    });
    await expect(
      t.query(internal.migrations.billing_compatibility_narrow_readiness.verifyReadOnlyMembers, {
        paginationOpts: firstPage,
      }),
    ).resolves.toMatchObject({ totals: { readOnly: 1, blocking: 1 } });
  });
});
