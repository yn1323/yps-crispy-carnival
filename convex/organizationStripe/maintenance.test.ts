import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STRIPE_OPERATION_MAX_ATTEMPTS } from "../constants";

const NOW = Date.parse("2026-07-20T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60_000;

describe("organizationStripe/maintenance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stale received・due retrying・期限切れprocessingだけを再予約し、operationは推測再実行しない", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_recover", plan: "pro" }),
    );
    await t.run(async (ctx) => {
      await insertWebhook(ctx, {
        stripeEventId: "evt_stale_received",
        status: "received",
        updatedAt: NOW - 5 * 60_000,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_fresh_received",
        status: "received",
        updatedAt: NOW - 5 * 60_000 + 1,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_due_retry",
        status: "retrying",
        nextRunAt: NOW,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_future_retry",
        status: "retrying",
        nextRunAt: NOW + 1,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_expired_processing",
        status: "processing",
        leaseToken: "expired",
        leaseExpiresAt: NOW,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_active_processing",
        status: "processing",
        leaseToken: "active",
        leaseExpiresAt: NOW + 1,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_terminal",
        status: "processed",
        updatedAt: NOW - DAY_MS,
        processedAt: NOW - DAY_MS,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "expired-operation",
        status: "processing",
        leaseToken: "expired-operation",
        leaseExpiresAt: NOW,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverWebhookEvents, {})).resolves.toEqual({
      scheduledCount: 3,
      scheduledByStatus: { received: 1, processing: 1, retrying: 1 },
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(
      state.scheduled
        .filter((job) => job.name === "organizationStripe/actions:processWebhookEvent")
        .map((job) => (job.args[0] as { stripeEventId: string }).stripeEventId)
        .sort(),
    ).toEqual(["evt_due_retry", "evt_expired_processing", "evt_stale_received"]);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ status: "processing", attemptCount: 1 });
  });

  it("1回のWebhook回収を50件までに制限する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 51; index += 1) {
        await insertWebhook(ctx, {
          stripeEventId: `evt_stale_${index}`,
          status: "received",
          updatedAt: NOW - 5 * 60_000,
        });
      }
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverWebhookEvents, {})).resolves.toEqual({
      scheduledCount: 50,
      scheduledByStatus: { received: 50, processing: 0, retrying: 0 },
      reachedBatchLimit: true,
    });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(50);
  });

  it("期限切れの再照合・取消・請求停止だけを現在の課金状態に対応する安全actionへ戻す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const initial = await seedOrganizationManagerShop(ctx, { subject: "stripe_safe_initial", plan: "pro" });
      const paymentTermination = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_payment_termination",
        plan: "standard",
      });
      const cancellationPaymentTermination = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_cancellation_termination",
        plan: "standard",
      });
      const scheduledPaid = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_scheduled_paid",
        plan: "pro",
      });
      const unrelated = await seedOrganizationManagerShop(ctx, { subject: "stripe_safe_unrelated", plan: "pro" });
      await replaceBillingState(ctx, initial.organizationId, {
        kind: "initialPaymentPending",
        plan: "standard",
        startedAt: NOW - DAY_MS,
      });
      await replaceBillingState(ctx, paymentTermination.organizationId, {
        kind: "paymentTerminationPending",
        previousPlan: "standard",
        startedAt: NOW - DAY_MS,
      });
      await replaceBillingState(ctx, cancellationPaymentTermination.organizationId, {
        kind: "paymentTerminationPending",
        previousPlan: "standard",
        startedAt: NOW - DAY_MS,
      });
      await replaceBillingState(ctx, scheduledPaid.organizationId, {
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "standard",
        effectiveAt: NOW,
      });

      await insertOperation(ctx, {
        organizationId: initial.organizationId,
        requestKey: "safe-initial-reconcile",
        kind: "reconcileSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: scheduledPaid.organizationId,
        requestKey: "safe-scheduled-paid-reconcile",
        kind: "reconcileSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
        recoveryPurpose: "scheduledPaidPlanDeadline",
      });
      await insertOperation(ctx, {
        organizationId: paymentTermination.organizationId,
        requestKey: "safe-termination-reconcile",
        kind: "stopInvoiceCollection",
        status: "processing",
        leaseToken: "expired-termination",
        leaseExpiresAt: NOW,
        expectedBillingVersion: 1,
        recoveryPurpose: "paymentTermination",
      });
      await insertOperation(ctx, {
        organizationId: cancellationPaymentTermination.organizationId,
        requestKey: "safe-termination-cancel",
        kind: "cancelSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
        recoveryPurpose: "paymentTermination",
      });
      await insertOperation(ctx, {
        organizationId: cancellationPaymentTermination.organizationId,
        requestKey: "future-stop-invoice",
        kind: "stopInvoiceCollection",
        status: "retrying",
        nextRunAt: NOW + 1,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: unrelated.organizationId,
        requestKey: "unsafe-checkout-retry",
        kind: "immediatePaidCheckout",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
      });
    });

    const probe = await t.query(internal.organizationStripe.maintenance.getProbe, {});
    expect(probe.safetyOperations).toEqual({
      unfinishedCancelSubscription: { observedCount: 1, hasMore: false },
      unfinishedStopInvoiceCollection: { observedCount: 2, hasMore: false },
      priceRotationBlocking: {
        trialSetupCheckout: { observedCount: 0, hasMore: false },
        createTrialSubscription: { observedCount: 0, hasMore: false },
        immediatePaidCheckout: { observedCount: 1, hasMore: false },
      },
      reconcileSubscriptionActionRequired: { observedCount: 0, hasMore: false },
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 4,
      scheduledByKind: {
        reconcileSubscription: 2,
        cancelSubscription: 1,
        stopInvoiceCollection: 1,
        syncBillingEmail: 0,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(state.scheduled.map((job) => ({ name: job.name, args: job.args[0] }))).toEqual([
      {
        name: "organizationStripe/actions:reconcileInitialPaymentPending",
        args: {
          organizationId: expect.any(String),
          expectedBillingVersion: 1,
          requestId: "safe-initial-reconcile",
        },
      },
      {
        name: "organizationStripe/actions:reconcileScheduledPaidPlanDeadline",
        args: {
          organizationId: expect.any(String),
          expectedBillingVersion: 1,
          requestId: "safe-scheduled-paid-reconcile",
        },
      },
      {
        name: "organizationStripe/actions:finishPaymentTermination",
        args: {
          organizationId: expect.any(String),
          expectedBillingVersion: 1,
          requestId: "safe-termination-reconcile",
        },
      },
      {
        name: "organizationStripe/actions:finishPaymentTermination",
        args: {
          organizationId: expect.any(String),
          expectedBillingVersion: 1,
          requestId: "safe-termination-cancel",
        },
      },
    ]);
  });

  it("期限切れの無効Trial取消operationを専用回収Actionへ再予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_invalid_trial_cleanup_recovery",
      });
      const sourceOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "createTrialSubscription",
        requestKey: "invalid-trial-source-recovery",
        stripeIdempotencyKey: "test:invalid-trial-source-recovery",
        livemode: false,
        expectedBillingVersion: 1,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_invalid_trial_recovery",
        status: "actionRequired",
        attemptCount: 1,
        lastErrorCode: "trial_subscription_invalid",
        completedAt: NOW,
        expiresAt: NOW + DAY_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "cancelSubscription",
        requestKey: "invalid-trial-cleanup-recovery",
        stripeIdempotencyKey: "test:invalid-trial-cleanup-recovery",
        livemode: false,
        expectedBillingVersion: 1,
        providerGeneration: 1,
        recoveryPurpose: "invalidTrialSubscriptionCancellation",
        sourceOperationId,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_invalid_trial_recovery",
        status: "processing",
        attemptCount: 1,
        leaseToken: "expired-invalid-trial-cleanup",
        leaseExpiresAt: NOW,
        expiresAt: NOW + DAY_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 1,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 1,
        stopInvoiceCollection: 0,
        syncBillingEmail: 0,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: false,
    });
    const state = await stripeMaintenanceState(t);
    expect(state.scheduled.map((job) => ({ name: job.name, args: job.args[0] }))).toEqual([
      {
        name: "organizationStripe/actions:reconcileInvalidTrialSubscriptionCancellation",
        args: {
          organizationId: ids.organizationId,
          expectedBillingVersion: 1,
          requestId: "invalid-trial-cleanup-recovery",
        },
      },
    ]);
  });

  it("provider成功後に停止した期間末Free予約・取消をlease期限後に専用Actionへ再予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const schedule = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_schedule_free_hard_crash",
        plan: "pro",
      });
      const cancel = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_cancel_free_schedule_hard_crash",
        plan: "pro",
      });
      await replaceBillingState(ctx, schedule.organizationId, { kind: "active", plan: "pro" });
      await replaceBillingState(ctx, cancel.organizationId, {
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: NOW + DAY_MS,
        restrictAtPeriodEnd: true,
      });
      await insertOperation(ctx, {
        organizationId: schedule.organizationId,
        requestKey: "schedule-free-hard-crash",
        kind: "scheduleFree",
        status: "processing",
        leaseToken: "expired-schedule-free",
        leaseExpiresAt: NOW,
        expectedBillingVersion: 1,
        providerGeneration: 1,
      });
      await insertOperation(ctx, {
        organizationId: cancel.organizationId,
        requestKey: "cancel-free-schedule-hard-crash",
        kind: "cancelFreeSchedule",
        status: "processing",
        leaseToken: "expired-cancel-free-schedule",
        leaseExpiresAt: NOW,
        expectedBillingVersion: 1,
        providerGeneration: 1,
      });
      return { schedule, cancel };
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 2,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 0,
        scheduleFree: 1,
        cancelFreeSchedule: 1,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(
      state.scheduled
        .map((job) => ({ name: job.name, args: job.args[0] }))
        .sort((left, right) => String(left.args.operationKind).localeCompare(String(right.args.operationKind))),
    ).toEqual([
      {
        name: "organizationStripe/actions:reconcileCancelAtPeriodEndChange",
        args: {
          organizationId: ids.cancel.organizationId,
          expectedBillingVersion: 1,
          requestId: "cancel-free-schedule-hard-crash",
          operationKind: "cancelFreeSchedule",
        },
      },
      {
        name: "organizationStripe/actions:reconcileCancelAtPeriodEndChange",
        args: {
          organizationId: ids.schedule.organizationId,
          expectedBillingVersion: 1,
          requestId: "schedule-free-hard-crash",
          operationKind: "scheduleFree",
        },
      },
    ]);
  });

  it("retryingの有料プラン変更3種を保存済みoperation IDで専用回収Actionへ再予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const immediate = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_recover_immediate_paid_plan",
        plan: "pro",
      });
      const schedule = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_recover_schedule_paid_plan",
        plan: "pro",
      });
      const cancel = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_recover_cancel_paid_plan",
        plan: "pro",
      });
      await replaceBillingState(ctx, immediate.organizationId, {
        kind: "pendingActivation",
        plan: "pro",
        fallback: "standard",
        startedAt: NOW - 1_000,
      });
      await replaceBillingState(ctx, cancel.organizationId, {
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "standard",
        effectiveAt: NOW + DAY_MS,
      });
      const immediateOperationId = await insertOperation(ctx, {
        organizationId: immediate.organizationId,
        requestKey: "recover-immediate-paid-plan",
        kind: "changePaidPlanNow",
        status: "retrying",
        nextRunAt: NOW,
        providerGeneration: 1,
      });
      const scheduleOperationId = await insertOperation(ctx, {
        organizationId: schedule.organizationId,
        requestKey: "recover-schedule-paid-plan",
        kind: "schedulePaidPlanChange",
        status: "retrying",
        nextRunAt: NOW,
        providerGeneration: 1,
      });
      const cancelOperationId = await insertOperation(ctx, {
        organizationId: cancel.organizationId,
        requestKey: "recover-cancel-paid-plan",
        kind: "cancelScheduledPlanChange",
        status: "retrying",
        nextRunAt: NOW,
        providerGeneration: 1,
      });
      return { immediateOperationId, scheduleOperationId, cancelOperationId };
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 3,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 0,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 1,
        schedulePaidPlanChange: 1,
        cancelScheduledPlanChange: 1,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: false,
    });
    const state = await stripeMaintenanceState(t);
    expect(
      state.scheduled
        .filter((job) => job.name === "organizationStripe/actions:reconcilePaidPlanChangeOperation")
        .map((job) => job.args[0]?.operationId)
        .sort(),
    ).toEqual([ids.immediateOperationId, ids.scheduleOperationId, ids.cancelOperationId].sort());
  });

  it("古いbilling versionを再評価し、回復目的のない外部操作を再送せずactionRequiredへ収束させる", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const resolved = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_resolved_version",
        plan: "pro",
      });
      await replaceBillingState(ctx, resolved.organizationId, { kind: "active", plan: "pro" });
      await insertCustomer(ctx, resolved.organizationId, "cus_safe_resolved");
      await insertSubscription(ctx, resolved.organizationId, {
        stripeCustomerId: "cus_safe_resolved",
        stripeSubscriptionId: "sub_safe_resolved",
        providerGeneration: 1,
        status: "active",
      });
      await insertOperation(ctx, {
        organizationId: resolved.organizationId,
        requestKey: "resolved-old-version-reconcile",
        kind: "reconcileSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 0,
      });
      await insertOperation(ctx, {
        organizationId: resolved.organizationId,
        requestKey: "resolved-old-version-cancel",
        kind: "cancelSubscription",
        status: "processing",
        leaseToken: "expired-resolved-cancel",
        leaseExpiresAt: NOW,
        expectedBillingVersion: 0,
      });
      await insertOperation(ctx, {
        organizationId: resolved.organizationId,
        requestKey: "resolved-queued-stop",
        kind: "stopInvoiceCollection",
        status: "queued",
        expectedBillingVersion: 0,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 1,
      scheduledByKind: {
        reconcileSubscription: 1,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 0,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 2,
      reachedBatchLimit: false,
    });

    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((job) => job.args[0].expectedBillingVersion)).toEqual([0]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const state = await stripeMaintenanceState(t);
    expect(
      state.operations
        .map((operation) => ({
          requestKey: operation.requestKey,
          status: operation.status,
          lastErrorCode: operation.lastErrorCode,
        }))
        .sort((left, right) => left.requestKey.localeCompare(right.requestKey)),
    ).toEqual([
      {
        requestKey: "resolved-old-version-cancel",
        status: "actionRequired",
        lastErrorCode: "billing_binding_invalid",
      },
      {
        requestKey: "resolved-old-version-reconcile",
        status: "cancelled",
        lastErrorCode: "billing_already_converged",
      },
      {
        requestKey: "resolved-queued-stop",
        status: "actionRequired",
        lastErrorCode: "billing_binding_invalid",
      },
    ]);
  });

  it("課金状態の対応不正と試行上限の安全operationをactionRequiredへ収束させる", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const invalidBinding = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_invalid_binding",
        plan: "pro",
      });
      const exhausted = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_safe_attempt_exhausted",
        plan: "pro",
      });
      const invalidBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", invalidBinding.organizationId))
        .unique();
      if (!invalidBilling) throw new Error("billing state is required");
      await ctx.db.delete(invalidBilling._id);
      await insertOperation(ctx, {
        organizationId: invalidBinding.organizationId,
        requestKey: "safe-invalid-binding",
        kind: "reconcileSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: exhausted.organizationId,
        requestKey: "safe-attempt-exhausted",
        kind: "cancelSubscription",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
        attemptCount: STRIPE_OPERATION_MAX_ATTEMPTS,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 0,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 0,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 2,
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(
      state.operations
        .map((operation) => ({
          requestKey: operation.requestKey,
          status: operation.status,
          lastErrorCode: operation.lastErrorCode,
        }))
        .sort((left, right) => left.requestKey.localeCompare(right.requestKey)),
    ).toEqual([
      {
        requestKey: "safe-attempt-exhausted",
        status: "actionRequired",
        lastErrorCode: "attempt_limit_exceeded",
      },
      {
        requestKey: "safe-invalid-binding",
        status: "actionRequired",
        lastErrorCode: "billing_binding_invalid",
      },
    ]);
    expect(state.scheduled).toEqual([]);
  });

  it("請求先メール同期を含む安全operationの1回の回収を50件までに制限する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const initial = await seedOrganizationManagerShop(ctx, { subject: "stripe_safe_batch", plan: "pro" });
      await replaceBillingState(ctx, initial.organizationId, {
        kind: "initialPaymentPending",
        plan: "pro",
        startedAt: NOW - DAY_MS,
      });
      for (let index = 0; index < 51; index += 1) {
        await insertOperation(ctx, {
          organizationId: initial.organizationId,
          requestKey: `safe-batch-${index}`,
          kind: "syncBillingEmail",
          status: "retrying",
          nextRunAt: NOW,
          expectedBillingVersion: 1,
        });
      }
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 50,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 50,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: true,
    });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(50);
  });

  it("provider成功後に完了記録前で停止した請求先メール同期を、lease期限後に再予約する", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_email_hard_crash", plan: "pro" });
      await ctx.db.patch(seeded.organizationId, {
        billingEmail: "hard-crash@example.com",
        billingEmailNormalized: "hard-crash@example.com",
        billingEmailSyncKey: "billing-email-hard-crash",
      });
      await insertCustomer(ctx, seeded.organizationId, "cus_email_hard_crash");
      await insertOperation(ctx, {
        organizationId: seeded.organizationId,
        requestKey: "sync-provider-succeeded-before-completion",
        kind: "syncBillingEmail",
        status: "processing",
        leaseToken: "expired-after-provider-success",
        leaseExpiresAt: NOW,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: seeded.organizationId,
        requestKey: "sync-due-retrying",
        kind: "syncBillingEmail",
        status: "retrying",
        nextRunAt: NOW,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: seeded.organizationId,
        requestKey: "sync-active-processing",
        kind: "syncBillingEmail",
        status: "processing",
        leaseToken: "active-sync",
        leaseExpiresAt: NOW + 1,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: seeded.organizationId,
        requestKey: "sync-future-retrying",
        kind: "syncBillingEmail",
        status: "retrying",
        nextRunAt: NOW + 1,
        expectedBillingVersion: 1,
      });
      await insertOperation(ctx, {
        organizationId: seeded.organizationId,
        requestKey: "sync-queued-without-provider-attempt",
        kind: "syncBillingEmail",
        status: "queued",
        expectedBillingVersion: 1,
      });
      return seeded;
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.recoverSafeOperations, {})).resolves.toEqual({
      scheduledCount: 2,
      scheduledByKind: {
        reconcileSubscription: 0,
        cancelSubscription: 0,
        stopInvoiceCollection: 0,
        syncBillingEmail: 2,
        scheduleFree: 0,
        cancelFreeSchedule: 0,
        changePaidPlanNow: 0,
        schedulePaidPlanChange: 0,
        cancelScheduledPlanChange: 0,
      },
      terminalizedWithoutDispatchCount: 0,
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(state.scheduled).toHaveLength(2);
    expect(
      state.scheduled
        .filter((job) => job.name === "organizationStripe/actions:syncBillingEmail")
        .map((job) => job.args[0])
        .sort((left, right) => String(left.requestId).localeCompare(String(right.requestId))),
    ).toEqual([
      { organizationId, requestId: "sync-due-retrying" },
      { organizationId, requestId: "sync-provider-succeeded-before-completion" },
    ]);
    expect(
      state.operations
        .filter((operation) => operation.kind === "syncBillingEmail")
        .map((operation) => ({ requestKey: operation.requestKey, status: operation.status }))
        .sort((left, right) => left.requestKey.localeCompare(right.requestKey)),
    ).toEqual([
      { requestKey: "sync-active-processing", status: "processing" },
      { requestKey: "sync-due-retrying", status: "retrying" },
      { requestKey: "sync-future-retrying", status: "retrying" },
      { requestKey: "sync-provider-succeeded-before-completion", status: "processing" },
      { requestKey: "sync-queued-without-provider-attempt", status: "queued" },
    ]);
    expect(
      state.operations.find((operation) => operation.requestKey === "sync-provider-succeeded-before-completion"),
    ).toMatchObject({
      stripeIdempotencyKey: "test:sync-provider-succeeded-before-completion",
      status: "processing",
      leaseToken: "expired-after-provider-success",
      leaseExpiresAt: NOW,
    });
  });

  it("保持期限を過ぎたterminal Webhook/operationだけを削除する", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_prune", plan: "pro" }),
    );
    await t.run(async (ctx) => {
      await insertWebhook(ctx, {
        stripeEventId: "evt_expired_processed",
        status: "processed",
        expiresAt: NOW,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_expired_action_required",
        status: "actionRequired",
        expiresAt: NOW,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_expired_received",
        status: "received",
        expiresAt: NOW,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_future_processed",
        status: "processed",
        expiresAt: NOW + 1,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "expired-succeeded",
        status: "succeeded",
        expiresAt: NOW,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "expired-action-required",
        status: "actionRequired",
        expiresAt: NOW,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "expired-processing",
        status: "processing",
        expiresAt: NOW,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "future-succeeded",
        status: "succeeded",
        expiresAt: NOW + 1,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 2,
      deletedOperations: 2,
      totalDeleted: 4,
      reachedBatchLimit: false,
    });

    const state = await stripeMaintenanceState(t);
    expect(state.webhooks.map((event) => event.stripeEventId).sort()).toEqual([
      "evt_expired_received",
      "evt_future_processed",
    ]);
    expect(state.operations.map((operation) => operation.requestKey).sort()).toEqual([
      "expired-processing",
      "future-succeeded",
    ]);
    expect(state.scheduled).toEqual([]);
  });

  it("無効Trialの作成元とcleanupは一意なprovider終端snapshotが得られるまで削除しない", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_prune_invalid_trial", plan: "pro" }),
    );
    const ids = await t.run(async (ctx) => {
      const sourceOperationId = await insertOperation(ctx, {
        organizationId,
        requestKey: "invalid-trial-source",
        kind: "createTrialSubscription",
        status: "actionRequired",
        providerGeneration: 1,
        stripeObjectId: "sub_invalid_trial_prune",
        stripePriceIdSnapshot: "price_pro_test",
        lastErrorCode: "trial_eligibility_race",
        expiresAt: NOW,
      });
      const cleanupOperationId = await insertOperation(ctx, {
        organizationId,
        requestKey: "invalid-trial-cleanup",
        kind: "cancelSubscription",
        status: "actionRequired",
        providerGeneration: 1,
        recoveryPurpose: "invalidTrialSubscriptionCancellation",
        sourceOperationId,
        stripeObjectId: "sub_invalid_trial_prune",
        stripePriceIdSnapshot: "price_pro_test",
        lastErrorCode: "invalid_trial_cleanup_binding_invalid",
        expiresAt: NOW,
      });
      const unknownSourceOperationId = await insertOperation(ctx, {
        organizationId,
        requestKey: "unknown-trial-source",
        kind: "createTrialSubscription",
        status: "actionRequired",
        providerGeneration: 2,
        stripePriceIdSnapshot: "price_pro_test",
        lastErrorCode: "trial_subscription_create_result_unknown",
        expiresAt: NOW,
      });
      return { sourceOperationId, cleanupOperationId, unknownSourceOperationId };
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 0,
      deletedOperations: 0,
      totalDeleted: 0,
      reachedBatchLimit: false,
    });
    let state = await stripeMaintenanceState(t);
    expect(
      state.operations
        .map((operation) => ({ requestKey: operation.requestKey, expiresAt: operation.expiresAt }))
        .sort((left, right) => left.requestKey.localeCompare(right.requestKey)),
    ).toEqual([
      { requestKey: "invalid-trial-cleanup", expiresAt: NOW + DAY_MS },
      { requestKey: "invalid-trial-source", expiresAt: NOW + DAY_MS },
      { requestKey: "unknown-trial-source", expiresAt: NOW + DAY_MS },
    ]);

    const subscriptionId = await t.run(async (ctx) => {
      const id = await insertSubscription(ctx, organizationId, {
        stripeCustomerId: "cus_invalid_trial_prune",
        stripeSubscriptionId: "sub_invalid_trial_prune",
        providerGeneration: 1,
        status: "active",
      });
      await ctx.db.patch(ids.sourceOperationId, { expiresAt: NOW });
      await ctx.db.patch(ids.cleanupOperationId, { expiresAt: NOW });
      return id;
    });
    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 0,
      deletedOperations: 0,
      totalDeleted: 0,
      reachedBatchLimit: false,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(subscriptionId, { status: "canceled", terminalAt: NOW, updatedAt: NOW });
      await ctx.db.patch(ids.sourceOperationId, { expiresAt: NOW });
      await ctx.db.patch(ids.cleanupOperationId, { expiresAt: NOW });
    });
    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 0,
      deletedOperations: 2,
      totalDeleted: 2,
      reachedBatchLimit: false,
    });
    state = await stripeMaintenanceState(t);
    expect(state.operations.map((operation) => operation._id)).toEqual([ids.unknownSourceOperationId]);
  });

  it("最新terminal世代の取消・請求停止成功証拠を次の契約世代まで保持する", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_prune_safety_evidence", plan: "pro" }),
    );
    await t.run(async (ctx) => {
      await insertSubscription(ctx, organizationId, {
        stripeCustomerId: "cus_prune_safety_evidence",
        stripeSubscriptionId: "sub_prune_safety_evidence_1",
        providerGeneration: 1,
        status: "canceled",
        terminalAt: NOW - DAY_MS,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "prune-safety-cancel",
        kind: "cancelSubscription",
        status: "succeeded",
        providerGeneration: 1,
        expiresAt: NOW,
      });
      await insertOperation(ctx, {
        organizationId,
        requestKey: "prune-safety-invoice",
        kind: "stopInvoiceCollection",
        status: "succeeded",
        providerGeneration: 1,
        expiresAt: NOW,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 0,
      deletedOperations: 0,
      totalDeleted: 0,
      reachedBatchLimit: false,
    });
    let state = await stripeMaintenanceState(t);
    expect(
      state.operations.map((operation) => ({ requestKey: operation.requestKey, expiresAt: operation.expiresAt })),
    ).toEqual([
      { requestKey: "prune-safety-cancel", expiresAt: NOW + DAY_MS },
      { requestKey: "prune-safety-invoice", expiresAt: NOW + DAY_MS },
    ]);

    await t.run(async (ctx) => {
      await insertSubscription(ctx, organizationId, {
        stripeCustomerId: "cus_prune_safety_evidence",
        stripeSubscriptionId: "sub_prune_safety_evidence_2",
        providerGeneration: 2,
        status: "active",
      });
      for (const operation of await ctx.db.query("organizationStripeOperations").collect()) {
        await ctx.db.patch(operation._id, { expiresAt: NOW });
      }
    });
    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 0,
      deletedOperations: 2,
      totalDeleted: 2,
      reachedBatchLimit: false,
    });
    state = await stripeMaintenanceState(t);
    expect(state.operations).toEqual([]);
  });

  it("期限切れの未完了行が500件あってもterminal行の保持期限削除を飢餓させない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 500; index += 1) {
        await insertWebhook(ctx, {
          stripeEventId: `evt_unfinished_expired_${index}`,
          status: "received",
          expiresAt: NOW - 1,
        });
      }
      await insertWebhook(ctx, {
        stripeEventId: "evt_terminal_after_unfinished",
        status: "processed",
        processedAt: NOW,
        expiresAt: NOW,
      });
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 1,
      deletedOperations: 0,
      totalDeleted: 1,
      reachedBatchLimit: false,
    });
    const state = await stripeMaintenanceState(t);
    expect(state.webhooks).toHaveLength(500);
    expect(
      state.webhooks
        .filter((event) => event.stripeEventId === "evt_terminal_after_unfinished")
        .map((event) => event.stripeEventId),
    ).toEqual([]);
  });

  it("保持期限削除を両表合計100件に制限し、続きの削除を予約する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await insertWebhook(ctx, {
          stripeEventId: `evt_expired_${index}`,
          status: "processed",
          expiresAt: NOW,
        });
      }
    });

    await expect(t.mutation(internal.organizationStripe.maintenance.pruneExpiredTerminalRecords, {})).resolves.toEqual({
      deletedWebhookEvents: 100,
      deletedOperations: 0,
      totalDeleted: 100,
      reachedBatchLimit: true,
    });
    const state = await stripeMaintenanceState(t);
    expect(state.webhooks).toHaveLength(1);
    expect(state.scheduled).toEqual([
      {
        name: "organizationStripe/maintenance:pruneExpiredTerminalRecords",
        args: [{}],
      },
    ]);
  });

  it("status・処理時刻・要対応operation・関係異常をbounded Probeで返し、自動修復しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const complimentary = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_complimentary",
        complimentary: true,
      });
      const missing = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_missing",
        plan: "pro",
      });
      const duplicated = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_duplicated",
        plan: "pro",
      });
      const freeWithCurrent = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_free_current",
        plan: "free",
      });
      await seedOrganizationManagerShop(ctx, { subject: "stripe_probe_pro", plan: "pro" });

      await insertCustomer(ctx, complimentary.organizationId, "cus_complimentary");
      await insertSubscription(ctx, complimentary.organizationId, {
        stripeCustomerId: "cus_complimentary",
        stripeSubscriptionId: "sub_complimentary",
        providerGeneration: 1,
        status: "active",
      });
      await insertSubscription(ctx, duplicated.organizationId, {
        stripeCustomerId: "cus_duplicated",
        stripeSubscriptionId: "sub_duplicated_1",
        providerGeneration: 1,
        status: "active",
      });
      await insertSubscription(ctx, duplicated.organizationId, {
        stripeCustomerId: "cus_duplicated",
        stripeSubscriptionId: "sub_duplicated_2",
        providerGeneration: 2,
        status: "past_due",
      });
      await insertCustomer(ctx, freeWithCurrent.organizationId, "cus_free_current");
      await insertSubscription(ctx, freeWithCurrent.organizationId, {
        stripeCustomerId: "cus_free_current",
        stripeSubscriptionId: "sub_free_current",
        providerGeneration: 1,
        status: "active",
      });

      await insertWebhook(ctx, {
        stripeEventId: "evt_probe_received",
        status: "received",
        receivedAt: NOW - 1_000,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_probe_processing",
        status: "processing",
        receivedAt: NOW - 5_000,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_probe_processed_1",
        status: "processed",
        processedAt: NOW - 200,
      });
      await insertWebhook(ctx, {
        stripeEventId: "evt_probe_processed_2",
        status: "processed",
        processedAt: NOW - 100,
      });

      for (const [index, status] of (
        ["queued", "processing", "retrying", "actionRequired", "succeeded"] as const
      ).entries()) {
        await insertOperation(ctx, {
          organizationId: missing.organizationId,
          requestKey: `probe-operation-${index}`,
          status,
        });
      }
      await insertOperation(ctx, {
        organizationId: missing.organizationId,
        kind: "trialSetupCheckout",
        requestKey: "probe-unfinished-setup-session",
        providerGeneration: 1,
        status: "succeeded",
      });
      await insertOperation(ctx, {
        organizationId: missing.organizationId,
        kind: "createTrialSubscription",
        requestKey: "probe-uncertain-trial-create",
        providerGeneration: 2,
        status: "actionRequired",
      });
      await insertOperation(ctx, {
        organizationId: duplicated.organizationId,
        kind: "immediatePaidCheckout",
        requestKey: "probe-completed-immediate-checkout",
        providerGeneration: 2,
        status: "succeeded",
      });
      return { complimentaryOrganizationId: complimentary.organizationId };
    });

    const probe = await t.query(internal.organizationStripe.maintenance.getProbe, {});

    expect(Object.fromEntries(probe.webhookStatuses.map((entry) => [entry.status, entry.observedCount]))).toMatchObject(
      {
        received: 1,
        processing: 1,
        processed: 2,
      },
    );
    expect(
      Object.fromEntries(probe.operationStatuses.map((entry) => [entry.status, entry.observedCount])),
    ).toMatchObject({
      queued: 1,
      processing: 1,
      retrying: 1,
      actionRequired: 2,
      succeeded: 3,
    });
    expect(probe.oldestObservedUnprocessedWebhookReceivedAt).toBe(NOW - 5_000);
    expect(probe.latestObservedProcessedWebhookAt).toBe(NOW - 100);
    expect(probe.operationActionRequired).toEqual({
      observedCount: 5,
      hasMore: false,
      unfinishedObservedCount: 3,
      persistedActionRequiredObservedCount: 2,
    });
    expect(probe.safetyOperations).toEqual({
      unfinishedCancelSubscription: { observedCount: 0, hasMore: false },
      unfinishedStopInvoiceCollection: { observedCount: 0, hasMore: false },
      priceRotationBlocking: {
        trialSetupCheckout: { observedCount: 1, hasMore: false },
        createTrialSubscription: { observedCount: 1, hasMore: false },
        immediatePaidCheckout: { observedCount: 0, hasMore: false },
      },
      reconcileSubscriptionActionRequired: { observedCount: 0, hasMore: false },
    });
    expect(probe.anomalies).toEqual({
      complimentaryStripeMappingP0: { observedCount: 1, hasMore: false },
      activePaidWithoutCurrentSubscription: { observedCount: 2, hasMore: false },
      activeFreeWithCurrentSubscription: { observedCount: 1, hasMore: false },
      organizationsWithMultipleNonterminalSubscriptions: { observedCount: 1, hasMore: false },
      organizationsWithMultipleStripeCustomers: { observedCount: 0, hasMore: false },
      subscriptionsWithoutMatchingLocalCustomer: { observedCount: 2, hasMore: false },
      stripeCustomersWithoutBillingState: { observedCount: 0, hasMore: false },
    });

    const state = await stripeMaintenanceState(t);
    expect(state.customers.some((customer) => customer.organizationId === ids.complimentaryOrganizationId)).toBe(true);
    expect(
      state.subscriptions.some((subscription) => subscription.organizationId === ids.complimentaryOrganizationId),
    ).toBe(true);
    expect(state.operations.map((operation) => operation.status).sort()).toEqual([
      "actionRequired",
      "actionRequired",
      "processing",
      "queued",
      "retrying",
      "succeeded",
      "succeeded",
      "succeeded",
    ]);
    expect(state.scheduled).toEqual([]);
  });

  it("status別sampleが100件を超えても最新のprocessed Webhook時刻をindexから返す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await insertWebhook(ctx, {
          stripeEventId: `evt_processed_latest_${index}`,
          status: "processed",
          processedAt: NOW - (100 - index),
        });
      }
    });

    const probe = await t.query(internal.organizationStripe.maintenance.getProbe, {});
    expect(probe.webhookStatuses.find((entry) => entry.status === "processed")).toMatchObject({
      observedCount: 100,
      hasMore: true,
    });
    expect(probe.latestObservedProcessedWebhookAt).toBe(NOW);
  });

  it("ローカルCustomer・Subscription・課金状態の関係異常を別々に観測する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const duplicated = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_customer_duplicate",
        plan: "pro",
      });
      const orphaned = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_probe_customer_orphaned",
        plan: "pro",
      });
      await insertCustomer(ctx, duplicated.organizationId, "cus_duplicate_1");
      await insertCustomer(ctx, duplicated.organizationId, "cus_duplicate_2");
      await insertSubscription(ctx, duplicated.organizationId, {
        stripeCustomerId: "cus_not_mapped",
        stripeSubscriptionId: "sub_not_mapped",
        providerGeneration: 1,
        status: "active",
      });
      const orphanedBilling = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", orphaned.organizationId))
        .unique();
      if (!orphanedBilling) throw new Error("billing state is required");
      await ctx.db.delete(orphanedBilling._id);
      await insertCustomer(ctx, orphaned.organizationId, "cus_without_billing");
    });

    const probe = await t.query(internal.organizationStripe.maintenance.getProbe, {});
    expect(probe.anomalies.organizationsWithMultipleStripeCustomers).toEqual({
      observedCount: 1,
      hasMore: false,
    });
    expect(probe.anomalies.subscriptionsWithoutMatchingLocalCustomer).toEqual({
      observedCount: 1,
      hasMore: false,
    });
    expect(probe.anomalies.stripeCustomersWithoutBillingState).toEqual({
      observedCount: 1,
      hasMore: false,
    });
  });
});

