import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations, runMigrationToCompletion } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

describe("m045/m046 organization Stripe plan IDs v2 migrations", () => {
  it("legacy SubscriptionとOperationをcanonicalへ移し、曖昧なmarker不整合はconflictへ残す", async () => {
    const t = createConvexTestWithMigrations();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m045_stripe", complimentary: true });
      const now = 100;
      const insertSubscription = async (suffix: string, plan?: "standard" | "pro" | "business", version?: 2) =>
        await ctx.db.insert("organizationStripeSubscriptions", {
          organizationId: seeded.organizationId,
          stripeCustomerId: `cus_${suffix}`,
          stripeSubscriptionId: `sub_${suffix}`,
          stripePriceId: `price_${suffix}`,
          ...(plan ? { plan } : {}),
          ...(version ? { planIdVersion: version } : {}),
          livemode: false,
          status: "canceled",
          providerGeneration: 1,
          cancelAtPeriodEnd: false,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        });
      const insertOperation = async (args: {
        suffix: string;
        sourcePlan?: "standard" | "pro" | "business";
        targetPlan?: "free" | "standard" | "pro" | "business";
        version?: 2;
      }) =>
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: seeded.organizationId,
          kind: "immediatePaidCheckout",
          requestKey: `request-${args.suffix}`,
          stripeIdempotencyKey: `idempotency-${args.suffix}`,
          livemode: false,
          ...(args.sourcePlan ? { sourcePlan: args.sourcePlan } : {}),
          ...(args.targetPlan ? { targetPlan: args.targetPlan } : {}),
          ...(args.version ? { planIdVersion: args.version } : {}),
          status: "queued",
          attemptCount: 0,
          expiresAt: now + 1_000,
          createdAt: now,
          updatedAt: now,
        });

      return {
        legacyProSubscription: await insertSubscription("legacy_pro", "pro"),
        legacyBusinessSubscription: await insertSubscription("legacy_business", "business"),
        noPlanSubscription: await insertSubscription("no_plan"),
        ambiguousSubscription: await insertSubscription("ambiguous", "standard"),
        invalidVersionedSubscription: await insertSubscription("invalid_versioned", "business", 2),
        legacyOperation: await insertOperation({ suffix: "legacy", sourcePlan: "pro", targetPlan: "business" }),
        noPlanOperation: await insertOperation({ suffix: "no_plan" }),
        ambiguousOperation: await insertOperation({ suffix: "ambiguous", sourcePlan: "standard" }),
        invalidVersionedOperation: await insertOperation({
          suffix: "invalid_versioned",
          targetPlan: "business",
          version: 2,
        }),
      };
    });

    await runMigrationToCompletion(t, internal.migrations.m045_organization_stripe_subscription_plan_ids_v2.migration);
    await runMigrationToCompletion(t, internal.migrations.m046_organization_stripe_operation_plan_ids_v2.migration);

    const snapshot = await t.run(async (ctx) => ({
      legacyProSubscription: await ctx.db.get(ids.legacyProSubscription),
      legacyBusinessSubscription: await ctx.db.get(ids.legacyBusinessSubscription),
      noPlanSubscription: await ctx.db.get(ids.noPlanSubscription),
      ambiguousSubscription: await ctx.db.get(ids.ambiguousSubscription),
      invalidVersionedSubscription: await ctx.db.get(ids.invalidVersionedSubscription),
      legacyOperation: await ctx.db.get(ids.legacyOperation),
      noPlanOperation: await ctx.db.get(ids.noPlanOperation),
      ambiguousOperation: await ctx.db.get(ids.ambiguousOperation),
      invalidVersionedOperation: await ctx.db.get(ids.invalidVersionedOperation),
      conflicts: (await ctx.db.query("organizationMigrationConflicts").collect()).map((row) => row.code).sort(),
    }));

    expect(snapshot.legacyProSubscription).toMatchObject({ plan: "standard", planIdVersion: 2 });
    expect(snapshot.legacyBusinessSubscription).toMatchObject({ plan: "pro", planIdVersion: 2 });
    expect(snapshot.noPlanSubscription).toMatchObject({ planIdVersion: 2 });
    expect(snapshot.ambiguousSubscription?.plan).toBe("standard");
    expect(snapshot.ambiguousSubscription).not.toHaveProperty("planIdVersion");
    expect(snapshot.invalidVersionedSubscription).toMatchObject({ plan: "business", planIdVersion: 2 });
    expect(snapshot.legacyOperation).toMatchObject({
      sourcePlan: "standard",
      targetPlan: "pro",
      planIdVersion: 2,
    });
    expect(snapshot.noPlanOperation).toMatchObject({ planIdVersion: 2 });
    expect(snapshot.ambiguousOperation?.sourcePlan).toBe("standard");
    expect(snapshot.ambiguousOperation).not.toHaveProperty("planIdVersion");
    expect(snapshot.invalidVersionedOperation).toMatchObject({ targetPlan: "business", planIdVersion: 2 });
    expect(snapshot.conflicts).toEqual([
      "stripe_operation_plan_ids_v2_canonical_plan_without_version",
      "stripe_operation_plan_ids_v2_legacy_plan_with_version",
      "stripe_subscription_plan_ids_v2_canonical_plan_without_version",
      "stripe_subscription_plan_ids_v2_legacy_plan_with_version",
    ]);
  });

  it("readinessはpreで変換可能なlegacyを許可し、postでは残件を拒否する", async () => {
    const t = createConvexTestWithMigrations();
    await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "m045_readiness", complimentary: true });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_m045_readiness",
        stripeSubscriptionId: "sub_m045_readiness",
        stripePriceId: "price_m045_readiness",
        plan: "pro",
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: 100,
        createdAt: 100,
        updatedAt: 100,
      });
    });

    const query = (phase: "pre" | "post") =>
      t.query(internal.migrations.m045_m046_organization_stripe_plan_ids_v2_readiness.verify, {
        scope: "subscriptions",
        phase,
        paginationOpts: { cursor: null, numItems: 100 },
      });
    expect((await query("pre")).totals).toMatchObject({ legacy: 1, blocking: 0 });
    expect((await query("post")).totals).toMatchObject({ legacy: 1, blocking: 1 });
    await runMigrationToCompletion(t, internal.migrations.m045_organization_stripe_subscription_plan_ids_v2.migration);
    expect((await query("post")).totals).toMatchObject({ legacy: 0, canonical: 1, blocking: 0 });
  });
});
