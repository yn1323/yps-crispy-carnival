import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { createConvexTestWithMigrations } from "../_test/migrations.test-helper";
import { seedOrganizationManagerShop } from "../_test/seed";
import type { OrganizationBillingState } from "./policy";

describe("m018 organization billing Business to Pro migration", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("normalizes every legacy state shape without rewriting historical audits", async () => {
    const t = createConvexTestWithMigrations();
    const cases: Array<{
      state: OrganizationBillingState;
      expected: OrganizationBillingState;
      expectedVersion?: number;
    }> = [
      {
        state: { kind: "trial", trialEndsAt: 1_000, selectedPaidPlan: "business" },
        expected: { kind: "trial", trialEndsAt: 1_000, selectedPaidPlan: "pro" },
      },
      {
        state: { kind: "initialPaymentPending", plan: "business", startedAt: 100 },
        expected: { kind: "initialPaymentPending", plan: "pro", startedAt: 100 },
      },
      { state: { kind: "active", plan: "business" }, expected: { kind: "active", plan: "pro" } },
      {
        state: { kind: "complimentary", plan: "business" },
        expected: { kind: "complimentary", plan: "business" },
        expectedVersion: 1,
      },
      {
        state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "free", effectiveAt: 2_000 },
        expected: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt: 2_000 },
      },
      {
        state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt: 2_000 },
        expected: { kind: "active", plan: "pro" },
      },
      {
        state: { kind: "grace", plan: "business", startedAt: 100, endsAt: 2_000 },
        expected: { kind: "grace", plan: "pro", startedAt: 100, endsAt: 2_000 },
      },
    ];

    const rows = await t.run(async (ctx) => {
      const result = [];
      for (const [index, migrationCase] of cases.entries()) {
        const seeded = await seedOrganizationManagerShop(ctx, {
          subject: `m018_business_${index}`,
          plan: "pro",
        });
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, { state: migrationCase.state });
        result.push({
          billingStateId: billingState._id,
          expected: migrationCase.expected,
          expectedVersion: migrationCase.expectedVersion ?? 2,
        });
      }
      const auditBillingState = await ctx.db.get(result[3].billingStateId);
      if (!auditBillingState) throw new Error("audit billing state not found");
      const auditId = await ctx.db.insert("organizationAuditEvents", {
        organizationId: auditBillingState.organizationId,
        action: "organization.billing_state_changed",
        targetKind: "billing",
        targetId: result[3].billingStateId,
        toState: "complimentary.business",
        correlationId: "m018-historical-audit",
        occurredAt: 1,
      });
      return { result, auditId };
    });

    await t.mutation(internal.migrations.m018_organization_billing_business_to_pro.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
    });

    const snapshot = await t.run(async (ctx) => ({
      billingStates: await Promise.all(rows.result.map(({ billingStateId }) => ctx.db.get(billingStateId))),
      audit: await ctx.db.get(rows.auditId),
    }));
    for (const [index, row] of snapshot.billingStates.entries()) {
      expect(row).toMatchObject({
        state: rows.result[index].expected,
        version: rows.result[index].expectedVersion,
      });
    }
    expect(snapshot.audit?.toState).toBe("complimentary.business");
  });

  it("同じ組織に課金状態が複数ある場合は全行を変更せずmigration conflictへ記録する", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "m018_duplicate_billing_states",
        plan: "business",
      });
      const original = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", base.organizationId))
        .unique();
      if (!original) throw new Error("billing state not found");
      const duplicateId = await ctx.db.insert("organizationBillingStates", {
        organizationId: base.organizationId,
        state: { kind: "complimentary", plan: "business" },
        version: 7,
        createdAt: 10,
        updatedAt: 20,
      });
      return { ...base, originalId: original._id, duplicateId };
    });

    await t.mutation(internal.migrations.m018_organization_billing_business_to_pro.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
    });

    const snapshot = await t.run(async (ctx) => ({
      original: await ctx.db.get(seeded.originalId),
      duplicate: await ctx.db.get(seeded.duplicateId),
      conflicts: await ctx.db
        .query("organizationMigrationConflicts")
        .withIndex("by_organizationId_and_resolvedAt", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("resolvedAt", undefined),
        )
        .collect(),
    }));
    expect(snapshot.original).toMatchObject({ state: { kind: "active", plan: "business" }, version: 1 });
    expect(snapshot.duplicate).toMatchObject({ state: { kind: "complimentary", plan: "business" }, version: 7 });
    expect(snapshot.conflicts).toEqual([
      expect.objectContaining({
        sourceType: "organization",
        sourceId: seeded.organizationId,
        code: "billing_business_to_pro_ambiguous_billing_states",
      }),
    ]);
  });

  it("旧Business表記を含むpending課金メールだけを取り消す", async () => {
    const t = createConvexTestWithMigrations();
    const seeded = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: "m018_pending_business_copy",
        plan: "business",
      });
      const now = Date.now();
      const insertNotification = async (purpose: "billing" | "business", status: "pending" | "processing") =>
        await ctx.db.insert("notificationOutbox", {
          channel: "email",
          status,
          dedupeKey: `m018:${purpose}:${status}`,
          organizationId: base.organizationId,
          ...(status === "pending" ? { organizationBillingVersionAtEnqueue: 1 } : {}),
          userId: base.userId,
          purpose,
          payload: {
            kind: "email",
            from: "noreply@example.com",
            to: "manager@example.com",
            subject: "Businessプランのお知らせ",
            html: "<p>Businessプランのお知らせ</p>",
            context: "organizationBilling.legacyBusiness",
          },
          attemptCount: 0,
          nextRunAt: now,
          ...(status === "processing" ? { processingStartedAt: now } : {}),
          createdAt: now,
          updatedAt: now,
        });
      return {
        ...base,
        pendingBillingId: await insertNotification("billing", "pending"),
        processingBillingId: await insertNotification("billing", "processing"),
        pendingBusinessId: await insertNotification("business", "pending"),
      };
    });

    await t.mutation(internal.migrations.m018_organization_billing_business_to_pro.migration, {
      batchSize: 100,
      cursor: null,
      dryRun: false,
    });

    const beforeDelivery = await t.run(async (ctx) => await ctx.db.get(seeded.processingBillingId));
    expect(beforeDelivery?.status).toBe("processing");
    const prepared = await t.mutation(internal.notificationOutbox.mutations.prepareForDelivery, {
      outboxId: seeded.processingBillingId,
      now: Date.now() + 1,
    });
    expect(prepared).toBeNull();

    const snapshot = await t.run(async (ctx) => ({
      pendingBilling: await ctx.db.get(seeded.pendingBillingId),
      processingBilling: await ctx.db.get(seeded.processingBillingId),
      pendingBusiness: await ctx.db.get(seeded.pendingBusinessId),
    }));
    expect(snapshot.pendingBilling).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
      terminalAt: expect.any(Number),
    });
    expect(snapshot.pendingBilling?.terminalAt).toBe(snapshot.pendingBilling?.cancelledAt);
    expect(snapshot.processingBilling).toMatchObject({
      status: "cancelled",
      cancelReason: "organization_billing_changed",
      terminalAt: expect.any(Number),
    });
    expect(snapshot.processingBilling?.terminalAt).toBe(snapshot.processingBilling?.cancelledAt);
    expect(snapshot.pendingBusiness?.status).toBe("pending");
  });
});
