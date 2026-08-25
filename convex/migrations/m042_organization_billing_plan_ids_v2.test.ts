import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

const migrationArgs = { batchSize: 100, cursor: null, dryRun: false } as const;
const migration = internal.migrations.m042_organization_billing_plan_ids_v2.migration;

const correlationId = (organizationId: Id<"organizations">) => `${organizationId}:migration:m042:billing-plan-ids-v2`;

describe("m042 organization billing plan IDs v2 migration", () => {
  it("complimentary.businessをv2 complimentary.proへ移し、semantic plan eventは追加しない", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "m042_complimentary_business",
        complimentary: true,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, { version: 7 });
      await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: target.organizationId,
        sourceType: "organization",
        sourceId: target.organizationId,
        code: "billing_plan_ids_v2_stripe_customer_evidence",
        createdAt: 1,
      });
      return { ...target, billingStateId: billingState._id };
    });

    await t.mutation(migration, migrationArgs);
    await t.mutation(migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(seeded.billingStateId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(seeded.organizationId)))
        .collect(),
      analyticsEvents: await ctx.db
        .query("analyticsSourceEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", seeded.organizationId))
        .collect(),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));

    expect(snapshot.billingState).toMatchObject({
      state: { kind: "complimentary", planIdVersion: 2, plan: "pro" },
      version: 8,
    });
    expect(snapshot.audits).toEqual([
      expect.objectContaining({
        action: "organization.billing_state_changed",
        fromState: "complimentary.business",
        toState: "complimentary.pro",
      }),
    ]);
    expect(snapshot.analyticsEvents).toEqual([]);
    expect(snapshot.conflicts).toEqual([expect.objectContaining({ resolvedAt: expect.any(Number) })]);
  });

  it("全legacy stateをStripe evidenceの有無に依存せず意味保存でv2へ移す", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const createTarget = async (subject: string) => {
        const target = await seedOrganizationManagerShop(ctx, { subject, complimentary: true });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        return { ...target, billingStateId: billingState._id };
      };

      const unexpected = await createTarget("m042_unexpected");
      const customer = await createTarget("m042_customer");
      const subscription = await createTarget("m042_subscription");
      const operation = await createTarget("m042_operation");
      const webhook = await createTarget("m042_webhook");
      const now = 100;

      await ctx.db.patch(unexpected.billingStateId, { state: { kind: "active", plan: "free" } });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: customer.organizationId,
        stripeCustomerId: "cus_m042",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: subscription.organizationId,
        stripeCustomerId: "cus_m042_subscription",
        stripeSubscriptionId: "sub_m042",
        stripePriceId: "price_m042",
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: operation.organizationId,
        kind: "immediatePaidCheckout",
        requestKey: "m042-operation",
        stripeIdempotencyKey: "m042-operation",
        livemode: false,
        status: "queued",
        attemptCount: 0,
        expiresAt: now + 1_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("stripeWebhookEvents", {
        stripeEventId: "evt_m042",
        type: "customer.subscription.updated",
        livemode: false,
        objectId: "sub_m042_webhook",
        organizationId: webhook.organizationId,
        eventCreatedAt: now,
        status: "received",
        attemptCount: 0,
        receivedAt: now,
        expiresAt: now + 1_000,
        updatedAt: now,
      });

      return [unexpected, customer, subscription, operation, webhook];
    });

    await t.mutation(migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      billingStates: await Promise.all(seeded.map((target) => ctx.db.get(target.billingStateId))),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));

    expect(snapshot.billingStates.map((billingState) => billingState?.state)).toEqual([
      { kind: "active", planIdVersion: 2, plan: "free" },
      { kind: "complimentary", planIdVersion: 2, plan: "pro" },
      { kind: "complimentary", planIdVersion: 2, plan: "pro" },
      { kind: "complimentary", planIdVersion: 2, plan: "pro" },
      { kind: "complimentary", planIdVersion: 2, plan: "pro" },
    ]);
    expect(snapshot.conflicts).toEqual([]);
    expect(snapshot.audits.filter((audit) => audit.correlationId?.includes(":migration:m042:"))).toHaveLength(5);
  });
});
