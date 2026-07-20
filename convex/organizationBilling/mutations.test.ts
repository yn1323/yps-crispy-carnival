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

describe("organizationBilling/mutations Free管理者選択", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it("Trialでは削除済みuserの管理者を選択できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "free_trial_actor", plan: "business" });
      const target = await addManager(ctx, seeded.organizationId, "free_trial_deleted_user");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
      });
      await ctx.db.patch(target.userId, { isDeleted: true });
      return { ...seeded, targetPersonId: target.personId };
    });

    await expect(
      t.withIdentity({ subject: "free_trial_actor" }).mutation(api.organizationBilling.mutations.setFreeSelection, {
        shopId: ids.shopId,
        managerPersonId: ids.targetPersonId,
        freeShopId: ids.shopId,
        requestId: "trial-deleted-user",
      }),
    ).rejects.toThrow("無料で残す管理者を確認できません");
  });

  it("Trialではアカウント削除受付済みuserの管理者を選択できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "free_trial_requested_actor",
        plan: "pro",
      });
      const target = await addManager(ctx, seeded.organizationId, "free_trial_requested_user");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
      });
      await ctx.db.patch(target.userId, { accountDeletionRequestedAt: Date.now() });
      return { ...seeded, targetPersonId: target.personId };
    });

    await expect(
      t
        .withIdentity({ subject: "free_trial_requested_actor" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.targetPersonId,
          freeShopId: ids.shopId,
          requestId: "trial-requested-user",
        }),
    ).rejects.toThrow("無料で残す管理者を確認できません");
  });

  it("支払い猶予中はpersonとmemberのuserが一致しない管理者を選択できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "free_grace_actor", plan: "pro" });
      const target = await addManager(ctx, seeded.organizationId, "free_grace_mismatch");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "grace",
          plan: "pro",
          startedAt: Date.now(),
          endsAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
        },
      });
      await ctx.db.patch(target.personId, { userId: seeded.userId });
      return { ...seeded, targetPersonId: target.personId };
    });

    await expect(
      t.withIdentity({ subject: "free_grace_actor" }).mutation(api.organizationBilling.mutations.setFreeSelection, {
        shopId: ids.shopId,
        managerPersonId: ids.targetPersonId,
        freeShopId: ids.shopId,
        requestId: "grace-mismatched-user",
      }),
    ).rejects.toThrow("無料で残す管理者を確認できません");
  });

  it("契約制限中は復旧候補でもremoved memberを選択できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "free_restricted_actor", plan: "pro" });
      const target = await addManager(ctx, seeded.organizationId, "free_restricted_removed");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId, target.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: Date.now(),
        },
      });
      await ctx.db.patch(target.memberId, { status: "removed", updatedAt: Date.now() });
      return { ...seeded, targetPersonId: target.personId };
    });

    await expect(
      t
        .withIdentity({ subject: "free_restricted_actor" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.targetPersonId,
          freeShopId: ids.shopId,
          requestId: "restricted-removed-member",
        }),
    ).rejects.toThrow("無料で残す管理者を確認できません");
  });

  it("同じrequestIdは一度だけ適用し、監査へ生値を保存しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "free_idempotent_actor", plan: "pro" }),
    );
    const requestId = "free-selection-sensitive-request";
    const mutationArgs = {
      shopId: ids.shopId,
      managerPersonId: ids.personId,
      freeShopId: ids.shopId,
      requestId,
    };
    const actor = t.withIdentity({ subject: "free_idempotent_actor" });

    await expect(actor.mutation(api.organizationBilling.mutations.setFreeSelection, mutationArgs)).resolves.toEqual({
      changed: true,
      stateKind: "active",
    });
    await expect(actor.mutation(api.organizationBilling.mutations.setFreeSelection, mutationArgs)).resolves.toEqual({
      changed: false,
      stateKind: "active",
    });

    const requestKey = await toAuditRequestKey(requestId);
    const audits = await t.run((ctx) =>
      ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:free-selection:${requestKey}`),
        )
        .collect(),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]?.correlationId).not.toContain(requestId);
  });

  it("短すぎるrequestIdを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "free_short_request", plan: "pro" }));

    await expect(
      t.withIdentity({ subject: "free_short_request" }).mutation(api.organizationBilling.mutations.setFreeSelection, {
        shopId: ids.shopId,
        managerPersonId: ids.personId,
        freeShopId: ids.shopId,
        requestId: "short",
      }),
    ).rejects.toThrow(ConvexError);
  });

  it("active.freeでは直接呼ばれても設定・version・監査・通知を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "free_selection_active_free", plan: "free" }),
    );
    const before = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );

    await expect(
      t
        .withIdentity({ subject: "free_selection_active_free" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.personId,
          freeShopId: ids.shopId,
          requestId: "active-free-selection-rejected",
        }),
    ).rejects.toThrow("現在の契約状態では無料設定を変更できません");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.billingState?.version).toBe(before?.version);
    expect(result.billingState?.freeManagerPersonId).toBe(before?.freeManagerPersonId);
    expect(result.billingState?.freeShopId).toBe(before?.freeShopId);
    expect(result.audits.filter((audit) => audit.action === "organization.free_selection_changed")).toHaveLength(0);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/"))).toHaveLength(0);
  });

  it("無償Businessでは直接呼ばれてもFree設定・version・監査・通知を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "complimentary_free_selection",
        complimentary: true,
      }),
    );

    await expect(
      t
        .withIdentity({ subject: "complimentary_free_selection" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.personId,
          freeShopId: ids.shopId,
          requestId: "complimentary-free-selection",
        }),
    ).rejects.toThrow("先行登録特典のProでは無料設定を変更できません");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState).toMatchObject({
      state: { kind: "complimentary", plan: "pro" },
      version: 1,
    });
    expect(result.billingState?.freeManagerPersonId).toBeUndefined();
    expect(result.billingState?.freeShopId).toBeUndefined();
    expect(result.audits).toEqual([]);
    expect(result.scheduled.filter((job) => job.name.startsWith("organizationBilling/"))).toEqual([]);
  });

  it("契約制限中でFree条件を満たせない再評価は制限開始の副作用を再発行しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "restricted_free_reevaluation",
        plan: "pro",
      });
      const now = Date.now();
      for (let index = 0; index < 4; index += 1) {
        const email = `restricted-staff-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: personId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: now - 1_000,
        },
        businessNotificationCutoffAt: now - 1_000,
        businessNotificationCutoffVersion: 1,
      });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      return { ...seeded, billingStateId: billingState._id, restrictedAt: now - 1_000 };
    });
    const actor = t.withIdentity({ subject: "restricted_free_reevaluation" });
    const selection = {
      shopId: ids.shopId,
      managerPersonId: ids.personId,
      freeShopId: ids.shopId,
    };

    await expect(
      actor.mutation(api.organizationBilling.mutations.setFreeSelection, {
        ...selection,
        requestId: "restricted-free-reevaluation-1",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      billingState: await ctx.db.get(ids.billingStateId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toMatchObject({
      kind: "active",
      plan: "free",
    });
    expect(result.billingState?.version).toBe(3);
    expect(result.billingState?.businessNotificationCutoffAt).toBeGreaterThan(ids.restrictedAt);
    expect(result.billingState?.businessNotificationCutoffVersion).toBe(3);
    expect(result.audits.filter((audit) => audit.action === "organization.billing_state_changed")).toHaveLength(1);
    expect(result.audits.filter((audit) => audit.action === "organization.free_selection_changed")).toHaveLength(1);
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" && job.args[0]?.event === "freeApplied",
      ),
    ).toHaveLength(1);
  });

  it("契約制限中に一名を選んだ時点で他の復旧担当者の復旧権限を外す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "restricted_select_actor", plan: "pro" });
      const second = await addManager(ctx, seeded.organizationId, "restricted_select_other");
      const now = Date.now();
      for (let index = 0; index < 4; index += 1) {
        const email = `restricted-select-staff-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: personId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId, second.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: now,
        },
        businessNotificationCutoffAt: now,
        businessNotificationCutoffVersion: 1,
      });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      return { ...seeded, second };
    });

    await expect(
      t
        .withIdentity({ subject: "restricted_select_actor" })
        .mutation(api.organizationBilling.mutations.setFreeSelection, {
          shopId: ids.shopId,
          managerPersonId: ids.personId,
          freeShopId: ids.shopId,
          requestId: "restricted-select-single-recovery",
        }),
    ).resolves.toEqual({ changed: true, stateKind: "free" });

    const state = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      secondMember: await ctx.db.get(ids.second.memberId),
    }));
    expect(state.secondMember?.status).toBe("removed");
    expect(state.billingState?.state).toMatchObject({
      kind: "active",
      plan: "free",
    });

    await expect(
      t
        .withIdentity({ subject: "restricted_select_other" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "unauthorized-recovery@example.com",
          requestId: "restricted-removed-recovery-capability",
        }),
    ).rejects.toThrow("Not found");
  });

  it("契約制限中からの支払い結果待ちでも復旧担当者はFree選択を継続できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pending_restricted_recovery", plan: "pro" });
      const now = Date.now();
      for (let index = 0; index < 4; index += 1) {
        const email = `pending-restricted-staff-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: seeded.organizationId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: seeded.shopId,
          organizationId: seeded.organizationId,
          organizationPersonId: personId,
          name: `スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          restrictedFallbackState: {
            kind: "restricted",
            reason: "freeConditionsNotMet",
            previousPlan: "pro",
            recoveryManagerPersonIds: [seeded.personId],
            previousActiveShopIds: [seeded.shopId],
            restrictedAt: now - 1_000,
          },
          startedAt: now,
        },
        businessNotificationCutoffAt: now - 1_000,
        businessNotificationCutoffVersion: 1,
      });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      return seeded;
    });
    const actor = t.withIdentity({ subject: "pending_restricted_recovery" });

    await expect(
      actor.mutation(api.organizationBilling.mutations.setFreeSelection, {
        shopId: ids.shopId,
        managerPersonId: ids.personId,
        freeShopId: ids.shopId,
        requestId: "pending-restricted-free-selection",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state).toMatchObject({
      kind: "pendingActivation",
      fallback: "free",
    });
    expect(result.billingState?.version).toBe(2);
    expect(result.shop?.operatingStatus).toBe("active");
  });
});

describe("organizationBilling/mutations 請求先メール", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("同じrequestIdは一度だけ適用し、監査へ生値を保存しない", async () => {
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
    await expect(actor.mutation(api.organizationBilling.mutations.updateBillingEmail, args)).resolves.toEqual({
      changed: false,
    });

    const requestKey = await toAuditRequestKey(requestId);
    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) =>
          q.eq("correlationId", `${ids.organizationId}:billing-email:${requestKey}`),
        )
        .collect(),
      organization: await ctx.db.get(ids.organizationId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.organization).toMatchObject({
      billingEmail: "Billing@Example.com",
      billingEmailNormalized: "billing@example.com",
    });
    expect(result.audits).toHaveLength(1);
    expect(result.audits[0]?.correlationId).not.toContain(requestId);
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "billingEmailChanged",
      ),
    ).toHaveLength(1);
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
    ).rejects.toThrow("グループの契約情報を確認中です");

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
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "billingEmailChanged",
      ),
    ).toHaveLength(0);
  });

  it("無償Businessでは直接呼ばれても請求先・監査・通知を変更しない", async () => {
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
    ).rejects.toThrow("料金なしのProでは請求先メールアドレスを変更できません");

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
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "billingEmailChanged",
      ),
    ).toHaveLength(1);
  });

  it("契約制限中からの支払い結果待ちは復旧担当者が請求先メールを変更できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "billing_email_pending_restricted",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      const now = Date.now();
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          restrictedFallbackState: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [seeded.personId],
            previousActiveShopIds: [seeded.shopId],
            restrictedAt: now - 1_000,
          },
          startedAt: now,
        },
        version: 2,
      });
      return seeded;
    });

    await expect(
      t
        .withIdentity({ subject: "billing_email_pending_restricted" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "pending-recovery-billing@example.com",
          requestId: "pending-restricted-billing-email",
        }),
    ).resolves.toEqual({ changed: true });

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      organization: await ctx.db.get(ids.organizationId),
    }));
    expect(result.billingState?.state).toMatchObject({ kind: "pendingActivation", fallback: "restricted" });
    expect(result.billingState?.version).toBe(2);
    expect(result.organization?.billingEmail).toBe("pending-recovery-billing@example.com");
  });

  it("契約制限fallbackの復旧snapshotが欠損した支払い結果待ちは請求先変更をfail-closedにする", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "billing_email_missing_restricted_fallback",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "restricted",
          startedAt: Date.now(),
        },
        version: 2,
      });
      return seeded;
    });

    await expect(
      t
        .withIdentity({ subject: "billing_email_missing_restricted_fallback" })
        .mutation(api.organizationBilling.mutations.updateBillingEmail, {
          shopId: ids.shopId,
          email: "must-not-change@example.com",
          requestId: "missing-restricted-fallback-billing-email",
        }),
    ).rejects.toThrow("契約制限中の復旧操作ではありません");
    await expect(t.run(async (ctx) => (await ctx.db.get(ids.organizationId))?.billingEmail)).resolves.toBe(
      "billing_email_missing_restricted_fallback@example.com",
    );
  });
});

describe("organizationBilling/mutations 検証済み課金遷移", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("無償Businessでは検証済み課金更新を直接呼んでも状態・監査・通知を変更しない", async () => {
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
    ).rejects.toThrow("現在の契約状態からこの変更は適用できません");

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

  it("Freeから支払い猶予への飛び越しを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "invalid_free_grace", plan: "free" }));

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "grace", plan: "pro", firstFailureAt: Date.now() },
        correlationId: "invalid-free-to-grace",
      }),
    ).rejects.toThrow("現在の契約状態からこの変更は適用できません");

    const billingState = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billingState?.state).toEqual({ kind: "active", plan: "free" });
    expect(billingState?.version).toBe(1);
  });

  it("契約制限中から支払い猶予への飛び越しを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "invalid_restricted_grace", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: Date.now(),
        },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "grace", plan: "pro", firstFailureAt: Date.now() },
        correlationId: "invalid-restricted-to-grace",
      }),
    ).rejects.toThrow("現在の契約状態からこの変更は適用できません");
  });

  it("Trialから期間末プラン変更への飛び越しを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "invalid_trial_scheduled", plan: "business" });
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
        },
        correlationId: "invalid-trial-to-scheduled",
      }),
    ).rejects.toThrow("現在の契約状態からこの変更は適用できません");
  });

  it("予約枠を含む利用人数がPro上限を超えるBusinessからの変更予約を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "business_to_pro_over_limit",
        plan: "business",
      });
      for (let index = 0; index < 14; index += 1) {
        await addManager(ctx, seeded.organizationId, `business_to_pro_manager_${index}`);
      }
      const now = Date.now();
      await ctx.db.insert("organizationInvitations", {
        organizationId: seeded.organizationId,
        email: "reserved-pro-seat@example.com",
        emailNormalized: "reserved-pro-seat@example.com",
        tokenDigest: "reserved-pro-seat-token-digest",
        status: "pending",
        purpose: "managerAddition",
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
          targetPlan: "free",
          effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
        correlationId: "business-to-pro-over-limit",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "scheduledChange" });

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db
        .query("organizationAuditEvents")
        .withIndex("by_correlationId", (q) => q.eq("correlationId", "business-to-pro-over-limit"))
        .collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    }));
    expect(result.billingState?.state).toMatchObject({
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
    });
    expect(result.billingState?.version).toBe(2);
    expect(result.audits).toHaveLength(1);
  });

  it.each([
    { label: "ProからFree", currentPlan: "pro", targetPlan: "free" },
    { label: "BusinessからPro", currentPlan: "business", targetPlan: "pro" },
  ] as const)("$labelの期間末変更予約を明示eventで取り消し、全有効管理者へ通知する", async (plan) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `cancel_${plan.currentPlan}_${plan.targetPlan}`,
        plan: plan.currentPlan,
      });
      const secondManager = await addManager(
        ctx,
        seeded.organizationId,
        `cancel_${plan.currentPlan}_${plan.targetPlan}_second`,
      );
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "scheduledChange",
          currentPlan: plan.currentPlan,
          targetPlan: plan.targetPlan,
          effectiveAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
        },
      });
      return { ...seeded, secondManagerUserId: secondManager.userId, billingStateId: billingState._id };
    });
    const correlationId = `cancel-${plan.currentPlan}-${plan.targetPlan}`;
    const expectedPlan = "pro";

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
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "scheduledChangeCanceled",
      ),
    ).toHaveLength(1);

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "scheduledChangeCanceled",
        eventKey: correlationId,
      }),
    ).resolves.toEqual({ enqueuedCount: 2 });
    const outbox = await t.run(async (ctx) =>
      (await ctx.db.query("notificationOutbox").collect()).filter(
        (job) => job.organizationId === ids.organizationId && job.status === "pending",
      ),
    );
    expect(outbox.map((job) => job.userId).sort()).toEqual([ids.userId, ids.secondManagerUserId].sort());
    expect(
      outbox.every(
        (job) => job.payload.kind === "email" && job.payload.context === "organizationBilling.scheduledChangeCanceled",
      ),
    ).toBe(true);
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
        state: { kind: "pendingActivation", plan: "pro", fallback: "free" },
        correlationId: "pending-free-start",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "paymentFailed" },
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
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "paidActivationFailedFreeContinued",
      ),
    ).toHaveLength(1);
  });

  it("契約制限中からの即時支払い失敗はrestrictedへ戻して復旧対象を保つ", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pending_failure_restricted", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: now,
        },
        businessNotificationCutoffAt: now - 1_000,
        businessNotificationCutoffVersion: 1,
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "pendingActivation", plan: "pro", fallback: "restricted" },
        correlationId: "pending-restricted-start",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pendingActivation" });
    const pendingState = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(pendingState?.state).toEqual({
      kind: "pendingActivation",
      plan: "pro",
      fallback: "restricted",
      restrictedFallbackState: {
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: "pro",
        recoveryManagerPersonIds: [ids.personId],
        previousActiveShopIds: [ids.shopId],
        restrictedAt: now,
      },
      startedAt: now,
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "paymentFailed" },
        correlationId: "pending-restricted-payment-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "restricted" });
    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(result.billingState?.state).toEqual({
      kind: "restricted",
      reason: "paymentGraceExpired",
      previousPlan: "pro",
      recoveryManagerPersonIds: [ids.personId],
      previousActiveShopIds: [ids.shopId],
      restrictedAt: now,
    });
    expect(result.billingState).toMatchObject({
      version: 3,
      businessNotificationCutoffAt: now - 1_000,
      businessNotificationCutoffVersion: 1,
    });
    expect(
      result.scheduled.some(
        (job) =>
          job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications" &&
          job.args[0]?.cutoffVersion === 3,
      ),
    ).toBe(false);
    expect(
      result.scheduled.filter(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "paidActivationFailedRestrictedContinued",
      ),
    ).toHaveLength(1);
  });

  it("restricted fallback snapshotが欠落した即時支払い失敗は復旧対象を推測せず副作用なしで拒否する", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "pending_failure_missing_restricted_snapshot",
        plan: "pro",
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await Promise.all([
        ctx.db.patch(billingState._id, {
          state: {
            kind: "pendingActivation",
            plan: "business",
            fallback: "restricted",
            startedAt: now,
          },
        }),
        ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: now }),
        ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" }),
      ]);
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "paymentFailed" },
        correlationId: "pending-restricted-missing-snapshot-payment-failed",
      }),
    ).rejects.toThrow("契約制限中の復旧情報を確認できません");

    const result = await t.run(async (ctx) => ({
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      member: await ctx.db.get(ids.memberId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState).toMatchObject({
      state: {
        kind: "pendingActivation",
        plan: "business",
        fallback: "restricted",
        startedAt: now,
      },
      version: 1,
    });
    expect(result.member?.status).toBe("readOnly");
    expect(result.shop?.operatingStatus).toBe("planSuspended");
    expect(result.audits).toEqual([]);
    expect(result.scheduled).toEqual([]);
  });

  it("pendingActivation以外のpaymentFailedイベントを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "invalid_payment_failed_event", plan: "pro" }),
    );

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "paymentFailed" },
        correlationId: "invalid-payment-failed-event",
      }),
    ).rejects.toThrow("現在の契約状態からこの変更は適用できません");
  });

  it("Freeからの有料契約開始は管理者と店舗の復旧対象を両方指定するまで確定しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: "restore_partial_selection", plan: "free" }),
    );

    await t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
      organizationId: ids.organizationId,
      expectedVersion: 1,
      state: { kind: "pendingActivation", plan: "pro", fallback: "free" },
      correlationId: "restore-partial-start",
    });
    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.personId],
        correlationId: "restore-partial-success",
      }),
    ).rejects.toThrow("再開する管理者と店舗を確認してください");

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      member: await ctx.db.get(ids.memberId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state.kind).toBe("pendingActivation");
    expect(result.billingState?.version).toBe(2);
    expect(result.member?.status).toBe("active");
    expect(result.shop?.operatingStatus).toBe("active");
  });

  it("猶予中の支払い復旧では管理者・店舗の復旧対象を受け取らず既存状態を維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "grace_restore_selection", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "grace", plan: "pro", startedAt: 100, endsAt: 200 },
      });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.personId],
        restoreShopIds: [ids.shopId],
        correlationId: "grace-restore-selection",
      }),
    ).rejects.toThrow("現在の契約状態では復旧対象を指定できません");

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      member: await ctx.db.get(ids.memberId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state.kind).toBe("grace");
    expect(result.billingState?.version).toBe(1);
    expect(result.member?.status).toBe("active");
    expect(result.shop?.operatingStatus).toBe("active");
  });

  it("personとmemberのuserが一致しない復旧対象では有料プランも管理権限も有効化しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "restore_mismatched_user", plan: "pro" });
      const mismatchedUserId = await seedUser(ctx, "restore_mismatched_other_user");
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      const now = Date.now();
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: now,
        },
      });
      await ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: now });
      await ctx.db.patch(seeded.personId, { userId: mismatchedUserId, updatedAt: now });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      return { ...seeded, billingStateId: billingState._id };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.personId],
        restoreShopIds: [ids.shopId],
        correlationId: "restore-mismatched-user",
      }),
    ).rejects.toThrow("再開する管理者を確認できません");

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      member: await ctx.db.get(ids.memberId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state.kind).toBe("restricted");
    expect(result.billingState?.version).toBe(1);
    expect(result.member?.status).toBe("readOnly");
    expect(result.shop?.operatingStatus).toBe("planSuspended");
  });

  it("支払い猶予の期限処理は削除済み店舗を復旧対象に含めない", async () => {
    const now = new Date("2026-07-17T00:00:00.000Z").getTime();
    const deadlineAt = now + 1_000;
    vi.setSystemTime(now);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "grace_deleted_shop", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      const deletedShopId = await ctx.db.insert("shops", {
        organizationId: seeded.organizationId,
        operatingStatus: "active",
        name: "削除済み店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: true,
      });
      await ctx.db.patch(billingState._id, {
        state: { kind: "grace", plan: "pro", startedAt: now - 1_000, endsAt: deadlineAt },
        updatedAt: now,
      });
      return { ...seeded, deletedShopId };
    });

    vi.setSystemTime(deadlineAt);
    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: deadlineAt,
      }),
    ).resolves.toEqual({ changed: false, stateKind: "grace" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.expireVerifiedPaymentGrace, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedEndsAt: deadlineAt,
        correlationId: "verified-grace-expired-deleted-shop",
      }),
    ).resolves.toEqual({ changed: true, billingVersion: 2 });

    const billingState = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billingState?.state).toMatchObject({
      kind: "restricted",
      previousActiveShopIds: [ids.shopId],
    });
    if (billingState?.state.kind !== "restricted") throw new Error("restricted state not found");
    expect(billingState.state.previousActiveShopIds).not.toContain(ids.deletedShopId);
  });

  it("同じpersonにmembershipが重複する復旧対象では有料プランも管理権限も有効化しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "restore_duplicate_member", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      const now = Date.now();
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: now,
        },
      });
      await ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: now });
      const duplicateMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: seeded.organizationId,
        personId: seeded.personId,
        userId: seeded.userId,
        status: "readOnly",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      return { ...seeded, billingStateId: billingState._id, duplicateMemberId };
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        state: { kind: "active", plan: "pro" },
        restoreManagerPersonIds: [ids.personId],
        restoreShopIds: [ids.shopId],
        correlationId: "restore-duplicate-member",
      }),
    ).rejects.toThrow("再開する管理者を確認できません");

    const result = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(ids.billingStateId),
      members: await Promise.all([ctx.db.get(ids.memberId), ctx.db.get(ids.duplicateMemberId)]),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billingState?.state.kind).toBe("restricted");
    expect(result.billingState?.version).toBe(1);
    expect(result.members.map((member) => member?.status)).toEqual(["readOnly", "readOnly"]);
    expect(result.shop?.operatingStatus).toBe("planSuspended");
  });
});

describe("organizationBilling/mutations first trial invoice", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("paid result wins atomically and makes the deadline job stale", async () => {
    const deadlineAt = Date.parse("2026-07-20T00:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_invoice_paid", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: deadlineAt, selectedPaidPlan: "pro" },
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
    ).resolves.toEqual({ changed: true, stateKind: "pro" });
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
    expect(snapshot.billingState).toMatchObject({ state: { kind: "active", plan: "pro" }, version: 3 });
    expect(snapshot.audits.map((audit) => audit.correlationId)).toEqual(
      expect.arrayContaining(["trial-invoice-paid:initial-payment-pending", "trial-invoice-paid"]),
    );
  });

  it("failed result converges after the deadline job created initial pending", async () => {
    const deadlineAt = Date.parse("2026-07-21T00:00:00.000Z");
    vi.setSystemTime(deadlineAt);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_invoice_failed", plan: "pro" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: deadlineAt, selectedPaidPlan: "pro" },
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
    ).resolves.toEqual({ changed: true, stateKind: "grace" });

    const billingState = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billingState).toMatchObject({
      state: { kind: "grace", plan: "pro", startedAt: deadlineAt },
      version: 3,
    });
  });
});

describe("organizationBilling/mutations Stripe commands", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("stores and clears the Pro choice without ending the trial", async () => {
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
      t.mutation(internal.organizationBilling.mutations.selectTrialPro, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        correlationId: "trial-pro-selected",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "trial" });
    await expect(
      t.mutation(internal.organizationBilling.mutations.clearTrialPro, {
        organizationId: ids.organizationId,
        expectedVersion: 2,
        correlationId: "trial-pro-cleared",
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
      expect.arrayContaining(["trial-pro-selected", "trial-pro-cleared"]),
    );
  });

  it("restricts a paid organization after an unexpected provider cancellation", async () => {
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
    ).resolves.toEqual({ changed: true, stateKind: "restricted" });

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
      state: {
        kind: "restricted",
        reason: "unexpectedCancellation",
        previousPlan: "pro",
        recoveryManagerPersonIds: [ids.personId],
        previousActiveShopIds: [ids.shopId],
      },
      businessNotificationCutoffAt: now,
      businessNotificationCutoffVersion: 2,
      version: 2,
    });
    expect(snapshot.audits.map((audit) => audit.correlationId)).toContain("unexpected-pro-cancellation");
  });
});
