import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop } from "../_test/seed";
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
});
