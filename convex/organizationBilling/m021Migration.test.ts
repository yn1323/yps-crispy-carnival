import type { WithoutSystemFields } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  createConvexTestWithMigrations,
  createMigrationHistoryTestWithMigrations,
} from "../_test/migrations.test-helper";
import { seedLegacyManagerShop, seedOrganizationManagerShop } from "../_test/seed";

const migrationArgs = { batchSize: 100, cursor: null, dryRun: false } as const;
const m021Migration = internal.migrations.m021_organization_billing_complimentary_pro_to_business.migration;

const correlationId = (organizationId: Id<"organizations">) =>
  `${organizationId}:migration:m021:complimentary-pro-to-business`;

const historicalComplimentaryProState = () =>
  ({ kind: "complimentary", plan: "pro" }) as unknown as Doc<"organizationBillingStates">["state"];
const historicalComplimentaryBusinessState = () =>
  ({ kind: "complimentary", plan: "business" }) as unknown as Doc<"organizationBillingStates">["state"];

type CurrentStripeSubscriptionInsert = WithoutSystemFields<Doc<"organizationStripeSubscriptions">>;
type M021HistoricalStripeSubscriptionInsert = Omit<CurrentStripeSubscriptionInsert, "plan">;

function historicalStripeSubscription(
  subscription: M021HistoricalStripeSubscriptionInsert,
): CurrentStripeSubscriptionInsert {
  return subscription as unknown as CurrentStripeSubscriptionInsert;
}

