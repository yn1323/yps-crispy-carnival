import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

async function addManager(ctx: MutationCtx, organizationId: Id<"organizations">, subject: string) {
  const userId = await seedUser(ctx, subject);
  const now = Date.now();
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: `管理者 ${subject}`,
    email: `${subject}@example.com`,
    emailNormalized: `${subject}@example.com`,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const memberId = await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return { userId, personId, memberId };
}

describe("organizationBilling/mutations 請求先メール", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("同じ正規化メールは異なるrequestIdでも通知・同期・監査を一度だけ適用する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "billing_email_idempotent", plan: "pro" }),
    );
    const requestId = "billing-email-sensitive-request";
    const args = {
      shopId: ids.shopId,
      email: "  Billing@Example.com  ",
      requestId,
    };
    const actor = t.withIdentity({ subject: "billing_email_idempotent" });

    await expect(actor.mutation(api.organizationBilling.mutations.updateBillingEmail, args)).resolves.toEqual({
      changed: true,
    });
    await expect(
      actor.mutation(api.organizationBilling.mutations.updateBillingEmail, {
        ...args,
        email: "billing@example.COM",
        requestId: "billing-email-another-request",
      }),
    ).resolves.toEqual({ changed: false });

    const requestKey = await toAuditRequestKey(requestId);
    const result = await t.run(async (ctx) => {
      const audits = await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect();
      return {
        audits: audits.filter((audit) => audit.action === "organization.billing_email_changed"),
        organization: await ctx.db.get(ids.organizationId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      };
    });
    expect(result.organization).toMatchObject({
      billingEmail: "Billing@Example.com",
      billingEmailNormalized: "billing@example.com",
      billingEmailSyncKey: requestKey,
    });
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0]?.correlationId).toBe(`${ids.organizationId}:billing-email:${requestKey}`);
    expect(result.audits[0]?.correlationId).not.toContain(requestId);
    expect(
      result.scheduled.filter(
        (job) => job.name === "organizationBilling/actions:enqueueBillingEmailChangedNotification",
      ),
    ).toHaveLength(1);
    expect(result.scheduled.filter((job) => job.name === "organizationStripe/actions:syncBillingEmail")).toHaveLength(
      1,
    );
  });

  it("短すぎるrequestIdでは請求先メールを変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "billing_email_short_request", plan: "pro" }),
    );
    const before = await t.run((ctx) => ctx.db.get(ids.organizationId));

    await expect(
      t
        .withIdentity({ subject: "billing_email_short_request" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "billing@example.com",
          requestId: "short",
        }),
    ).rejects.toThrow(ConvexError);

    const organization = await t.run((ctx) => ctx.db.get(ids.organizationId));
    expect(organization?.billingEmail).toBe(before?.billingEmail);
    expect(organization?.billingEmailNormalized).toBe(before?.billingEmailNormalized);
  });

  it("課金stateの移行待ちでは請求先・監査・通知を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "billing_email_missing_state", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.delete(billingState._id);
      return seeded;
    });
    const before = await t.run((ctx) => ctx.db.get(ids.organizationId));

    await expect(
      t
        .withIdentity({ subject: "billing_email_missing_state" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "new-billing@example.com",
          requestId: "billing-email-missing-state",
        }),
    ).rejects.toThrow("組織の契約情報を確認中です");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      organization: await ctx.db.get(ids.organizationId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.organization?.billingEmail).toBe(before?.billingEmail);
    expect(result.organization?.billingEmailNormalized).toBe(before?.billingEmailNormalized);
    expect(result.audits.filter((audit) => audit.action === "organization.billing_email_changed")).toHaveLength(0);
    expect(
      result.scheduled.filter(
        (job) => job.name === "organizationBilling/actions:enqueueBillingEmailChangedNotification",
      ),
    ).toHaveLength(0);
  });

  it("無償Proでは直接呼ばれても請求先・監査・通知を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "complimentary_billing_email",
        complimentary: true,
      }),
    );
    const before = await t.run((ctx) => ctx.db.get(ids.organizationId));

    await expect(
      t
        .withIdentity({ subject: "complimentary_billing_email" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "must-not-change@example.com",
          requestId: "complimentary-billing-email",
        }),
    ).rejects.toThrow("支払い不要の組織では請求先メールアドレスを変更できません");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      organization: await ctx.db.get(ids.organizationId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.organization).toEqual(before);
    expect(result.billingState).toMatchObject({
      state: { kind: "complimentary", plan: "pro" },
      version: 1,
    });
    expect(result.audits).toEqual([]);
    expect(result.outbox).toEqual([]);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/"))).toEqual([]);
  });

  it("Freeからの即時支払い結果待ちはFree権利として請求先メールを変更できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "billing_email_pending_activation",
        plan: "free",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: Date.now() },
        version: 2,
        updatedAt: Date.now(),
      });
      return { ...seeded, billingStateId: billingState._id };
    });
    await expect(
      t
        .withIdentity({ subject: "billing_email_pending_activation" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "new-billing@example.com",
          requestId: "billing-email-payment-pending",
        }),
    ).resolves.toEqual({ changed: true });

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db.get(ids.billingStateId),
      organization: await ctx.db.get(ids.organizationId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.organization?.billingEmail).toBe("new-billing@example.com");
    expect(result.organization?.billingEmailNormalized).toBe("new-billing@example.com");
    expect(result.billingState?.state.kind).toBe("pendingActivation");
    expect(result.billingState?.version).toBe(2);
    expect(result.audits.filter((audit) => audit.action === "organization.billing_email_changed")).toHaveLength(1);
    expect(
      result.scheduled.filter(
        (job) => job.name === "organizationBilling/actions:enqueueBillingEmailChangedNotification",
      ),
    ).toHaveLength(1);
  });
});

