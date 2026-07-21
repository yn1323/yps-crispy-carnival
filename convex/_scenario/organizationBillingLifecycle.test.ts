import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PAYMENT_GRACE_PERIOD_MS } from "../organizationBilling/policy";

const stripeProviderMock = vi.hoisted(() => ({
  retrieveSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  retrieveInvoice: vi.fn(),
  listInvoices: vi.fn(),
  updateInvoice: vi.fn(),
}));

vi.mock("stripe", () => {
  class MockStripe {
    static errors = { StripeError: Error };
    static createFetchHttpClient = vi.fn();
    static createSubtleCryptoProvider = vi.fn();
    subscriptions = {
      retrieve: stripeProviderMock.retrieveSubscription,
      cancel: stripeProviderMock.cancelSubscription,
    };
    invoices = {
      retrieve: stripeProviderMock.retrieveInvoice,
      list: stripeProviderMock.listInvoices,
      update: stripeProviderMock.updateInvoice,
    };
  }
  return { default: MockStripe };
});

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

async function addStaffPerson(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  shopId: Id<"shops">,
  subject: string,
) {
  const now = Date.now();
  const email = `${subject}@example.com`;
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    name: `スタッフ ${subject}`,
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("staffs", {
    organizationId,
    organizationPersonId: personId,
    shopId,
    name: `スタッフ ${subject}`,
    email,
    emailNormalized: email,
    isDeleted: false,
  });
}