async function replaceBillingState(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  state: Doc<"organizationBillingStates">["state"],
) {
  const billing = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (!billing) throw new Error("billing state is required");
  await ctx.db.patch(billing._id, { state, updatedAt: NOW });
}

async function insertWebhook(
  ctx: MutationCtx,
  args: {
    stripeEventId: string;
    status: Doc<"stripeWebhookEvents">["status"];
    nextRunAt?: number;
    leaseToken?: string;
    leaseExpiresAt?: number;
    receivedAt?: number;
    processedAt?: number;
    expiresAt?: number;
    updatedAt?: number;
  },
) {
  return await ctx.db.insert("stripeWebhookEvents", {
    stripeEventId: args.stripeEventId,
    type: "invoice.paid",
    livemode: false,
    objectId: `in_${args.stripeEventId}`,
    eventCreatedAt: Math.floor(NOW / 1_000),
    status: args.status,
    attemptCount: 1,
    ...(args.nextRunAt !== undefined ? { nextRunAt: args.nextRunAt } : {}),
    ...(args.leaseToken !== undefined ? { leaseToken: args.leaseToken } : {}),
    ...(args.leaseExpiresAt !== undefined ? { leaseExpiresAt: args.leaseExpiresAt } : {}),
    receivedAt: args.receivedAt ?? NOW,
    ...(args.processedAt !== undefined ? { processedAt: args.processedAt } : {}),
    expiresAt: args.expiresAt ?? NOW + DAY_MS,
    updatedAt: args.updatedAt ?? NOW,
  });
}