describe("organizationBilling/mutations 検証済み課金遷移", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("無償Proでは検証済み課金更新を直接呼んでも状態・監査・通知を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "complimentary_verified_transition",
        complimentary: true,
      }),
    );

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "active", plan: "pro" },
        correlationId: "complimentary-verified-transition",
      }),
    ).rejects.toThrow("現在の契約状態では、この変更を適用できません");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState).toMatchObject({
      state: { kind: "complimentary", plan: "pro" },
      version: 1,
    });
    expect(result.audits).toEqual([]);
    expect(result.outbox).toEqual([]);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/"))).toEqual([]);
  });

  it("Trialから期間末プラン変更への飛び越しを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "invalid_trial_scheduled", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: Date.now() + 30 * 24 * 60 * 60 * 1000 },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: {
          kind: "scheduledChange",
          currentPlan: "pro",
          targetPlan: "free",
          effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
          restrictAtPeriodEnd: true,
        },
        correlationId: "invalid-trial-to-scheduled",
      }),
    ).rejects.toThrow("現在の契約状態では、この変更を適用できません");
  });

  it("Standard上限を超えていてもProからStandardへの変更予約を保存し、適用時の整理対象にする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "pro_to_standard_over_limit",
        plan: "pro",
      });
      for (let index = 0; index < 14; index += 1) {
        await addManager(ctx, seeded.organizationId, `pro_to_standard_manager_${index}`);
      }
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: seeded.organizationId,
        invitedName: "予約対象",
        email: "reserved-standard-seat@example.com",
        emailNormalized: "reserved-standard-seat@example.com",
        tokenDigest: "reserved-standard-seat-token-digest",
        status: "issued",
        inviterMemberId: seeded.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,

        state: {
          kind: "scheduledChange",
          currentPlan: "pro",
          targetPlan: "standard",
          effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
        correlationId: "pro-to-standard-over-limit",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "scheduledChange" });

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", "pro-to-standard-over-limit"))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    }));
    expect(result.billingState?.state).toMatchObject({
      kind: "scheduledChange",

      currentPlan: "pro",
      targetPlan: "standard",
    });
    expect(result.billingState?.version).toBe(2);
    expect(result.audits).toHaveLength(1);
  });

  it.each([
    { label: "StandardからFree", currentPlan: "standard", targetPlan: "free" },
    { label: "ProからStandard", currentPlan: "pro", targetPlan: "standard" },
  ] as const)("$labelの期間末変更予約を明示eventで取り消し、課金メールは送らない", async (plan) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `cancel_${plan.currentPlan}_${plan.targetPlan}`,
        plan: plan.currentPlan,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state:
          plan.currentPlan === "pro"
            ? {
                kind: "scheduledChange",

                currentPlan: "pro",
                targetPlan: "standard",
                effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
              }
            : {
                kind: "scheduledChange",

                currentPlan: "standard",
                targetPlan: "free",
                effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
                restrictAtPeriodEnd: true,
              },
      });
      return { ...seeded, billingStateId: billingState._id };
    });
    const correlationId = `cancel-${plan.currentPlan}-${plan.targetPlan}`;
    const expectedPlan = plan.currentPlan;

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,

        state: { kind: "scheduledChangeCanceled" },
        correlationId,
      }),
    ).resolves.toEqual({ changed: true, stateKind: expectedPlan });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,

        state: { kind: "scheduledChangeCanceled" },
        correlationId,
      }),
    ).resolves.toEqual({ changed: false });

    const result = await t.run(async (ctx) => ({
      audit: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", correlationId))
        .unique(),
      billingState: await ctx.db.get(ids.billingStateId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: expectedPlan });
    expect(result.billingState?.version).toBe(2);
    expect(result.audit).toMatchObject({
      action: "organization.billing_state_changed",
      fromState: "scheduledChange",
      toState: expectedPlan,
    });
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/actions:"))).toEqual([]);
  });

  it("Freeからの即時支払い失敗は有料プランを開放せずactive.freeへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "pending_failure_free", plan: "free" }),
    );

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,

        state: { kind: "pendingActivation", plan: "standard", fallback: "free" },
        correlationId: "pending-free-start",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "activationFailed" },
        correlationId: "pending-free-payment-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.billingState?.version).toBe(3);
    expect(result.billingState?.businessNotificationCutoffAt).toBeUndefined();
    expect(result.billingState?.businessNotificationCutoffVersion).toBeUndefined();
    expect(
      result.scheduled.some(
        (job) =>
          job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications" &&
          job.args[0]?.cutoffVersion === 3,
      ),
    ).toBe(false);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/actions:"))).toEqual([]);
  });

  it("Free上限超過でも即時支払い失敗後に人物を維持してactive.freeへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "pending_failure_free_over_limit",
        plan: "free",
      });
      const secondManager = await addManager(ctx, seeded.organizationId, "pending_failure_free_second_manager");
      const thirdManager = await addManager(ctx, seeded.organizationId, "pending_failure_free_third_manager");
      return { ...seeded, secondManager, thirdManager };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,

        state: { kind: "pendingActivation", plan: "standard", fallback: "free" },
        correlationId: "pending-free-over-limit-start",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "activationFailed" },
        correlationId: "pending-free-over-limit-payment-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      activeMembers: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("status", "active"),
        )
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.billingState).toMatchObject({
      version: 3,
      businessNotificationCutoffVersion: 3,
    });
    expect(result.activeMembers.map((member) => member.personId).sort()).toEqual(
      [ids.personId, ids.secondManager.personId, ids.thirdManager.personId].sort(),
    );
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications" &&
          job.args[0]?.cutoffVersion === 3,
      ),
    ).toHaveLength(1);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/actions:"))).toEqual([]);
  });

  it("pendingActivation以外のactivationFailedイベントを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "invalid_payment_failed_event", plan: "pro" }),
    );

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "activationFailed" },
        correlationId: "invalid-payment-failed-event",
      }),
    ).rejects.toThrow("現在の契約状態では、この変更を適用できません");
  });

  it("FreeからのStandard契約開始は人物・店舗を変更せず確定する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "restore_partial_selection", plan: "free" }),
    );

    await t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: ids.organizationId,
      expectedVersion: 1,

      state: { kind: "pendingActivation", plan: "standard", fallback: "free" },
      correlationId: "restore-partial-start",
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,

        state: { kind: "active", plan: "standard" },
        correlationId: "free-paid-activation-success",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "standard" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      member: await ctx.db.get(ids.memberId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "standard" });
    expect(result.billingState?.version).toBe(3);
    expect(result.member?.status).toBe("active");
    expect(result.shop).toMatchObject({ _id: ids.shopId, isDeleted: false });
  });
});

