import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { PAYMENT_GRACE_PERIOD_MS } from "../organizationBilling/policy";

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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("Trial終了時にFree条件を再確認し、同じ期限処理を一度だけ適用する", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_free", plan: "business" });
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

  it("契約選択済みTrialの期限処理は初回請求処理中へ一度だけ移行し業務通知cutoffを開始しない", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_selected_paid", plan: "business" });
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

  it("Trial終了時に管理者を選べなければデータを残したまま契約制限中へ移る", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(now);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_restricted", plan: "business" });
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

  it("猶予終了後は制限し、確認済みの対象だけを上限内で復旧する", async () => {
    const t = convexTest(schema, modules);
    const now = new Date("2026-10-15T12:00:00+09:00");
    vi.setSystemTime(now);
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
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "grace",
          plan: "pro",
          startedAt: now.getTime() - 14 * 24 * 60 * 60 * 1000,
          endsAt: now.getTime(),
        },
        version: 8,
        updatedAt: now.getTime() - 1,
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

    await t.mutation(internal.organizationBilling.mutations.processDeadline, {
      organizationId: ids.organizationId,
      expectedVersion: 8,
      expectedDeadlineAt: now.getTime(),
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.secondMemberId, { status: "readOnly", updatedAt: now.getTime() });
      await ctx.db.patch(ids.secondShopId, { operatingStatus: "planSuspended" });
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 9,
        state: { kind: "active", plan: "pro" },
        correlationId: "verified-recovery-1",
      }),
    ).rejects.toThrow("再開する管理者と店舗を確認してください");

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 9,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.firstPersonId, ids.firstPersonId],
        restoreShopIds: [ids.shopId],
        correlationId: "verified-recovery-duplicate",
      }),
    ).rejects.toThrow("復旧対象が重複しています");

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 9,
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
      version: 10,
      businessNotificationCutoffAt: now.getTime(),
      businessNotificationCutoffVersion: 9,
    });
    expect(result.firstMember?.status).toBe("active");
    expect(result.secondMember?.status).toBe("readOnly");
    expect(result.firstShop?.operatingStatus).toBe("active");
    expect(result.secondShop?.operatingStatus).toBe("planSuspended");
  });

  it("最初の支払い失敗から14日間だけ猶予し、再試行で期限を延長しない", async () => {
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

  it("BusinessからProへの変更時に上限を超えていればBusinessを継続して専用通知を送る", async () => {
    const t = convexTest(schema, modules);
    const effectiveAt = Date.parse("2026-11-01T00:00:00+09:00");
    vi.setSystemTime(effectiveAt);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pro_downgrade_blocked", plan: "business" });
      for (let index = 0; index < 15; index += 1) {
        await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `pro_limit_staff_${index}`);
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "scheduledChange", currentPlan: "business", targetPlan: "pro", effectiveAt },
        version: 4,
        updatedAt: effectiveAt - 1,
      });
      return { ...seeded, billingStateId: billingState._id };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 4,
        expectedDeadlineAt: effectiveAt,
      }),
    ).resolves.toEqual({ changed: true, stateKind: "business" });
    vi.advanceTimersByTime(0);
    await t.finishInProgressScheduledFunctions();

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "business" });
    expect(result.outbox).toHaveLength(1);
    expect(result.outbox[0]?.payload).toMatchObject({
      kind: "email",
      context: "organizationBilling.proDowngradeNotApplied",
    });
    if (result.outbox[0]?.payload.kind !== "email") throw new Error("email payload not found");
    expect(result.outbox[0].payload.html).toContain("Businessプランを継続しています");
    expect(result.outbox[0].payload.html).not.toContain("有料プランを開始しました");
  });

  it("Trial期限時に選択管理者のuserが削除済みならactive.freeへ移行しない", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");
    vi.setSystemTime(trialEndsAt);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "trial_invalid_free_manager",
        plan: "business",
      });
      const selected = await addManager(ctx, seeded.organizationId, "trial_deleted_selected_manager");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt },
        freeManagerPersonId: selected.personId,
        freeShopId: seeded.shopId,
        version: 6,
        updatedAt: trialEndsAt - 1,
      });
      await ctx.db.patch(selected.userId, { isDeleted: true });
      return { ...seeded, selectedPersonId: selected.personId, billingStateId: billingState._id };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 6,
        expectedDeadlineAt: trialEndsAt,
      }),
    ).resolves.toEqual({ changed: true, stateKind: "restricted" });

    const billingState = await t.run((ctx) => ctx.db.get(ids.billingStateId));
    expect(billingState?.state).toEqual({
      kind: "restricted",
      reason: "trialFreeConditionsNotMet",
      recoveryManagerPersonIds: [ids.personId],
      previousActiveShopIds: [ids.shopId],
      restrictedAt: trialEndsAt,
    });
    expect(billingState?.state).not.toEqual({ kind: "active", plan: "free" });
  });

  it("支払い結果確認中はFree設定を変更できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pending_free_selection", plan: "free" });
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
      return seeded;
    });

    await expect(
      t
        .withIdentity({ subject: "pending_free_selection" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.personId,
          freeShopId: ids.shopId,
          requestId: "pending-selection",
        }),
    ).rejects.toThrow(ConvexError);
  });

  it("無償Businessでは二店舗目を追加しても課金状態を維持し、期限処理と課金通知を予約しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "complimentary_business_second_shop",
        complimentary: true,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      return { ...seeded, billingStateId: billingState._id };
    });
    const actor = t.withIdentity({ subject: "complimentary_business_second_shop" });

    const created = await actor.mutation(api.organization.mutations.addShop, {
      shopId: ids.shopId,
      shopName: "二店舗目",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      requestId: "complimentary-business-second-shop",
    });
    const settings = await actor.query(api.organization.queries.getSettings, { shopId: ids.shopId });

    expect(created).toMatchObject({ changed: true, shopStatus: "active" });
    expect(settings).toMatchObject({
      billing: {
        state: "business",
        currentPlan: "business",
        isComplimentary: true,
        peopleUsage: { max: 30 },
        shopUsage: { current: 2, max: 5 },
        canManagePlan: false,
        canUpdatePaymentMethod: false,
        canUpdateBillingEmail: false,
        canScheduleFree: false,
      },
    });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      billingNotifications: (await ctx.db.query("notificationOutbox").collect()).filter(
        (job) => job.payload.kind === "email" && job.payload.context.startsWith("organizationBilling."),
      ),
      scheduledBillingJobs: (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) =>
          job.name === "organizationBilling/mutations:processDeadline" ||
          job.name === "organizationBilling/actions:enqueueBillingNotification",
      ),
    }));
    expect(result.billingState?.state).toEqual({ kind: "complimentary", plan: "business" });
    expect(result.billingNotifications).toEqual([]);
    expect(result.scheduledBillingJobs).toEqual([]);
  });
});
