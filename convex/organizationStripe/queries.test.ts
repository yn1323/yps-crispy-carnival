import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

const NOW = Date.parse("2026-07-20T00:00:00.000Z");

describe("organizationStripe/queries", () => {
  it("期間末解約は最新intentだけを使い、取消済み旧Free予約や証跡なしを解約扱いにする", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = NOW + 30 * 24 * 60 * 60_000;
    const organizations = await t.run(async (ctx) => {
      const seedCase = async (
        subject: string,
        intents: Array<{ kind: "scheduleFree" | "cancelFreeSchedule"; restrictAtPeriodEnd?: true }>,
      ) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
        for (const [index, intent] of intents.entries()) {
          await ctx.db.insert("organizationStripeOperations", {
            organizationId: seeded.organizationId,
            kind: intent.kind,
            requestKey: `${subject}-${index}`,
            stripeIdempotencyKey: `test:${subject}:${index}`,
            livemode: false,
            status: "succeeded",
            attemptCount: 1,
            providerGeneration: 1,
            sourcePlan: "pro",
            targetPlan: "free",
            ...(intent.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
            changeMode: "periodEnd",
            stripeSubscriptionIdSnapshot: "sub_intent",
            stripeSubscriptionItemIdSnapshot: "si_intent",
            effectiveAt,
            completedAt: NOW,
            expiresAt: effectiveAt + 24 * 60 * 60_000,
            createdAt: NOW + index,
            updatedAt: NOW + index,
          });
        }
        return seeded.organizationId;
      };
      return {
        legacyScheduled: await seedCase("intent_legacy_scheduled", [{ kind: "scheduleFree" }]),
        restrictionScheduled: await seedCase("intent_restriction_scheduled", [
          { kind: "scheduleFree", restrictAtPeriodEnd: true },
        ]),
        legacyCanceled: await seedCase("intent_legacy_canceled", [
          { kind: "scheduleFree" },
          { kind: "cancelFreeSchedule" },
        ]),
        noEvidence: (await seedOrganizationManagerShop(ctx, { subject: "intent_no_evidence", plan: "pro" }))
          .organizationId,
      };
    });
    const readIntent = async (organizationId: (typeof organizations)[keyof typeof organizations]) =>
      await t.query(internal.organizationStripe.queries.getCancelAtPeriodEndRestrictionIntent, {
        organizationId,
        providerGeneration: 1,
        stripeSubscriptionId: "sub_intent",
        stripeSubscriptionItemId: "si_intent",
        effectiveAt,
      });

    await expect(readIntent(organizations.legacyScheduled)).resolves.toEqual({ restrictAtPeriodEnd: false });
    await expect(readIntent(organizations.restrictionScheduled)).resolves.toEqual({ restrictAtPeriodEnd: true });
    await expect(readIntent(organizations.legacyCanceled)).resolves.toEqual({ restrictAtPeriodEnd: true });
    await expect(readIntent(organizations.noEvidence)).resolves.toEqual({ restrictAtPeriodEnd: true });
  });

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

  it("Pro Subscriptionの課金期間・item・schedule snapshotを保存し、Actionと安全処理に同じ値を返す", async () => {
    const t = convexTest(schema, modules);
    const subject = "stripe_business_subscription_snapshot";
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject, planIdVersion: 2, plan: "pro" });
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
      plan: "pro" as const,
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
