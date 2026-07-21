import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PAYMENT_GRACE_PERIOD_MS } from "../organizationBilling/policy";

const SCENARIO_NOW = Date.parse("2026-12-10T10:00:00+09:00");

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
  const staffId = await ctx.db.insert("staffs", {
    organizationId,
    organizationPersonId: personId,
    shopId,
    name: `スタッフ ${subject}`,
    email,
    emailNormalized: email,
    isDeleted: false,
  });
  return { personId, staffId };
}

async function addManager(ctx: MutationCtx, organizationId: Id<"organizations">, subject: string) {
  const userId = await seedUser(ctx, subject);
  const now = Date.now();
  const email = `${subject}@example.com`;
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: `管理者 ${subject}`,
    email,
    emailNormalized: email,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
}

async function addShop(ctx: MutationCtx, organizationId: Id<"organizations">, name: string) {
  return await ctx.db.insert("shops", {
    organizationId,
    operatingStatus: "active",
    name,
    submissionPattern: { kind: "dateOnly" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedTrialBusiness(ctx: MutationCtx, subject: string, trialEndsAt: number) {
  const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
  const billingState = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
    .unique();
  if (!billingState) throw new Error("billing state not found");
  await ctx.db.patch(billingState._id, {
    state: { kind: "trial", trialEndsAt, selectedPaidPlan: "business" },
    updatedAt: Date.now(),
  });
  return { ...seeded, billingStateId: billingState._id };
}

async function seedComplimentaryAtLimits(ctx: MutationCtx, args: { subject: string; storedPlan: "pro" | "business" }) {
  const seeded = await seedOrganizationManagerShop(ctx, {
    subject: args.subject,
    complimentary: true,
  });
  const billingState = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
    .unique();
  if (!billingState) throw new Error("billing state not found");
  await ctx.db.patch(billingState._id, {
    state: { kind: "complimentary", plan: args.storedPlan },
    updatedAt: Date.now(),
  });

  for (let index = 1; index <= 4; index += 1) {
    await addManager(ctx, seeded.organizationId, `${args.subject}_manager_${index}`);
    await addShop(ctx, seeded.organizationId, `${args.subject} 第${index + 1}店舗`);
  }
  const staffPeople = [];
  for (let index = 1; index <= 35; index += 1) {
    staffPeople.push(await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `${args.subject}_staff_${index}`));
  }
  return { ...seeded, billingStateId: billingState._id, staffPeople };
}

describe("有料プラン変更シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("TrialからBusinessは初回支払い確認中までPro相当を維持し、支払い成功後だけBusinessになる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedTrialBusiness(ctx, "trial_business_paid", SCENARIO_NOW));
    const actor = t.withIdentity({ subject: "trial_business_paid" });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: SCENARIO_NOW,
      }),
    ).resolves.toEqual({ changed: true, stateKind: "initialPaymentPending" });

    const pendingSettings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(pendingSettings?.billing).toMatchObject({
      state: "initialPaymentPending",
      currentPlan: "pro",
      targetPlan: "business",
      peopleUsage: { current: 1, max: 20, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        trialEndsAt: SCENARIO_NOW,
        result: "paid",
        correlationId: "trial-business-first-invoice-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "business" });

    const activeSettings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(activeSettings?.billing).toMatchObject({
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 1, max: 40, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });

    const billingState = await t.run((ctx) => ctx.db.get(ids.billingStateId));
    expect(billingState?.state).toEqual({ kind: "active", plan: "business" });
  });

  it("TrialからBusinessの初回支払い失敗はPro entitlementのgraceとなり、再支払い成功後だけBusinessになる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedTrialBusiness(ctx, "trial_business_failed", SCENARIO_NOW));
    const actor = t.withIdentity({ subject: "trial_business_failed" });

    await t.mutation(internal.organizationBilling.mutations.processDeadline, {
      organizationId: ids.organizationId,
      expectedVersion: 1,
      expectedDeadlineAt: SCENARIO_NOW,
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        trialEndsAt: SCENARIO_NOW,
        result: "failed",
        firstFailureAt: SCENARIO_NOW,
        correlationId: "trial-business-first-invoice-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "grace" });

    const graceSettings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(graceSettings?.billing).toMatchObject({
      state: "grace",
      currentPlan: "pro",
      targetPlan: "business",
      peopleUsage: { current: 1, max: 20, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });
    const graceState = await t.run((ctx) => ctx.db.get(ids.billingStateId));
    expect(graceState?.state).toEqual({
      kind: "grace",
      plan: "pro",
      targetPlan: "business",
      startedAt: SCENARIO_NOW,
      endsAt: SCENARIO_NOW + PAYMENT_GRACE_PERIOD_MS,
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 3,
        state: { kind: "active", plan: "business" },
        correlationId: "trial-business-retry-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "business" });
    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 1, max: 40, pendingInvitations: 0 },
    });
  });

  it("ProからBusinessはprovider確認までProを維持し、失敗時はProへ戻り成功時だけBusinessになる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "pro_business_pending", plan: "pro" }),
    );
    const actor = t.withIdentity({ subject: "pro_business_pending" });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "pendingActivation", plan: "business", fallback: "pro" },
        correlationId: "pro-business-pending-first",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "pendingActivation",
      currentPlan: "pro",
      targetPlan: "business",
      peopleUsage: { current: 1, max: 20, pendingInvitations: 0 },
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "paymentFailed" },
        correlationId: "pro-business-payment-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pro" });
    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 1, max: 20, pendingInvitations: 0 },
    });

    await t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: ids.organizationId,
      expectedVersion: 3,
      state: { kind: "pendingActivation", plan: "business", fallback: "pro" },
      correlationId: "pro-business-pending-retry",
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 4,
        state: { kind: "active", plan: "business" },
        correlationId: "pro-business-payment-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "business" });
    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 1, max: 40, pendingInvitations: 0 },
    });
  });

  it("BusinessからProは期間末までBusinessを維持し、21人ならPro対象restrictedを経て人物削除後にProへ復旧する", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = SCENARIO_NOW + 30 * 24 * 60 * 60 * 1000;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "business_pro_over_limit",
        plan: "business",
      });
      const extraPeople = [];
      for (let index = 1; index <= 20; index += 1) {
        extraPeople.push(
          await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `business_pro_over_limit_staff_${index}`),
        );
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      return { ...seeded, billingStateId: billingState._id, removalTarget: extraPeople.at(-1) };
    });
    const removalTarget = ids.removalTarget;
    if (!removalTarget) throw new Error("removal target not found");
    const actor = t.withIdentity({ subject: "business_pro_over_limit" });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt },
        correlationId: "business-pro-scheduled",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "scheduledChange" });
    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      peopleUsage: { current: 21, max: 40, pendingInvitations: 0 },
    });

    vi.setSystemTime(effectiveAt);
    await expect(
      t.mutation(internal.organizationBilling.mutations.confirmScheduledPaidPlanDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        expectedDeadlineAt: effectiveAt,
        result: "paid",
        correlationId: "business-pro-provider-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "restricted" });

    const restrictedSettings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(restrictedSettings?.billing).toMatchObject({
      state: "restricted",
      previousPlan: "business",
      targetPlan: "pro",
      limitPlan: "pro",
      peopleUsage: { current: 21, max: 20, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
      requiredReductions: { people: 1, shops: 0, managers: 0 },
    });
    const restrictedState = await t.run((ctx) => ctx.db.get(ids.billingStateId));
    expect(restrictedState?.state).toMatchObject({
      kind: "restricted",
      reason: "planLimitExceeded",
      previousPlan: "business",
      targetPlan: "pro",
      limitPlan: "pro",
    });

    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, {
        shopId: ids.shopId,
        personId: removalTarget.personId,
        requestId: "business-pro-remove-one-person",
      }),
    ).resolves.toEqual({ changed: true });
    const reconcileJobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) =>
          job.name === "organizationBilling/mutations:reconcileRestrictedPlanEligibility" &&
          job.args[0]?.billingStateId === ids.billingStateId &&
          job.args[0]?.expectedVersion === 3,
      ),
    );
    expect(reconcileJobs).toHaveLength(1);
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();

    const restoredSettings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });
    expect(restoredSettings?.billing).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 20, max: 20, pendingInvitations: 0 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
    });
    const restored = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      person: await ctx.db.get(removalTarget.personId),
      staff: await ctx.db.get(removalTarget.staffId),
    }));
    expect(restored.billingState?.state).toEqual({ kind: "active", plan: "pro" });
    expect(restored.person?.status).toBe("removed");
    expect(restored.staff?.isDeleted).toBe(true);
  });

  it("BusinessからProの期間末請求失敗はBusiness entitlementのgraceとtarget Proを維持する", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = SCENARIO_NOW + 30 * 24 * 60 * 60 * 1000;
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "business_pro_failed", plan: "business" }),
    );
    const actor = t.withIdentity({ subject: "business_pro_failed" });

    await t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: ids.organizationId,
      expectedVersion: 1,
      state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt },
      correlationId: "business-pro-failed-scheduled",
    });
    vi.setSystemTime(effectiveAt);
    await expect(
      t.mutation(internal.organizationBilling.mutations.confirmScheduledPaidPlanDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        expectedDeadlineAt: effectiveAt,
        result: "failed",
        firstFailureAt: effectiveAt,
        correlationId: "business-pro-provider-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "grace" });

    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "grace",
      currentPlan: "business",
      targetPlan: "pro",
      peopleUsage: { current: 1, max: 40, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });
    const billingState = await t.run(async (ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billingState?.state).toEqual({
      kind: "grace",
      plan: "business",
      targetPlan: "pro",
      startedAt: effectiveAt,
      endsAt: effectiveAt + PAYMENT_GRACE_PERIOD_MS,
    });
  });

  it("BusinessからProの変更予定を取り消すとBusinessを維持する", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = SCENARIO_NOW + 30 * 24 * 60 * 60 * 1000;
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "business_pro_cancel", plan: "business" }),
    );
    const actor = t.withIdentity({ subject: "business_pro_cancel" });

    await t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: ids.organizationId,
      expectedVersion: 1,
      state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt },
      correlationId: "business-pro-cancel-scheduled",
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "scheduledChangeCanceled" },
        correlationId: "business-pro-schedule-canceled",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "business" });

    expect((await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId }))?.billing).toMatchObject({
      state: "business",
      currentPlan: "business",
      peopleUsage: { current: 1, max: 40, pendingInvitations: 0 },
    });
  });

  it("complimentary.proとcomplimentary.businessはともにBusiness上限を使い、Stripe行と課金通知を作らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => ({
      legacy: await seedComplimentaryAtLimits(ctx, {
        subject: "complimentary_pro_compatibility",
        storedPlan: "pro",
      }),
      current: await seedComplimentaryAtLimits(ctx, {
        subject: "complimentary_business",
        storedPlan: "business",
      }),
    }));

    const [legacySettings, currentSettings] = await Promise.all([
      t
        .withIdentity({ subject: "complimentary_pro_compatibility" })
        .query(api.organization.queries.getSettings, { shopId: ids.legacy.shopId }),
      t
        .withIdentity({ subject: "complimentary_business" })
        .query(api.organization.queries.getSettings, { shopId: ids.current.shopId }),
    ]);
    for (const settings of [legacySettings, currentSettings]) {
      expect(settings?.billing).toMatchObject({
        state: "business",
        currentPlan: "business",
        isComplimentary: true,
        peopleUsage: { current: 40, max: 40, pendingInvitations: 0 },
        shopUsage: { current: 5, max: 5, pendingInvitations: 0 },
        managerUsage: { current: 5, max: 5, pendingInvitations: 0 },
        requiredReductions: { people: 0, shops: 0, managers: 0 },
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      });
    }

    const sideEffects = await t.run(async (ctx) => ({
      stripeCustomers: await ctx.db.query("organizationStripeCustomers").collect(),
      stripeSubscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      stripeOperations: await ctx.db.query("organizationStripeOperations").collect(),
      stripeWebhookEvents: await ctx.db.query("stripeWebhookEvents").collect(),
      notifications: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(sideEffects).toEqual({
      stripeCustomers: [],
      stripeSubscriptions: [],
      stripeOperations: [],
      stripeWebhookEvents: [],
      notifications: [],
    });
  });
});