describe("organizationBilling/mutations first trial invoice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("未契約Trialは期限到達時にデータを保持した上限超過Freeへ移す", async () => {
    const deadlineAt = Date.parse("2026-09-13T15:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_without_subscription", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, { state: { kind: "trial", trialEndsAt: deadlineAt } });
      const secondManager = await addManager(ctx, seeded.organizationId, "trial_without_subscription_second");
      const thirdManager = await addManager(ctx, seeded.organizationId, "trial_without_subscription_third");
      return { ...seeded, secondManager, thirdManager };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: deadlineAt,
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      members: await Promise.all([
        ctx.db.get(ids.memberId),
        ctx.db.get(ids.secondManager.memberId),
        ctx.db.get(ids.thirdManager.memberId),
      ]),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billing).toMatchObject({
      version: 2,
      state: { kind: "active", plan: "free" },
      businessNotificationCutoffAt: deadlineAt,
      businessNotificationCutoffVersion: 2,
    });
    expect(result.members.map((member) => member?.status)).toEqual(["active", "active", "active"]);
    expect(result.shop).toMatchObject({ _id: ids.shopId, isDeleted: false });
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/actions:"))).toEqual([]);
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications" &&
          job.args[0]?.cutoffVersion === 2,
      ),
    ).toHaveLength(1);
  });

  it("新しい解約予約はprovider確定後にデータを保持したFreeへ移す", async () => {
    const deadlineAt = Date.parse("2026-08-31T15:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "scheduled_restriction", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "scheduledChange",
          currentPlan: "pro",
          targetPlan: "free",
          effectiveAt: deadlineAt,
          restrictAtPeriodEnd: true,
        },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.confirmScheduledFreeDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: deadlineAt,
        correlationId: "scheduled-restriction-confirmed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billing).toMatchObject({
      version: 2,
      state: { kind: "active", plan: "free" },
    });
    expect(result.billing?.businessNotificationCutoffAt).toBeUndefined();
    expect(result.billing?.businessNotificationCutoffVersion).toBeUndefined();
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/actions:"))).toEqual([]);
    expect(
      result.scheduled.some(
        (job) => job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications",
      ),
    ).toBe(false);
  });

  it("paid result wins atomically and makes the deadline job stale", async () => {
    const deadlineAt = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "trial_invoice_paid",
        plan: "standard",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: deadlineAt, selectedPaidPlan: "standard" },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        trialEndsAt: deadlineAt,
        result: "paid",
        correlationId: "trial-invoice-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "standard" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: deadlineAt,
      }),
    ).resolves.toEqual({ changed: false, stateKind: "active" });

    const snapshot = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(snapshot.billingState).toMatchObject({
      state: { kind: "active", plan: "standard" },
      version: 3,
    });
    expect(snapshot.audits.map((audit) => audit.correlationId)).toEqual(
      expect.arrayContaining(["trial-invoice-paid:initial-payment-pending", "trial-invoice-paid"]),
    );
  });

  it("期限jobが初回請求確認中へ移した後も、失敗結果は契約終了処理中へ収束する", async () => {
    const deadlineAt = Date.parse("2026-07-21T00:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "trial_invoice_failed",
        plan: "standard",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: deadlineAt, selectedPaidPlan: "standard" },
      });
      return seeded;
    });

    await t.mutation(internal.organizationBilling.mutations.processDeadline, {
      organizationId: ids.organizationId,
      expectedVersion: 1,
      expectedDeadlineAt: deadlineAt,
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        trialEndsAt: deadlineAt,
        result: "failed",
        firstFailureAt: deadlineAt,
        correlationId: "trial-invoice-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "paymentTerminationPending" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState).toMatchObject({
      state: { kind: "paymentTerminationPending", previousPlan: "trial", startedAt: deadlineAt },
      lastPlanChange: { reason: "paymentFailed", previousPlan: "trial", occurredAt: deadlineAt },
      version: 3,
    });
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationStripe/actions:finishPaymentTermination" &&
          job.args[0]?.organizationId === ids.organizationId &&
          job.args[0]?.expectedBillingVersion === 3,
      ),
    ).toHaveLength(1);
  });
});