describe("事業者課金ライフサイクル", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("継続プラン未選択のTrialはFree条件を満たせばFreeへ一度だけ移行する", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_free", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: now.getTime() },
        version: 4,
        updatedAt: now.getTime() - 1,
      });
      return { ...seeded, billingStateId: billingState._id };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 4,
        expectedDeadlineAt: now.getTime(),
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 4,
        expectedDeadlineAt: now.getTime(),
      }),
    ).resolves.toEqual({ changed: false, stateKind: "active" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.billingState).toMatchObject({
      version: 5,
      businessNotificationCutoffAt: now.getTime(),
      businessNotificationCutoffVersion: 5,
    });
    expect(result.audits.filter((event) => event.action === "organization.billing_state_changed")).toHaveLength(1);
  });

  it("Pro継続を選択したTrialは初回請求確認中へ一度だけ移行する", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_selected_paid", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: now.getTime(), selectedPaidPlan: "pro" },
        version: 4,
        updatedAt: now.getTime() - 1,
      });
      return { ...seeded, billingStateId: billingState._id };
    });
    const deadlineArgs = {
      organizationId: ids.organizationId,
      expectedVersion: 4,
      expectedDeadlineAt: now.getTime(),
    };

    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: true,
      stateKind: "initialPaymentPending",
    });
    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: false,
      stateKind: "initialPaymentPending",
    });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(result.billingState?.state).toEqual({
      kind: "initialPaymentPending",
      plan: "pro",
      startedAt: now.getTime(),
    });
    expect(result.billingState?.version).toBe(5);
    expect(result.billingState?.businessNotificationCutoffAt).toBeUndefined();
    expect(result.billingState?.businessNotificationCutoffVersion).toBeUndefined();
    expect(result.audits.filter((event) => event.action === "organization.billing_state_changed")).toEqual([
      expect.objectContaining({ fromState: "trial", toState: "initialPaymentPending" }),
    ]);
  });

  it("継続プラン未選択のTrialでFree条件を確定できなければデータを残して制限する", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_restricted", plan: "pro" });
      const second = await addManager(ctx, seeded.organizationId, "trial_restricted_second");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: now.getTime() },
        freeManagerPersonId: undefined,
        version: 2,
        updatedAt: now.getTime() - 1,
      });
      return { ...seeded, ...second, billingStateId: billingState._id };
    });

    await t.mutation(internal.organizationBilling.mutations.processDeadline, {
      organizationId: ids.organizationId,
      expectedVersion: 2,
      expectedDeadlineAt: now.getTime(),
    });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      members: await ctx.db
        .query("organizationMembers")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state).toMatchObject({
      kind: "restricted",
      reason: "trialFreeConditionsNotMet",
    });
    expect(result.billingState).toMatchObject({
      version: 3,
      businessNotificationCutoffAt: now.getTime(),
      businessNotificationCutoffVersion: 3,
    });
    expect(result.members.filter((member) => member.status === "active")).toHaveLength(2);
    expect(result.shop?.operatingStatus).toBe("active");
  });

  it("Proの再請求失敗から14日後にStripeの未払いを確認して制限し、確認済みの対象だけを復旧する", async () => {
    const t = convexTest(schema, modules);
    const graceEndsAt = Date.parse("2026-10-15T12:00:00+09:00");
    const firstFailureAt = graceEndsAt - PAYMENT_GRACE_PERIOD_MS;
    vi.setSystemTime(firstFailureAt);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "grace_recovery", plan: "pro" });
      const second = await addManager(ctx, seeded.organizationId, "grace_recovery_second");
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: seeded.organizationId,
        operatingStatus: "active",
        name: "第二店舗",
        submissionPattern: { kind: "dateOnly" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_grace_recovery",
        livemode: false,
        createdAt: firstFailureAt,
        updatedAt: firstFailureAt,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_grace_recovery",
        stripeSubscriptionId: "sub_grace_recovery",
        stripeSubscriptionItemId: "si_grace_recovery",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "past_due",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        latestInvoiceId: "in_grace_recovery",
        syncedAt: firstFailureAt,
        createdAt: firstFailureAt,
        updatedAt: firstFailureAt,
      });
      return {
        ...seeded,
        firstPersonId: seeded.personId,
        firstMemberId: seeded.memberId,
        secondPersonId: second.personId,
        secondMemberId: second.memberId,
        secondShopId,
        billingStateId: billingState._id,
      };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "grace", plan: "pro", firstFailureAt },
        correlationId: "verified-unpaid-renewal",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "grace" });

    vi.setSystemTime(graceEndsAt);
    const deadlineArgs = {
      organizationId: ids.organizationId,
      expectedVersion: 2,
      expectedDeadlineAt: graceEndsAt,
    };
    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: false,
      stateKind: "grace",
    });

    const pendingReconciliation = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      firstMember: await ctx.db.get(ids.firstMemberId),
      secondMember: await ctx.db.get(ids.secondMemberId),
      firstShop: await ctx.db.get(ids.shopId),
      secondShop: await ctx.db.get(ids.secondShopId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(pendingReconciliation.billingState?.state).toEqual({
      kind: "grace",
      plan: "pro",
      startedAt: firstFailureAt,
      endsAt: graceEndsAt,
    });
    expect(pendingReconciliation.firstMember?.status).toBe("active");
    expect(pendingReconciliation.secondMember?.status).toBe("active");
    expect(pendingReconciliation.firstShop?.operatingStatus).toBe("active");
    expect(pendingReconciliation.secondShop?.operatingStatus).toBe("active");
    expect(
      pendingReconciliation.scheduled.filter(
        (job) =>
          job.name === "organizationStripe/actions:stopExpiredGraceCollection" &&
          job.args[0]?.organizationId === ids.organizationId &&
          job.args[0]?.expectedBillingVersion === 2 &&
          job.args[0]?.requestId === "grace-stop-2",
      ),
    ).toHaveLength(1);

    const subscriptionSnapshot = (status: "past_due" | "canceled") => ({
      id: "sub_grace_recovery",
      customer: "cus_grace_recovery",
      livemode: false,
      status,
      cancel_at_period_end: false,
      trial_end: null,
      latest_invoice: "in_grace_recovery",
      items: {
        data: [
          {
            id: "si_grace_recovery",
            price: { id: "price_pro_test" },
            current_period_end: Math.floor((graceEndsAt + 30 * 24 * 60 * 60_000) / 1_000),
          },
        ],
      },
    });
    const invoiceSnapshot = (autoAdvance = true) => ({
      id: "in_grace_recovery",
      customer: "cus_grace_recovery",
      livemode: false,
      auto_advance: autoAdvance,
      status: "open",
      amount_remaining: 1000,
      parent: { subscription_details: { subscription: "sub_grace_recovery" } },
    });
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_billing_scenario");
    stripeProviderMock.retrieveSubscription.mockResolvedValue(subscriptionSnapshot("past_due"));
    stripeProviderMock.cancelSubscription.mockResolvedValue(subscriptionSnapshot("canceled"));
    stripeProviderMock.retrieveInvoice.mockResolvedValue(invoiceSnapshot());
    stripeProviderMock.listInvoices.mockImplementation(async (args: { status: "open" | "draft" }) => ({
      data: args.status === "open" ? [invoiceSnapshot()] : [],
      has_more: false,
    }));
    stripeProviderMock.updateInvoice.mockResolvedValue(invoiceSnapshot(false));

    await expect(
      t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, {
        organizationId: ids.organizationId,
        expectedBillingVersion: 2,
        requestId: "grace-stop-2",
      }),
    ).resolves.toBeNull();
    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: false,
      stateKind: "restricted",
    });

    const restricted = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      operations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(restricted.billingState?.state).toEqual({
      kind: "restricted",
      reason: "paymentGraceExpired",
      previousPlan: "pro",
      recoveryManagerPersonIds: [ids.firstPersonId, ids.secondPersonId],
      previousActiveShopIds: [ids.shopId, ids.secondShopId],
      restrictedAt: graceEndsAt,
    });
    expect(restricted.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "reconcileSubscription", status: "succeeded" }),
        expect.objectContaining({ kind: "cancelSubscription", status: "succeeded" }),
        expect.objectContaining({ kind: "stopInvoiceCollection", status: "succeeded" }),
      ]),
    );

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.secondMemberId, { status: "readOnly", updatedAt: graceEndsAt });
      await ctx.db.patch(ids.secondShopId, { operatingStatus: "planSuspended" });
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 3,
        state: { kind: "active", plan: "pro" },
        correlationId: "verified-recovery-1",
      }),
    ).rejects.toThrow("再開する管理者と店舗を確認してください");

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 3,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.firstPersonId, ids.firstPersonId],
        restoreShopIds: [ids.shopId],
        correlationId: "verified-recovery-duplicate",
      }),
    ).rejects.toThrow("復旧対象が重複しています");

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 3,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.firstPersonId],
        restoreShopIds: [ids.shopId],
        correlationId: "verified-recovery-2",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pro" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      firstMember: await ctx.db.get(ids.firstMemberId),
      secondMember: await ctx.db.get(ids.secondMemberId),
      firstShop: await ctx.db.get(ids.shopId),
      secondShop: await ctx.db.get(ids.secondShopId),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.billingState).toMatchObject({
      version: 4,
      businessNotificationCutoffAt: graceEndsAt,
      businessNotificationCutoffVersion: 3,
    });
    expect(result.firstMember?.status).toBe("active");
    expect(result.secondMember?.status).toBe("readOnly");
    expect(result.firstShop?.operatingStatus).toBe("active");
    expect(result.secondShop?.operatingStatus).toBe("planSuspended");
  });

  it("Proの最初の支払い失敗から14日間だけ猶予し、再試行で期限を延長しない", async () => {
    const t = convexTest(schema, modules);
    const firstFailureAt = Date.parse("2026-10-01T12:00:00+09:00");
    vi.setSystemTime(firstFailureAt + 60 * 60 * 1000);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "grace_first_failure", plan: "pro" }));

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "grace", plan: "pro", firstFailureAt },
        correlationId: "verified-first-failure",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "grace" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: {
          kind: "grace",
          plan: "pro",
          firstFailureAt: firstFailureAt + 24 * 60 * 60 * 1000,
        },
        correlationId: "verified-retry-failure",
      }),
    ).resolves.toEqual({ changed: false, stateKind: "grace" });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({
      kind: "grace",
      plan: "pro",
      startedAt: firstFailureAt,
      endsAt: firstFailureAt + PAYMENT_GRACE_PERIOD_MS,
    });
    expect(result.billingState?.version).toBe(2);
    expect(result.audits.filter((audit) => audit.action === "organization.billing_state_changed")).toHaveLength(1);
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/mutations:processDeadline" &&
          job.args[0]?.organizationId === ids.organizationId &&
          job.args[0]?.expectedDeadlineAt === firstFailureAt + PAYMENT_GRACE_PERIOD_MS,
      ),
    ).toHaveLength(1);
  });

  it("ProからFreeへの変更予約は契約期間末にStripeの取消を確認して一度だけ移行する", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = Date.parse("2026-11-01T00:00:00+09:00");
    vi.setSystemTime(effectiveAt - 24 * 60 * 60 * 1000);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pro_to_free", plan: "pro" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_pro_to_free",
        livemode: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_pro_to_free",
        stripeSubscriptionId: "sub_pro_to_free",
        stripeSubscriptionItemId: "si_pro_to_free",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "active",
        providerGeneration: 1,
        currentPeriodEndsAt: effectiveAt,
        cancelAtPeriodEnd: true,
        syncedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt },
        correlationId: "verified-pro-to-free-scheduled",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "scheduledChange" });

    vi.setSystemTime(effectiveAt);
    const deadlineArgs = {
      organizationId: ids.organizationId,
      expectedVersion: 2,
      expectedDeadlineAt: effectiveAt,
    };
    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: false,
      stateKind: "scheduledChange",
    });

    const pendingReconciliation = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(pendingReconciliation.billingState?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt,
    });
    expect(pendingReconciliation.billingState?.version).toBe(2);
    expect(
      pendingReconciliation.scheduled.filter(
        (job) =>
          job.name === "organizationStripe/actions:reconcileScheduledFreeDeadline" &&
          job.args[0]?.organizationId === ids.organizationId &&
          job.args[0]?.expectedBillingVersion === 2 &&
          job.args[0]?.requestId === "scheduled-free-2",
      ),
    ).toHaveLength(1);

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_billing_scenario");
    stripeProviderMock.retrieveSubscription.mockResolvedValue({
      id: "sub_pro_to_free",
      customer: "cus_pro_to_free",
      livemode: false,
      status: "canceled",
      cancel_at_period_end: true,
      trial_end: null,
      latest_invoice: null,
      items: {
        data: [
          {
            id: "si_pro_to_free",
            price: { id: "price_pro_test" },
            current_period_end: Math.floor(effectiveAt / 1_000),
          },
        ],
      },
    });
    const reconcileArgs = {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-free-2",
    };
    await expect(
      t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, reconcileArgs),
    ).resolves.toBeNull();
    await expect(
      t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, reconcileArgs),
    ).resolves.toBeNull();
    await expect(t.mutation(internal.organizationBilling.mutations.processDeadline, deadlineArgs)).resolves.toEqual({
      changed: false,
      stateKind: "active",
    });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      operations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.billingState).toMatchObject({
      version: 3,
      businessNotificationCutoffAt: effectiveAt,
      businessNotificationCutoffVersion: 3,
    });
    expect(
      result.audits.filter(
        (audit) => audit.action === "organization.billing_state_changed" && audit.toState === "free",
      ),
    ).toHaveLength(1);
    expect(result.audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromState: "active", toState: "scheduledChange" }),
        expect.objectContaining({ fromState: "scheduledChange", toState: "free" }),
      ]),
    );
    expect(result.operations).toEqual([
      expect.objectContaining({
        kind: "reconcileSubscription",
        recoveryPurpose: "scheduledFreeDeadline",
        requestKey: "scheduled-free-2",
        status: "succeeded",
      }),
    ]);
    expect(stripeProviderMock.retrieveSubscription).toHaveBeenCalledTimes(1);
  });

  it("Proを継続せず利用人数6人・2店舗のFree上限を超える場合はデータを残して制限する", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = Date.parse("2026-11-01T00:00:00+09:00");
    vi.setSystemTime(effectiveAt - 24 * 60 * 60 * 1000);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pro_to_free_over_limits", plan: "pro" });
      for (let index = 1; index <= 5; index += 1) {
        await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `pro_to_free_over_limits_staff_${index}`);
      }
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: seeded.organizationId,
        operatingStatus: "active",
        name: "第二店舗",
        submissionPattern: { kind: "dateOnly" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        freeShopId: undefined,
        updatedAt: Date.now(),
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_pro_to_free_over_limits",
        livemode: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_pro_to_free_over_limits",
        stripeSubscriptionId: "sub_pro_to_free_over_limits",
        stripeSubscriptionItemId: "si_pro_to_free_over_limits",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "active",
        providerGeneration: 1,
        currentPeriodEndsAt: effectiveAt,
        cancelAtPeriodEnd: true,
        syncedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { ...seeded, secondShopId, billingStateId: billingState._id };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt },
        correlationId: "verified-pro-to-free-over-limits-scheduled",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "scheduledChange" });

    vi.setSystemTime(effectiveAt);
    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        expectedDeadlineAt: effectiveAt,
      }),
    ).resolves.toEqual({ changed: false, stateKind: "scheduledChange" });

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_billing_scenario");
    stripeProviderMock.retrieveSubscription.mockResolvedValue({
      id: "sub_pro_to_free_over_limits",
      customer: "cus_pro_to_free_over_limits",
      livemode: false,
      status: "canceled",
      cancel_at_period_end: true,
      trial_end: null,
      latest_invoice: null,
      items: {
        data: [
          {
            id: "si_pro_to_free_over_limits",
            price: { id: "price_pro_test" },
            current_period_end: Math.floor(effectiveAt / 1_000),
          },
        ],
      },
    });
    const scheduledFreeJobs = await t.run(async (ctx) => {
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      return jobs.filter(
        (job) =>
          job.name === "organizationStripe/actions:reconcileScheduledFreeDeadline" &&
          job.args[0]?.organizationId === ids.organizationId,
      );
    });
    expect(scheduledFreeJobs.map((job) => ({ name: job.name, args: job.args[0] }))).toEqual([
      {
        name: "organizationStripe/actions:reconcileScheduledFreeDeadline",
        args: {
          organizationId: ids.organizationId,
          expectedBillingVersion: 2,
          requestId: "scheduled-free-2",
        },
      },
    ]);
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();

    const [settings, result] = await Promise.all([
      t
        .withIdentity({ subject: "pro_to_free_over_limits" })
        .query(api.organization.queries.getSettings, { shopId: ids.shopId }),
      t.run(async (ctx) => ({
        billingState: await ctx.db.get(ids.billingStateId),
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
        members: await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
        shops: await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
        operations: await ctx.db
          .query("organizationStripeOperations")
          .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
          .collect(),
      })),
    ]);
    expect(result.billingState?.state).toEqual({
      kind: "restricted",
      reason: "freeConditionsNotMet",
      previousPlan: "pro",
      recoveryManagerPersonIds: [ids.personId],
      previousActiveShopIds: [ids.shopId, ids.secondShopId],
      restrictedAt: effectiveAt,
    });
    expect(result.billingState).toMatchObject({
      freeManagerPersonId: ids.personId,
      version: 3,
      businessNotificationCutoffAt: effectiveAt,
      businessNotificationCutoffVersion: 3,
    });
    expect(result.billingState?.freeShopId).toBeUndefined();
    expect(result.people.filter((person) => person.status === "active")).toHaveLength(6);
    expect(result.members).toEqual([expect.objectContaining({ personId: ids.personId, status: "active" })]);
    expect(
      result.shops
        .filter((shop) => !shop.isDeleted)
        .map((shop) => ({ id: shop._id, operatingStatus: shop.operatingStatus })),
    ).toEqual([
      { id: ids.shopId, operatingStatus: "active" },
      { id: ids.secondShopId, operatingStatus: "active" },
    ]);
    expect(
      result.operations.map(({ kind, recoveryPurpose, requestKey, status }) => ({
        kind,
        recoveryPurpose,
        requestKey,
        status,
      })),
    ).toEqual([
      {
        kind: "reconcileSubscription",
        recoveryPurpose: "scheduledFreeDeadline",
        requestKey: "scheduled-free-2",
        status: "succeeded",
      },
    ]);
    expect(settings?.billing).toMatchObject({
      state: "restricted",
      currentPlan: null,
      previousPlan: "pro",
      peopleUsage: { current: 6, max: 5 },
      shopUsage: { current: 2, max: 1 },
    });
    expect(settings?.canAddShop).toBe(false);
  });

  it("料金なしのBusinessは40人5店舗まで利用でき、Stripeデータと課金通知を作らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "complimentary_pro_limits",
        complimentary: true,
      });
      for (let index = 1; index < 40; index += 1) {
        await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `complimentary_pro_staff_${index}`);
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      return { ...seeded, billingStateId: billingState._id };
    });
    const actor = t.withIdentity({ subject: "complimentary_pro_limits" });

    for (let index = 2; index <= 5; index += 1) {
      await expect(
        actor.mutation(api.organization.mutations.addShop, {
          shopId: ids.shopId,
          shopName: `第${index}店舗`,
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
          requestId: `complimentary-pro-shop-${index}`,
        }),
      ).resolves.toMatchObject({ changed: true, shopStatus: "active" });
    }
    const settings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(settings).toMatchObject({
      canAddShop: false,
      billing: {
        state: "business",
        currentPlan: "business",
        isComplimentary: true,
        peopleUsage: { current: 40, max: 40 },
        shopUsage: { current: 5, max: 5 },
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      },
    });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      stripeCustomers: await ctx.db.query("organizationStripeCustomers").collect(),
      stripeSubscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      stripeOperations: await ctx.db.query("organizationStripeOperations").collect(),
      stripeWebhookEvents: await ctx.db.query("stripeWebhookEvents").collect(),
      billingNotifications: (await ctx.db.query("notificationOutbox").collect()).filter(
        (job) => job.payload.kind === "email" && job.payload.context.startsWith("organizationBilling."),
      ),
    }));
    expect(result.billingState?.state).toEqual({ kind: "complimentary", plan: "pro" });
    expect(result.stripeCustomers).toEqual([]);
    expect(result.stripeSubscriptions).toEqual([]);
    expect(result.stripeOperations).toEqual([]);
    expect(result.stripeWebhookEvents).toEqual([]);
    expect(result.billingNotifications).toEqual([]);
  });
});
