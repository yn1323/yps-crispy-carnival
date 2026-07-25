import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";

const migrationArgs = { batchSize: 100, cursor: null, dryRun: false } as const;
const m022Migration = internal.migrations.m022_organization_billing_to_complimentary_business.migration;

const correlationId = (organizationId: Id<"organizations">) =>
  `${organizationId}:migration:m022:to-complimentary-business`;

describe("m022 organization billing to complimentary Business migration", () => {
  it("全課金状態を支払い不要Businessへ寄せ、Free選択を消し、再実行で監査を重複させない", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const findState = async (organizationId: Id<"organizations">) => {
        const state = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!state) throw new Error("billing state not found");
        return state;
      };

      const trial = await seedOrganizationManagerShop(ctx, { subject: "m022_trial", plan: "pro" });
      const trialState = await findState(trial.organizationId);
      await ctx.db.patch(trialState._id, {
        state: { kind: "trial", trialEndsAt: 1_700_000_000_000 },
        version: 3,
      });

      const free = await seedOrganizationManagerShop(ctx, { subject: "m022_free", plan: "free" });
      const freeState = await findState(free.organizationId);
      await ctx.db.patch(freeState._id, {
        state: { kind: "active", plan: "free" },
        freeManagerPersonId: free.personId,
        freeShopId: free.shopId,
        version: 2,
      });

      const complimentary = await seedOrganizationManagerShop(ctx, { subject: "m022_complimentary", plan: "pro" });
      const complimentaryState = await findState(complimentary.organizationId);
      await ctx.db.patch(complimentaryState._id, {
        state: { kind: "complimentary", plan: "business" },
        version: 6,
      });

      return {
        trial,
        trialStateId: trialState._id,
        free,
        freeStateId: freeState._id,
        complimentaryStateId: complimentaryState._id,
      };
    });

    await t.mutation(m022Migration, migrationArgs);
    await t.mutation(m022Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      trialState: await ctx.db.get(seeded.trialStateId),
      freeState: await ctx.db.get(seeded.freeStateId),
      complimentaryState: await ctx.db.get(seeded.complimentaryStateId),
      trialAudits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(seeded.trial.organizationId)))
        .collect(),
      freeAudits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(seeded.free.organizationId)))
        .collect(),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));

    expect(snapshot.trialState).toMatchObject({ state: { kind: "complimentary", plan: "business" }, version: 4 });
    expect(snapshot.freeState).toMatchObject({ state: { kind: "complimentary", plan: "business" }, version: 3 });
    expect(snapshot.freeState?.freeManagerPersonId).toBeUndefined();
    expect(snapshot.freeState?.freeShopId).toBeUndefined();
    // 既に支払い不要Businessの行は触らないため、versionが進まない。
    expect(snapshot.complimentaryState).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 6,
    });
    expect(snapshot.trialAudits).toEqual([
      expect.objectContaining({
        organizationId: seeded.trial.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: seeded.trialStateId,
        fromState: "trial",
        toState: "complimentary.business",
      }),
    ]);
    expect(snapshot.freeAudits).toEqual([expect.objectContaining({ fromState: "active.free" })]);
    expect(snapshot.conflicts).toEqual([]);
  });

  it("organization欠損・重複課金状態・Stripe対応をconflictで停止し、状態を変更しない", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const createTarget = async (subject: string) => {
        const target = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, { state: { kind: "active", plan: "pro" } });
        return { ...target, billingStateId: billingState._id };
      };
      const missing = await createTarget("m022_missing_organization");
      const duplicate = await createTarget("m022_duplicate_billing");
      const customer = await createTarget("m022_customer_mapping");
      const subscription = await createTarget("m022_subscription_mapping");
      const now = 100;

      await ctx.db.delete(missing.organizationId);
      await ctx.db.insert("organizationBillingStates", {
        organizationId: duplicate.organizationId,
        state: { kind: "active", plan: "pro" },
        version: 9,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: customer.organizationId,
        stripeCustomerId: "cus_m022_mapping",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: subscription.organizationId,
        stripeCustomerId: "cus_m022_subscription",
        stripeSubscriptionId: "sub_m022_mapping",
        stripePriceId: "price_m022_mapping",
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      return { missing, duplicate, customer, subscription };
    });

    await t.mutation(m022Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      states: await Promise.all(
        [seeded.missing, seeded.duplicate, seeded.customer, seeded.subscription].map((target) =>
          ctx.db.get(target.billingStateId),
        ),
      ),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));

    for (const state of snapshot.states) {
      expect(state).toMatchObject({ state: { kind: "active", plan: "pro" } });
    }
    expect(snapshot.conflicts.map((conflict) => conflict.code).sort()).toEqual([
      "billing_to_complimentary_business_ambiguous_billing_states",
      "billing_to_complimentary_business_missing_organization",
      "billing_to_complimentary_business_stripe_mapping_evidence",
      "billing_to_complimentary_business_stripe_mapping_evidence",
    ]);
    expect(snapshot.audits.filter((audit) => audit.action === "organization.billing_state_changed")).toEqual([]);
  });
});