async function insertOperation(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    requestKey: string;
    kind?: Doc<"organizationStripeOperations">["kind"];
    status: Doc<"organizationStripeOperations">["status"];
    expectedBillingVersion?: number;
    providerGeneration?: number;
    recoveryPurpose?: NonNullable<Doc<"organizationStripeOperations">["recoveryPurpose"]>;
    sourceOperationId?: Id<"organizationStripeOperations">;
    stripePriceIdSnapshot?: string;
    stripeObjectId?: string;
    attemptCount?: number;
    nextRunAt?: number;
    leaseToken?: string;
    leaseExpiresAt?: number;
    lastErrorCode?: string;
    expiresAt?: number;
  },
) {
  return await ctx.db.insert("organizationStripeOperations", {
    organizationId: args.organizationId,
    kind: args.kind ?? "createCustomer",
    requestKey: args.requestKey,
    stripeIdempotencyKey: `test:${args.requestKey}`,
    livemode: false,
    ...(args.expectedBillingVersion !== undefined ? { expectedBillingVersion: args.expectedBillingVersion } : {}),
    ...(args.providerGeneration !== undefined ? { providerGeneration: args.providerGeneration } : {}),
    ...(args.recoveryPurpose !== undefined ? { recoveryPurpose: args.recoveryPurpose } : {}),
    ...(args.sourceOperationId !== undefined ? { sourceOperationId: args.sourceOperationId } : {}),
    ...(args.stripePriceIdSnapshot !== undefined ? { stripePriceIdSnapshot: args.stripePriceIdSnapshot } : {}),
    ...(args.stripeObjectId !== undefined ? { stripeObjectId: args.stripeObjectId } : {}),
    status: args.status,
    attemptCount: args.attemptCount ?? 1,
    ...(args.nextRunAt !== undefined ? { nextRunAt: args.nextRunAt } : {}),
    ...(args.leaseToken !== undefined ? { leaseToken: args.leaseToken } : {}),
    ...(args.leaseExpiresAt !== undefined ? { leaseExpiresAt: args.leaseExpiresAt } : {}),
    ...(args.lastErrorCode !== undefined ? { lastErrorCode: args.lastErrorCode } : {}),
    expiresAt: args.expiresAt ?? NOW + DAY_MS,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function insertCustomer(ctx: MutationCtx, organizationId: Id<"organizations">, stripeCustomerId: string) {
  return await ctx.db.insert("organizationStripeCustomers", {
    organizationId,
    stripeCustomerId,
    livemode: false,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function insertSubscription(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  args: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    providerGeneration: number;
    status: Doc<"organizationStripeSubscriptions">["status"];
    terminalAt?: number;
  },
) {
  return await ctx.db.insert("organizationStripeSubscriptions", {
    organizationId,
    stripeCustomerId: args.stripeCustomerId,
    stripeSubscriptionId: args.stripeSubscriptionId,
    stripePriceId: "price_pro_test",
    plan: "pro",
    livemode: false,
    status: args.status,
    providerGeneration: args.providerGeneration,
    cancelAtPeriodEnd: false,
    ...(args.terminalAt !== undefined ? { terminalAt: args.terminalAt } : {}),
    syncedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function stripeMaintenanceState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    customers: await ctx.db.query("organizationStripeCustomers").collect(),
    subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    operations: await ctx.db.query("organizationStripeOperations").collect(),
    webhooks: await ctx.db.query("stripeWebhookEvents").collect(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => ({
      name: job.name,
      args: job.args,
    })),
  }));
}
