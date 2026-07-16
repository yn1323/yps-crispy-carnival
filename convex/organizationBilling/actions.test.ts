import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("organizationBilling/actions", () => {
  it("課金通知を管理者ごとのemailだけでOutboxへ積み、同じeventKeyを重複させない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "billing_notice", plan: "pro" }));

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "planActivated",
        eventKey: "plan-activated-1",
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });
    await t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
      organizationId: ids.organizationId,
      event: "planActivated",
      eventKey: "plan-activated-1",
    });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      organizationId: ids.organizationId,
      userId: ids.userId,
      channel: "email",
      purpose: "billing",
      status: "pending",
      dedupeKey: `email:organizationBilling:plan-activated-1:${ids.userId}`,
      payload: { kind: "email", context: "organizationBilling.planActivated" },
    });
    expect(jobs.some((job) => job.channel === "line")).toBe(false);
  });

  it("Free適用通知は移行直前の管理者snapshotへ送れるが、削除済み人物は除外する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "free_notice", plan: "free" });
      await ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: Date.now() });
      return seeded;
    });

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "freeApplied",
        eventKey: "free-applied-1",
        recipientUserIds: [ids.userId],
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.personId, { status: "removed", updatedAt: Date.now() });
    });
    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "freeApplied",
        eventKey: "free-applied-removed",
        recipientUserIds: [ids.userId],
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
  });

  it("古いTrial期限のreminderは新しい状態へ送らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject: "stale_trial_notice", plan: "pro" }));

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "trialEnding",
        eventKey: "stale-trial",
        expectedDeadlineAt: Date.now() + 1000,
      }),
    ).resolves.toEqual({ enqueuedCount: 0 });
    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(0);
  });

  it("契約制限を維持した支払い結果待ちはreadOnlyの復旧担当者も課金通知へ含める", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "pending_recovery_notice", plan: "pro" });
      const now = Date.now();
      const recoveryUserId = await seedUser(ctx, "pending_readonly_recovery", "recovery@example.com");
      const recoveryPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: seeded.organizationId,
        userId: recoveryUserId,
        name: "閲覧のみ復旧担当者",
        email: "recovery@example.com",
        emailNormalized: "recovery@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: seeded.organizationId,
        personId: recoveryPersonId,
        userId: recoveryUserId,
        status: "readOnly",
        createdAt: now,
        updatedAt: now,
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
          restrictedFallbackState: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [seeded.personId, recoveryPersonId],
            previousActiveShopIds: [seeded.shopId],
            restrictedAt: now - 1_000,
          },
          startedAt: now,
        },
        version: 2,
      });
      return { ...seeded, recoveryUserId };
    });

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "billingEmailChanged",
        eventKey: "pending-recovery-billing-email",
      }),
    ).resolves.toEqual({ enqueuedCount: 2 });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => job.userId).sort()).toEqual([ids.userId, ids.recoveryUserId].sort());
  });

  it.each([
    "restrictedStarted",
    "recovered",
  ] as const)("%sは遷移前snapshotにだけいたreadOnly非復旧担当者を送信対象にしない", async (event) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: `${event}_current_recipient`, plan: "pro" });
      const now = Date.now();
      const formerUserId = await seedUser(ctx, `${event}_former_recipient`, `${event}-former@example.com`);
      const formerPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: seeded.organizationId,
        userId: formerUserId,
        name: "旧復旧担当者",
        email: `${event}-former@example.com`,
        emailNormalized: `${event}-former@example.com`,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId: seeded.organizationId,
        personId: formerPersonId,
        userId: formerUserId,
        status: "readOnly",
        createdAt: now,
        updatedAt: now,
      });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      if (event === "restrictedStarted") {
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "freeConditionsNotMet",
            previousPlan: "pro",
            recoveryManagerPersonIds: [seeded.personId],
            previousActiveShopIds: [seeded.shopId],
            restrictedAt: now,
          },
        });
      }
      return { ...seeded, formerUserId };
    });

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event,
        eventKey: `${event}-current-recipients`,
        recipientUserIds: [ids.userId, ids.formerUserId],
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs.map((job) => job.userId)).toEqual([ids.userId]);
  });

  it("Trial終了通知は選択済みプランと終了時刻をDTOから本文へ反映する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = Date.parse("2026-09-01T00:00:00+09:00");
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "trial_notice", plan: "business" });
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt, selectedPaidPlan: "business" },
      });
      return seeded;
    });

    await expect(
      t.action(internal.organizationBilling.actions.enqueueBillingNotification, {
        organizationId: ids.organizationId,
        event: "trialEnding",
        eventKey: "trial-ending-selected-business",
        expectedDeadlineAt: trialEndsAt,
      }),
    ).resolves.toEqual({ enqueuedCount: 1 });

    const jobs = await t.run((ctx) => ctx.db.query("notificationOutbox").collect());
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.payload.kind).toBe("email");
    if (jobs[0]?.payload.kind !== "email") throw new Error("email payload not found");
    expect(jobs[0].payload.html).toContain("選択済みの契約プランはBusinessプランです。");
    expect(jobs[0].payload.html).toContain("初回請求は9/1(火) 00:00を予定しています。");
    expect(jobs[0].payload.html).toContain("Freeプランへ変更する場合の設定期限は9/1(火) 00:00です。");
    expect(jobs[0].payload.html).not.toContain("円");
  });
});
