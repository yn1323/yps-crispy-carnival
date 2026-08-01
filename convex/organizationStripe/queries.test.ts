import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = Date.parse("2026-07-20T00:00:00.000Z");

describe("organizationStripe/queries", () => {
  it("既知Webhook objectの対応が重複する場合は組織を推測しない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const complimentary = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_guard_duplicate_complimentary",
        plan: "pro",
        complimentary: true,
      });
      const eligible = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_guard_duplicate_eligible",
        plan: "free",
      });

      for (const [index, organizationId] of [complimentary.organizationId, eligible.organizationId].entries()) {
        const stripeCustomerId = `cus_guard_duplicate_${index}`;
        await ctx.db.insert("organizationStripeSubscriptions", {
          organizationId,
          stripeCustomerId,
          stripeSubscriptionId: "sub_guard_duplicate",
          stripePriceId: "price_guard_duplicate",
          stripeSubscriptionScheduleId: "sub_sched_guard_duplicate",
          livemode: false,
          status: "active",
          providerGeneration: 1,
          cancelAtPeriodEnd: false,
          latestInvoiceId: "in_guard_duplicate",
          syncedAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        });
        await ctx.db.insert("organizationStripeOperations", {
          organizationId,
          kind: "immediateProCheckout",
          requestKey: `guard-duplicate-${index}`,
          stripeIdempotencyKey: `test:guard-duplicate-${index}`,
          livemode: false,
          stripeObjectId: "cs_guard_duplicate",
          status: "succeeded",
          attemptCount: 1,
          completedAt: NOW,
          expiresAt: NOW + 24 * 60 * 60_000,
          createdAt: NOW,
          updatedAt: NOW,
        });
      }
    });

    await expect(
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "customer.subscription.updated",
        objectId: "sub_guard_duplicate",
        livemode: false,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "subscription_schedule.updated",
        objectId: "sub_sched_guard_duplicate",
        livemode: false,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "invoice.paid",
        objectId: "in_guard_duplicate",
        livemode: false,
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "checkout.session.completed",
        objectId: "cs_guard_duplicate",
        livemode: false,
      }),
    ).resolves.toBeNull();
  });

  it("Business Subscriptionの課金期間・item・schedule snapshotを保存し、Actionと安全処理に同じ値を返す", async () => {
    const t = convexTest(schema, modules);
    const subject = "stripe_business_subscription_snapshot";
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "business" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_business_snapshot",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    const snapshot = {
      stripeSubscriptionId: "sub_business_snapshot",
      stripeSubscriptionItemId: "si_business_snapshot",
      stripePriceId: "price_business_snapshot",
      plan: "business" as const,
      currentPeriodStartsAt: NOW - 10 * 24 * 60 * 60_000,
      currentPeriodEndsAt: NOW + 20 * 24 * 60 * 60_000,
      billingCycleAnchor: NOW - 10 * 24 * 60 * 60_000,
      stripeSubscriptionScheduleId: "sub_sched_business_snapshot",
    };

    await expect(
      t.mutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
        organizationId: ids.organizationId,
        stripeCustomerId: "cus_business_snapshot",
        ...snapshot,
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
      }),
    ).resolves.toEqual({ changed: true, stale: false });

    const [actionContext, safetyContext, scheduleGuard, persisted] = await Promise.all([
      t.query(internal.organizationStripe.queries.getActionContext, {
        tokenIdentifier: testAuthTokenIdentifier(subject),
        shopId: ids.shopId,
        purpose: "schedulePaidPlanChange",
      }),
      t.query(internal.organizationStripe.queries.getSafetyContextByOrganization, {
        organizationId: ids.organizationId,
      }),
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "subscription_schedule.updated",
        objectId: snapshot.stripeSubscriptionScheduleId,
        livemode: false,
      }),
      t.run(
        async (ctx) =>
          await ctx.db
            .query("organizationStripeSubscriptions")
            .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
              q.eq("livemode", false).eq("stripeSubscriptionId", snapshot.stripeSubscriptionId),
            )
            .unique(),
      ),
    ]);

    expect(actionContext).toMatchObject({
      currentStripeSubscriptionId: snapshot.stripeSubscriptionId,
      currentStripePlan: snapshot.plan,
      currentStripeSubscriptionItemId: snapshot.stripeSubscriptionItemId,
      currentPeriodStartsAt: snapshot.currentPeriodStartsAt,
      currentPeriodEndsAt: snapshot.currentPeriodEndsAt,
      billingCycleAnchor: snapshot.billingCycleAnchor,
      stripeSubscriptionScheduleId: snapshot.stripeSubscriptionScheduleId,
    });
    expect(safetyContext?.subscription).toMatchObject(snapshot);
    expect(scheduleGuard).toBe("eligible");
    expect(persisted).toMatchObject(snapshot);
  });

  it("complimentary.businessの既知Subscription ScheduleはCustomer hintがなくてもprovider照合前に遮断する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_complimentary_schedule_guard",
        complimentary: true,
      });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing fixture missing");
      await ctx.db.patch(billing._id, { state: { kind: "complimentary", plan: "business" } });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_complimentary_schedule_guard",
        stripeSubscriptionId: "sub_complimentary_schedule_guard",
        stripeSubscriptionScheduleId: "sub_sched_complimentary_guard",
        stripePriceId: "price_business_complimentary_guard",
        plan: "business",
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });

    await expect(
      t.query(internal.organizationStripe.queries.getKnownWebhookObjectGuard, {
        type: "subscription_schedule.released",
        objectId: "sub_sched_complimentary_guard",
        livemode: false,
      }),
    ).resolves.toBe("complimentary");
  });
});