describe("organizationBilling/mutations Stripe commands", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stores and clears the paid-plan choice without ending the trial", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_pro_choice", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: now + 30 * 24 * 60 * 60 * 1000 },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.selectTrialPaidPlan, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        correlationId: "trial-paid-plan-selected",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "trial" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.clearTrialPaidPlan, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        correlationId: "trial-paid-plan-cleared",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "trial" });

    const snapshot = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(snapshot.billingState).toMatchObject({
      state: { kind: "trial" },
      version: 3,
    });
    expect(snapshot.billingState?.state).not.toHaveProperty("selectedPaidPlan");
    expect(snapshot.audits.map((audit) => audit.correlationId)).toEqual(
      expect.arrayContaining(["trial-paid-plan-selected", "trial-paid-plan-cleared"]),
    );
  });

  it("unexpected provider cancellationでもデータを保持したFreeへ移す", async () => {
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "unexpected_pro_cancellation", plan: "pro" }),
    );

    await expect(
      t.mutation(internal.organizationBilling.mutations.applyUnexpectedCancellation, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        correlationId: "unexpected-pro-cancellation",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const snapshot = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(snapshot.billingState).toMatchObject({
      state: { kind: "active", plan: "free" },
      version: 2,
    });
    expect(snapshot.billingState?.businessNotificationCutoffAt).toBeUndefined();
    expect(snapshot.billingState?.businessNotificationCutoffVersion).toBeUndefined();
    expect(snapshot.audits.map((audit) => audit.correlationId)).toContain("unexpected-pro-cancellation");
  });
});