describe("m021 complimentary Pro to Business migration", () => {
  it("現行schemaはcomplimentary.proだけを受け付ける", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "m021_narrow_schema_rejection",
        plan: "pro",
      }),
    );

    const billingState = await t.run(async (ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique(),
    );
    if (!billingState) throw new Error("billing state not found");

    await expect(
      t.run(async (ctx) => ctx.db.patch(billingState._id, { state: { kind: "complimentary", plan: "pro" } })),
    ).resolves.toBeNull();
    await expect(
      t.run(async (ctx) =>
        ctx.db.patch(billingState._id, {
          state: { kind: "complimentary", plan: "business" } as unknown as Doc<"organizationBillingStates">["state"],
        }),
      ),
    ).rejects.toThrow("Validator error");
  });

  it("complimentary.proだけを一度だけBusinessへ移し、versionと監査を重複させない", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "m021_success_target",
        plan: "pro",
      });
      const active = await seedOrganizationManagerShop(ctx, {
        subject: "m021_success_active",
        plan: "pro",
      });
      const existingBusiness = await seedOrganizationManagerShop(ctx, {
        subject: "m021_existing_complimentary_business",
        plan: "pro",
      });
      const targetState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
        .unique();
      if (!targetState) throw new Error("target billing state not found");
      await ctx.db.patch(targetState._id, {
        state: historicalComplimentaryProState(),
        version: 4,
        updatedAt: 10,
      });
      const existingBusinessState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", existingBusiness.organizationId))
        .unique();
      if (!existingBusinessState) throw new Error("existing Business billing state not found");
      await ctx.db.patch(existingBusinessState._id, {
        state: historicalComplimentaryBusinessState(),
        version: 7,
      });
      return {
        active,
        existingBusinessStateId: existingBusinessState._id,
        target,
        targetStateId: targetState._id,
      };
    });

    await t.mutation(m021Migration, migrationArgs);
    await t.mutation(m021Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      targetState: await ctx.db.get(seeded.targetStateId),
      activeState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.active.organizationId))
        .unique(),
      existingBusinessState: await ctx.db.get(seeded.existingBusinessStateId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(seeded.target.organizationId)))
        .collect(),
      customers: await ctx.db.query("organizationStripeCustomers").collect(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      operations: await ctx.db.query("organizationStripeOperations").collect(),
      billingNotifications: (await ctx.db.query("notificationOutbox").collect()).filter(
        (notification) => notification.purpose === "billing",
      ),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
    }));

    expect(snapshot.targetState).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 5,
    });
    expect(snapshot.activeState).toMatchObject({ state: { kind: "active", plan: "pro" }, version: 1 });
    expect(snapshot.existingBusinessState).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 7,
    });
    expect(snapshot.audits).toEqual([
      expect.objectContaining({
        organizationId: seeded.target.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: seeded.targetStateId,
        fromState: "complimentary.pro",
        toState: "complimentary.business",
        correlationId: correlationId(seeded.target.organizationId),
      }),
    ]);
    expect(snapshot.customers).toEqual([]);
    expect(snapshot.subscriptions).toEqual([]);
    expect(snapshot.operations).toEqual([]);
    expect(snapshot.billingNotifications).toEqual([]);
    expect(snapshot.conflicts).toEqual([]);
  });

  it("organization欠損・重複課金状態・全Stripe証跡・課金通知・先行監査を一意なconflictで停止する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const createTarget = async (subject: string) => {
        const target = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, { state: historicalComplimentaryProState() });
        return { ...target, billingStateId: billingState._id };
      };
      const missing = await createTarget("m021_missing_organization");
      const duplicate = await createTarget("m021_duplicate_billing");
      const customer = await createTarget("m021_customer_evidence");
      const subscription = await createTarget("m021_subscription_evidence");
      const operation = await createTarget("m021_operation_evidence");
      const webhook = await createTarget("m021_webhook_evidence");
      const notification = await createTarget("m021_notification_evidence");
      const audit = await createTarget("m021_existing_audit");
      const now = 100;

      await ctx.db.delete(missing.organizationId);
      await ctx.db.insert("organizationBillingStates", {
        organizationId: duplicate.organizationId,
        state: historicalComplimentaryProState(),
        version: 9,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: customer.organizationId,
        stripeCustomerId: "cus_m021_evidence",
        livemode: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert(
        "organizationStripeSubscriptions",
        historicalStripeSubscription({
          organizationId: subscription.organizationId,
          stripeCustomerId: "cus_m021_subscription",
          stripeSubscriptionId: "sub_m021_evidence",
          stripePriceId: "price_m021_evidence",
          livemode: false,
          status: "canceled",
          providerGeneration: 1,
          cancelAtPeriodEnd: false,
          syncedAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: operation.organizationId,
        kind: "reconcileSubscription",
        requestKey: "m021-operation-evidence",
        stripeIdempotencyKey: "m021-operation-evidence",
        livemode: false,
        status: "succeeded",
        attemptCount: 1,
        completedAt: now,
        expiresAt: now + 1_000,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("stripeWebhookEvents", {
        stripeEventId: "evt_m021_evidence",
        type: "invoice.paid",
        livemode: false,
        objectId: "in_m021_evidence",
        organizationId: webhook.organizationId,
        eventCreatedAt: now,
        status: "processed",
        attemptCount: 1,
        receivedAt: now,
        processedAt: now,
        expiresAt: now + 1_000,
        updatedAt: now,
      });
      await ctx.db.insert("notificationOutbox", {
        channel: "email",
        status: "sent",
        dedupeKey: "m021:billing-notification-evidence",
        organizationId: notification.organizationId,
        purpose: "billing",
        payload: {
          kind: "email",
          from: "noreply@example.com",
          to: "manager@example.com",
          subject: "課金通知",
          html: "<p>課金通知</p>",
          context: "organizationBilling.planActivated",
        },
        attemptCount: 1,
        nextRunAt: now,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      } as unknown as WithoutSystemFields<Doc<"notificationOutbox">>);
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: audit.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: audit.billingStateId,
        fromState: "complimentary.pro",
        toState: "complimentary.business",
        correlationId: correlationId(audit.organizationId),
        occurredAt: now,
      });
      return { audit, customer, duplicate, missing, notification, operation, subscription, webhook };
    });

    await t.mutation(m021Migration, migrationArgs);
    await t.mutation(m021Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      targetStates: await Promise.all(
        [
          seeded.missing,
          seeded.duplicate,
          seeded.customer,
          seeded.subscription,
          seeded.operation,
          seeded.notification,
          seeded.audit,
          seeded.webhook,
        ].map(({ billingStateId }) => ctx.db.get(billingStateId)),
      ),
      conflicts: await ctx.db.query("organizationMigrationConflicts").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
    }));

    expect(snapshot.targetStates.map((state) => state?.state)).toEqual(
      Array.from({ length: 8 }, () => ({ kind: "complimentary", plan: "pro" })),
    );
    expect(
      snapshot.conflicts
        .map(({ sourceId, code, resolvedAt }) => ({ sourceId, code, resolvedAt }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual(
      [
        {
          sourceId: seeded.duplicate.organizationId,
          code: "billing_complimentary_pro_to_business_ambiguous_billing_states",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.notification.organizationId,
          code: "billing_complimentary_pro_to_business_billing_notification_evidence",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.audit.organizationId,
          code: "billing_complimentary_pro_to_business_existing_migration_audit",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.missing.organizationId,
          code: "billing_complimentary_pro_to_business_missing_organization",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.customer.organizationId,
          code: "billing_complimentary_pro_to_business_stripe_customer_evidence",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.operation.organizationId,
          code: "billing_complimentary_pro_to_business_stripe_operation_evidence",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.subscription.organizationId,
          code: "billing_complimentary_pro_to_business_stripe_subscription_evidence",
          resolvedAt: undefined,
        },
        {
          sourceId: seeded.webhook.organizationId,
          code: "billing_complimentary_pro_to_business_stripe_webhook_evidence",
          resolvedAt: undefined,
        },
      ].sort((a, b) => a.code.localeCompare(b.code)),
    );
    expect(snapshot.conflicts).toHaveLength(8);
    expect(snapshot.audits).toHaveLength(1);
  });

  it("証跡を裁定して再実行するとm021所有conflictだけを解消して一度だけ移行する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "m021_repair_target",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, { state: historicalComplimentaryProState() });
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: target.organizationId,
        kind: "reconcileSubscription",
        requestKey: "m021-repair-operation",
        stripeIdempotencyKey: "m021-repair-operation",
        livemode: false,
        status: "cancelled",
        attemptCount: 0,
        expiresAt: 2_000,
        createdAt: 1_000,
        updatedAt: 1_000,
      });
      await ctx.db.insert("organizationMigrationConflicts", {
        organizationId: target.organizationId,
        sourceType: "organization",
        sourceId: target.organizationId,
        code: "unrelated_migration_conflict",
        createdAt: 1_000,
      });
      return { ...target, billingStateId: billingState._id, operationId };
    });

    await t.mutation(m021Migration, migrationArgs);
    await t.run(async (ctx) => await ctx.db.delete(seeded.operationId));
    await t.mutation(m021Migration, migrationArgs);
    await t.mutation(m021Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(seeded.billingStateId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(seeded.organizationId)))
        .collect(),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
          q.eq("sourceType", "organization").eq("sourceId", seeded.organizationId),
        )
        .collect(),
    }));

    expect(snapshot.billingState).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 2,
    });
    expect(snapshot.audits).toHaveLength(1);
    expect(
      snapshot.conflicts
        .map(({ code, resolvedAt }) => ({ code, resolved: resolvedAt !== undefined }))
        .sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "billing_complimentary_pro_to_business_stripe_operation_evidence", resolved: true },
      { code: "unrelated_migration_conflict", resolved: false },
    ]);
  });

  it("freshなm012が作るcomplimentary.businessをm018とm021の再生後も維持する", async () => {
    const t = createMigrationHistoryTestWithMigrations();
    const seeded = await t.run(async (ctx) =>
      seedLegacyManagerShop(ctx, {
        subject: "m021_fresh_series",
        shopName: "m021 fresh series",
      }),
    );

    await t.mutation(internal.migrations.m009_shops_to_organizations.migration, migrationArgs);
    const organizationId = await t.run(async (ctx) => {
      const organizations = await ctx.db
        .query("organizations")
        .withIndex("by_migrationSourceShopId", (q) => q.eq("migrationSourceShopId", seeded.shopId))
        .collect();
      if (organizations.length !== 1) throw new Error("organization migration failed");
      return organizations[0]._id;
    });
    await t.mutation(internal.migrations.m012_organizations_add_complimentary_business.migration, migrationArgs);
    await t.mutation(internal.migrations.m018_organization_billing_business_to_pro.migration, migrationArgs);
    await t.mutation(m021Migration, migrationArgs);

    const snapshot = await t.run(async (ctx) => ({
      billingStates: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .collect(),
      m012Audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${organizationId}:migration:m012:complimentary-business`),
        )
        .collect(),
      m021Audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId(organizationId)))
        .collect(),
    }));

    expect(snapshot.billingStates).toHaveLength(1);
    expect(snapshot.billingStates[0]).toMatchObject({
      state: { kind: "complimentary", plan: "business" },
      version: 1,
    });
    expect(snapshot.m012Audits).toHaveLength(1);
    expect(snapshot.m012Audits[0]).toMatchObject({
      targetId: snapshot.billingStates[0]._id,
      toState: "complimentary.business",
    });
    expect(snapshot.m021Audits).toEqual([]);
  });
});
