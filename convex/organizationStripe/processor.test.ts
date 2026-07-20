import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STRIPE_WEBHOOK_EVENT_RETENTION_MS } from "../constants";
import { STRIPE_WEBHOOK_API_VERSION } from "./config";

const provider = vi.hoisted(() => ({
  retrieveEvent: vi.fn(),
  retrieveInvoice: vi.fn(),
  retrieveSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  retrieveCheckout: vi.fn(),
  retrievePrice: vi.fn(),
}));

vi.mock("stripe", () => {
  class MockStripeError extends Error {
    statusCode?: number;
  }
  class MockStripe {
    static errors = { StripeError: MockStripeError };
    events = { retrieve: provider.retrieveEvent };
    invoices = { retrieve: provider.retrieveInvoice };
    subscriptions = { retrieve: provider.retrieveSubscription, cancel: provider.cancelSubscription };
    checkout = { sessions: { retrieve: provider.retrieveCheckout } };
    prices = { retrieve: provider.retrievePrice };
  }
  return { default: MockStripe };
});

const NOW = new Date("2026-07-20T06:00:00.000Z").getTime();
const CUSTOMER_ID = "cus_shiftori_processor";
const SUBSCRIPTION_ID = "sub_shiftori_processor";
const INVOICE_ID = "in_shiftori_processor";
const PRICE_ID = "price_shiftori_pro";

describe("organizationStripe/processWebhookEvent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_processor");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_processor");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", PRICE_ID);
    provider.retrieveEvent.mockReset();
    provider.retrieveInvoice.mockReset();
    provider.retrieveSubscription.mockReset();
    provider.cancelSubscription.mockReset();
    provider.retrieveCheckout.mockReset();
    provider.retrievePrice.mockReset();
    provider.retrievePrice.mockResolvedValue(priceFixture());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("既知Subscriptionがcomplimentaryへ属する場合はprovider通信前にactionRequiredへ隔離する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_processor_complimentary_mapping",
        plan: "pro",
        complimentary: true,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
        stripePriceId: PRICE_ID,
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    await insertReceipt(t, "evt_complimentary_mapping", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_complimentary_mapping",
    });

    const event = await t.run((ctx) =>
      ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_complimentary_mapping"))
        .unique(),
    );
    expect(event).toMatchObject({ status: "actionRequired", lastErrorCode: "complimentary_stripe_mapping" });
    expect(provider.retrieveEvent).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("complimentaryの既知InvoiceはStripeへ接続せずactionRequiredにする", async () => {
    const t = convexTest(schema, modules);
    await seedComplimentaryWebhookMappings(t);
    await insertReceipt(t, "evt_complimentary_invoice", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_complimentary_invoice",
    });

    const event = await receiptById(t, "evt_complimentary_invoice");
    expect(event).toMatchObject({ status: "actionRequired", lastErrorCode: "complimentary_stripe_mapping" });
    expect(provider.retrieveEvent).not.toHaveBeenCalled();
    expect(provider.retrieveInvoice).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("complimentaryの既知CheckoutはStripeへ接続せずactionRequiredにする", async () => {
    const t = convexTest(schema, modules);
    await seedComplimentaryWebhookMappings(t);
    await insertReceipt(t, "evt_complimentary_checkout", "checkout.session.completed", "cs_complimentary", NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_complimentary_checkout",
    });

    const event = await receiptById(t, "evt_complimentary_checkout");
    expect(event).toMatchObject({ status: "actionRequired", lastErrorCode: "complimentary_stripe_mapping" });
    expect(provider.retrieveEvent).not.toHaveBeenCalled();
    expect(provider.retrieveInvoice).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("complimentaryの署名済みCustomer hintは未知objectでもprovider接続前に停止する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const ids = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_complimentary_customer_hint",
        plan: "pro",
        complimentary: true,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    for (const [eventId, type, objectId] of [
      ["evt_hint_subscription", "customer.subscription.updated", "sub_unknown_hint"],
      ["evt_hint_invoice", "invoice.paid", "in_unknown_hint"],
      ["evt_hint_checkout", "checkout.session.completed", "cs_unknown_hint"],
    ] as const) {
      await insertReceipt(t, eventId, type, objectId, NOW, CUSTOMER_ID);
      await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: eventId });
      expect(await receiptById(t, eventId)).toMatchObject({
        status: "actionRequired",
        lastErrorCode: "complimentary_stripe_mapping",
      });
    }
    expect(provider.retrieveEvent).not.toHaveBeenCalled();
    expect(provider.retrieveInvoice).not.toHaveBeenCalled();
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
    expect(provider.retrieveCheckout).not.toHaveBeenCalled();
  });

  it("再取得Eventのobject IDがreceiptと違う場合はprovider objectを取得しない", async () => {
    const t = convexTest(schema, modules);
    await seedStripeOrganization(t, "stripe_event_object_mismatch", { kind: "active", plan: "pro" });
    await insertReceipt(t, "evt_object_mismatch", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_object_mismatch",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: "sub_different_object" } },
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_object_mismatch",
    });

    await expect(receiptById(t, "evt_object_mismatch")).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "event_snapshot_mismatch",
    });
    expect(provider.retrieveSubscription).not.toHaveBeenCalled();
  });

  it("Stripe secretが一時的に欠けてもreceiptを再試行し、復旧後に処理する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_event_config_retry", { kind: "active", plan: "pro" });
    await insertReceipt(t, "evt_config_retry", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_config_retry" });

    await expect(receiptById(t, "evt_config_retry")).resolves.toMatchObject({
      status: "retrying",
      lastErrorCode: "stripe_safety_config_missing",
      nextRunAt: NOW + 30_000,
    });
    expect(provider.retrieveEvent).not.toHaveBeenCalled();

    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_processor");
    vi.setSystemTime(NOW + 30_000);
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_config_retry",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue(subscriptionFixture("active", ids.organizationId, ids.operationId));
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_config_retry" });

    await expect(receiptById(t, "evt_config_retry")).resolves.toMatchObject({
      status: "processed",
      attemptCount: 2,
    });
  });

  it("provider確認済みexpired Checkoutはtrial/immediate双方のlocal operationを解放する", async () => {
    for (const kind of ["trialSetupCheckout", "immediateProCheckout"] as const) {
      const t = convexTest(schema, modules);
      const ids = await seedExpiredCheckout(t, kind);
      const eventId = `evt_expired_${kind}`;
      const sessionId = `cs_expired_${kind}`;
      provider.retrieveEvent.mockResolvedValue({
        id: eventId,
        type: "checkout.session.expired",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(NOW / 1000),
        data: { object: { id: sessionId } },
      });
      provider.retrieveCheckout.mockResolvedValue({
        id: sessionId,
        customer: CUSTOMER_ID,
        livemode: false,
        mode: kind === "trialSetupCheckout" ? "setup" : "subscription",
        status: "expired",
        client_reference_id: String(ids.organizationId),
        metadata: {
          shiftori_organization_id: String(ids.organizationId),
          shiftori_operation_id: String(ids.operationId),
          shiftori_provider_generation: "1",
          shiftori_price_id: PRICE_ID,
        },
      });
      await insertReceipt(t, eventId, "checkout.session.expired", sessionId, NOW);

      await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: eventId });

      const result = await t.run(async (ctx) => ({
        operation: await ctx.db.get(ids.operationId),
        billing: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
      }));
      expect(result.operation).toMatchObject({
        status: "cancelled",
        lastErrorCode: "checkout_session_expired_webhook",
      });
      if (kind === "immediateProCheckout") expect(result.billing?.state).toEqual({ kind: "active", plan: "free" });
    }
  });

  it("expired Checkoutの競合が未収束ならprocessedにせずretryする", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredCheckout(t, "immediateProCheckout");
    const eventId = "evt_expired_conflict";
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationAuditEvents", {
        organizationId: ids.organizationId,
        action: "test.billing_conflict",
        correlationId: `stripe:${eventId}:checkout-expired`,
        occurredAt: NOW,
      });
    });
    provider.retrieveEvent.mockResolvedValue({
      id: eventId,
      type: "checkout.session.expired",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: "cs_expired_immediateProCheckout" } },
    });
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_expired_immediateProCheckout",
      customer: CUSTOMER_ID,
      livemode: false,
      mode: "subscription",
      status: "expired",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    await insertReceipt(t, eventId, "checkout.session.expired", "cs_expired_immediateProCheckout", NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: eventId });

    const receipt = await receiptById(t, eventId);
    const operation = await t.run((ctx) => ctx.db.get(ids.operationId));
    expect(receipt).toMatchObject({ status: "retrying", lastErrorCode: "billing_version_conflict" });
    expect(operation?.status).toBe("succeeded");
  });

  it("FreeからのPro開始は最新InvoiceとSubscriptionが一致したpaidだけでactive.proへ進む", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_paid", {
      kind: "pendingActivation",
      plan: "pro",
      fallback: "free",
      startedAt: NOW - 60_000,
    });
    mockPaidInvoiceEvent("evt_processor_paid", "active", NOW, ids.organizationId, ids.operationId);
    await insertReceipt(t, "evt_processor_paid", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_paid",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      event: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_processor_paid"))
        .unique(),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]).toMatchObject({
      organizationId: ids.organizationId,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      status: "active",
      providerGeneration: 1,
    });
    expect(result.event).toMatchObject({ status: "processed", organizationId: ids.organizationId });
  });

  it("制限中からのPro開始は保存済みの管理者と店舗だけを復旧してactive.proへ進む", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_processor_restricted", plan: "free" });
      await patchBillingState(ctx, seeded.organizationId, {
        kind: "pendingActivation",
        plan: "pro",
        fallback: "restricted",
        restrictedFallbackState: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "free",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: NOW - 120_000,
        },
        startedAt: NOW - 60_000,
      });
      await ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: NOW - 120_000 });
      await ctx.db.patch(seeded.shopId, { operatingStatus: "planSuspended" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const operationId = await insertCheckoutOperation(ctx, seeded.organizationId, "restricted");
      return { ...seeded, operationId };
    });
    mockPaidInvoiceEvent("evt_processor_restricted", "active", NOW, ids.organizationId, ids.operationId);
    await insertReceipt(t, "evt_processor_restricted", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_restricted",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      member: await ctx.db.get(ids.memberId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.member?.status).toBe("active");
    expect(result.shop?.operatingStatus).toBe("active");
  });

  it("Trial期限前の0円InvoiceではProを確定せずTrialを維持する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW + 7 * 24 * 60 * 60_000;
    const ids = await seedStripeOrganization(t, "stripe_processor_trial_zero", {
      kind: "trial",
      trialEndsAt,
      selectedPaidPlan: "pro",
    });
    mockPaidInvoiceEvent("evt_processor_trial_zero", "trialing", NOW, ids.organizationId, ids.operationId);
    await insertReceipt(t, "evt_processor_trial_zero", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_trial_zero",
    });

    const billing = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
    );
    expect(billing?.state).toEqual({ kind: "trial", trialEndsAt, selectedPaidPlan: "pro" });
  });

  it("終了済み世代の遅延invoice.paidでは制限状態を自動復旧しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_old_generation", {
      kind: "restricted",
      reason: "paymentGraceExpired",
      previousPlan: "pro",
      recoveryManagerPersonIds: [],
      previousActiveShopIds: [],
      restrictedAt: NOW - 60_000,
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (billing?.state.kind !== "restricted") throw new Error("restricted billing missing");
      await ctx.db.patch(billing._id, {
        state: {
          ...billing.state,
          recoveryManagerPersonIds: [ids.personId],
          previousActiveShopIds: [ids.shopId],
        },
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
        stripeSubscriptionItemId: "si_shiftori_processor",
        stripePriceId: PRICE_ID,
        livemode: false,
        status: "canceled",
        providerGeneration: 1,
        currentPeriodEndsAt: NOW - 60_000,
        cancelAtPeriodEnd: false,
        latestInvoiceId: INVOICE_ID,
        lastStripeEventCreatedAt: NOW - 60_000,
        lastStripeEventId: "evt_processor_cancelled",
        terminalAt: NOW - 60_000,
        syncedAt: NOW - 60_000,
        createdAt: NOW - 120_000,
        updatedAt: NOW - 60_000,
      });
    });
    mockPaidInvoiceEvent("evt_processor_old_paid", "active", NOW, ids.organizationId, ids.operationId);
    await insertReceipt(t, "evt_processor_old_paid", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_old_paid",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", SUBSCRIPTION_ID),
        )
        .unique(),
    }));
    expect(result.billing?.state.kind).toBe("restricted");
    expect(result.subscription?.terminalAt).toBeDefined();
  });

  it("遅延payment_failedでも現在Invoiceがpaidならactiveをgraceへ戻さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_delayed_failed", {
      kind: "active",
      plan: "pro",
    });
    mockPaidInvoiceEvent(
      "evt_processor_delayed_failed",
      "active",
      NOW - 60_000,
      ids.organizationId,
      ids.operationId,
      "invoice.payment_failed",
    );
    await insertReceipt(t, "evt_processor_delayed_failed", "invoice.payment_failed", INVOICE_ID, NOW - 60_000);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_delayed_failed",
    });

    const billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({ kind: "active", plan: "pro" });
  });

  it("snapshotより古いpayment_failedは現在Invoiceがopenでもactiveをgraceへ戻さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_stale_failed", {
      kind: "active",
      plan: "pro",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
        stripeSubscriptionItemId: "si_shiftori_processor",
        stripePriceId: PRICE_ID,
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        latestInvoiceId: INVOICE_ID,
        lastStripeEventCreatedAt: NOW,
        lastStripeEventId: "evt_newer_snapshot",
        syncedAt: NOW,
        createdAt: NOW - 120_000,
        updatedAt: NOW,
      });
    });
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_processor_stale_failed",
      type: "invoice.payment_failed",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor((NOW - 60_000) / 1000),
      data: { object: { id: INVOICE_ID } },
    });
    provider.retrieveInvoice.mockResolvedValue({
      id: INVOICE_ID,
      customer: CUSTOMER_ID,
      livemode: false,
      status: "open",
      amount_remaining: 1000,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue(
      subscriptionFixture("past_due", ids.organizationId, ids.operationId),
    );
    await insertReceipt(t, "evt_processor_stale_failed", "invoice.payment_failed", INVOICE_ID, NOW - 60_000);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_stale_failed",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      event: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_processor_stale_failed"))
        .unique(),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.event).toMatchObject({ status: "ignored", lastErrorCode: "subscription_snapshot_stale" });
  });

  it("失敗EventがT2→T1で届いても猶予はT1から14日へ短縮し、後発Eventで延長しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_grace_first_failure", {
      kind: "active",
      plan: "pro",
    });
    const firstFailureAt = NOW - 2 * 60 * 60_000;
    const laterFailureAt = NOW - 60 * 60_000;
    const newestFailureAt = NOW;
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    provider.retrieveEvent
      .mockResolvedValueOnce({
        id: "evt_failure_t2",
        type: "invoice.payment_failed",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(laterFailureAt / 1000),
        data: { object: { id: INVOICE_ID } },
      })
      .mockResolvedValueOnce({
        id: "evt_failure_t1",
        type: "invoice.payment_failed",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(firstFailureAt / 1000),
        data: { object: { id: INVOICE_ID } },
      })
      .mockResolvedValueOnce({
        id: "evt_failure_t3",
        type: "invoice.payment_failed",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(newestFailureAt / 1000),
        data: { object: { id: INVOICE_ID } },
      });
    provider.retrieveInvoice.mockResolvedValue({
      id: INVOICE_ID,
      customer: CUSTOMER_ID,
      livemode: false,
      status: "open",
      amount_remaining: 1000,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue(
      subscriptionFixture("past_due", ids.organizationId, ids.operationId),
    );
    await insertReceipt(t, "evt_failure_t2", "invoice.payment_failed", INVOICE_ID, laterFailureAt);
    await insertReceipt(t, "evt_failure_t1", "invoice.payment_failed", INVOICE_ID, firstFailureAt);
    await insertReceipt(t, "evt_failure_t3", "invoice.payment_failed", INVOICE_ID, newestFailureAt);

    for (const stripeEventId of ["evt_failure_t2", "evt_failure_t1", "evt_failure_t3"]) {
      await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });
    }

    const billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({
      kind: "grace",
      plan: "pro",
      startedAt: firstFailureAt,
      endsAt: firstFailureAt + 14 * 24 * 60 * 60_000,
    });
    expect(billing?.version).toBe(4);
  });

  it("同一秒のEvent IDが逆順でもrefetch済みの解約をlocalへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_same_second_deleted", {
      kind: "active",
      plan: "pro",
    });
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    provider.retrieveEvent
      .mockResolvedValueOnce({
        id: "evt_zz_same_second_updated",
        type: "customer.subscription.updated",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(NOW / 1000),
        data: { object: { id: SUBSCRIPTION_ID } },
      })
      .mockResolvedValueOnce({
        id: "evt_aa_same_second_deleted",
        type: "customer.subscription.deleted",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(NOW / 1000),
        data: { object: { id: SUBSCRIPTION_ID } },
      });
    provider.retrieveSubscription
      .mockResolvedValueOnce(subscriptionFixture("active", ids.organizationId, ids.operationId))
      .mockResolvedValueOnce(subscriptionFixture("canceled", ids.organizationId, ids.operationId));
    await insertReceipt(t, "evt_zz_same_second_updated", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);
    await insertReceipt(t, "evt_aa_same_second_deleted", "customer.subscription.deleted", SUBSCRIPTION_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_zz_same_second_updated",
    });
    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_aa_same_second_deleted",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", SUBSCRIPTION_ID),
        )
        .unique(),
      deletedEvent: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_aa_same_second_deleted"))
        .unique(),
    }));
    expect(result.subscription).toMatchObject({
      status: "canceled",
      lastStripeEventId: "evt_aa_same_second_deleted",
      terminalAt: expect.any(Number),
    });
    expect(result.billing?.state).toMatchObject({ kind: "restricted", reason: "unexpectedCancellation" });
    expect(result.deletedEvent).toMatchObject({ status: "processed" });
  });

  it("pausedはprovider取消を確認してから世代を終端化し、再契約可能な制限状態へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_paused_cancel", {
      kind: "active",
      plan: "pro",
    });
    await insertCurrentSubscription(t, ids.organizationId, "active");
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_paused_cancel",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue(subscriptionFixture("paused", ids.organizationId, ids.operationId));
    provider.cancelSubscription.mockResolvedValue({
      ...subscriptionFixture("canceled", ids.organizationId, ids.operationId),
      canceled_at: Math.floor(NOW / 1000),
      ended_at: Math.floor(NOW / 1000),
    });
    await insertReceipt(t, "evt_paused_cancel", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_paused_cancel" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique(),
      organization: await ctx.db.get(ids.organizationId),
    }));
    expect(provider.cancelSubscription).toHaveBeenCalledTimes(1);
    expect(provider.cancelSubscription).toHaveBeenCalledWith(
      SUBSCRIPTION_ID,
      undefined,
      expect.objectContaining({ idempotencyKey: expect.stringMatching(/^shiftori:test:paused-cancel:/) }),
    );
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
    expect(result.billing?.state).toMatchObject({
      kind: "restricted",
      reason: "unexpectedCancellation",
      recoveryManagerPersonIds: [ids.personId],
      previousActiveShopIds: [ids.shopId],
    });
    expect(result.organization?.isDeleted).toBe(false);
    await expect(receiptById(t, "evt_paused_cancel")).resolves.toMatchObject({ status: "processed" });
  });

  it("paused取消前にproviderがactiveへ戻った場合は旧世代を継続し、新規契約可能にはしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_paused_resumed", {
      kind: "active",
      plan: "pro",
    });
    await insertCurrentSubscription(t, ids.organizationId, "active");
    provider.retrieveEvent.mockResolvedValueOnce({
      id: "evt_paused_retry",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValueOnce(
      subscriptionFixture("paused", ids.organizationId, ids.operationId),
    );
    provider.cancelSubscription.mockRejectedValueOnce(new Error("temporary provider failure"));
    await insertReceipt(t, "evt_paused_retry", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_paused_retry" });

    provider.retrieveEvent.mockResolvedValueOnce({
      id: "evt_paused_resumed",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor((NOW + 1000) / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValueOnce(
      subscriptionFixture("active", ids.organizationId, ids.operationId),
    );
    await insertReceipt(t, "evt_paused_resumed", "customer.subscription.updated", SUBSCRIPTION_ID, NOW + 1000);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_paused_resumed" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique(),
    }));
    const organization = await t.query(internal.organizationStripe.queries.resolveOrganizationByCustomer, {
      stripeCustomerId: CUSTOMER_ID,
      livemode: false,
    });
    expect(await receiptById(t, "evt_paused_retry")).toMatchObject({ status: "retrying" });
    expect(await receiptById(t, "evt_paused_resumed")).toMatchObject({ status: "processed" });
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.subscription).toMatchObject({ status: "active" });
    expect(result.subscription?.terminalAt).toBeUndefined();
    expect(organization?.currentStripeSubscriptionId).toBe(SUBSCRIPTION_ID);
    expect(provider.cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it("invoice.paidでもrefetchしたSubscriptionがterminalなら解約状態へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_paid_terminal", {
      kind: "active",
      plan: "pro",
    });
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_paid_terminal",
      type: "invoice.paid",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: INVOICE_ID } },
    });
    provider.retrieveInvoice.mockResolvedValue({
      id: INVOICE_ID,
      customer: CUSTOMER_ID,
      livemode: false,
      status: "paid",
      amount_remaining: 0,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    });
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    provider.retrieveSubscription.mockResolvedValue(
      subscriptionFixture("canceled", ids.organizationId, ids.operationId),
    );
    await insertReceipt(t, "evt_paid_terminal", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_paid_terminal" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", SUBSCRIPTION_ID),
        )
        .unique(),
      event: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_paid_terminal"))
        .unique(),
    }));
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: expect.any(Number) });
    expect(result.billing?.state).toMatchObject({ kind: "restricted", reason: "unexpectedCancellation" });
    expect(result.event).toMatchObject({ status: "processed" });
  });

  it("Checkout完了でもrefetchしたSubscriptionがterminalならpendingActivationのfallbackへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_checkout_terminal", {
      kind: "pendingActivation",
      plan: "pro",
      fallback: "free",
      startedAt: NOW - 60_000,
    });
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_checkout_terminal",
      type: "checkout.session.completed",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: "cs_shiftori_processor" } },
    });
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    provider.retrieveSubscription.mockResolvedValue(
      subscriptionFixture("canceled", ids.organizationId, ids.operationId),
    );
    await insertReceipt(t, "evt_checkout_terminal", "checkout.session.completed", "cs_shiftori_processor", NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_checkout_terminal",
    });

    const billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({ kind: "active", plan: "free" });
    await expect(receiptById(t, "evt_checkout_terminal")).resolves.toMatchObject({ status: "processed" });
  });

  it("取消前に後着したpaidは非terminal世代のpaymentGraceExpiredをactiveへ復旧する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_late_paid", {
      kind: "restricted",
      reason: "paymentGraceExpired",
      previousPlan: "pro",
      recoveryManagerPersonIds: [],
      previousActiveShopIds: [],
      restrictedAt: NOW - 60_000,
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (billing?.state.kind !== "restricted") throw new Error("restricted billing missing");
      await ctx.db.patch(billing._id, {
        state: {
          ...billing.state,
          recoveryManagerPersonIds: [ids.personId],
          previousActiveShopIds: [ids.shopId],
        },
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: ids.organizationId,
        stripeCustomerId: CUSTOMER_ID,
        stripeSubscriptionId: SUBSCRIPTION_ID,
        stripeSubscriptionItemId: "si_shiftori_processor",
        stripePriceId: PRICE_ID,
        livemode: false,
        status: "past_due",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        latestInvoiceId: INVOICE_ID,
        syncedAt: NOW - 60_000,
        createdAt: NOW - 120_000,
        updatedAt: NOW - 60_000,
      });
    });
    mockPaidInvoiceEvent("evt_processor_late_paid", "active", NOW, ids.organizationId, ids.operationId);
    await insertReceipt(t, "evt_processor_late_paid", "invoice.paid", INVOICE_ID, NOW);

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_processor_late_paid",
    });

    const billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({ kind: "active", plan: "pro" });
  });

  it("subscription.updatedのcancel_at_period_endを予約と取消へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedStripeOrganization(t, "stripe_processor_schedule", {
      kind: "active",
      plan: "pro",
    });
    const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
    provider.retrieveCheckout.mockResolvedValue({
      id: "cs_shiftori_processor",
      customer: CUSTOMER_ID,
      subscription: SUBSCRIPTION_ID,
      livemode: false,
      mode: "subscription",
      status: "complete",
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(ids.operationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: PRICE_ID,
      },
    });
    provider.retrieveEvent.mockResolvedValue({
      id: "evt_schedule_on",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor(NOW / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue({
      ...subscriptionFixture("active", ids.organizationId, ids.operationId),
      cancel_at_period_end: true,
    });
    await insertReceipt(t, "evt_schedule_on", "customer.subscription.updated", SUBSCRIPTION_ID, NOW);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_schedule_on" });

    let billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt: periodEndsAt,
    });

    provider.retrieveEvent.mockResolvedValue({
      id: "evt_schedule_current_invoice",
      type: "invoice.paid",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor((NOW + 2000) / 1000),
      data: { object: { id: INVOICE_ID } },
    });
    provider.retrieveInvoice.mockResolvedValue({
      id: INVOICE_ID,
      customer: CUSTOMER_ID,
      livemode: false,
      status: "paid",
      amount_remaining: 0,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue({
      ...subscriptionFixture("active", ids.organizationId, ids.operationId),
      cancel_at_period_end: false,
    });
    await insertReceipt(t, "evt_schedule_current_invoice", "invoice.paid", INVOICE_ID, NOW + 2000);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_schedule_current_invoice",
    });
    billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({ kind: "active", plan: "pro" });

    provider.retrieveEvent.mockResolvedValue({
      id: "evt_schedule_off",
      type: "customer.subscription.updated",
      livemode: false,
      api_version: STRIPE_WEBHOOK_API_VERSION,
      created: Math.floor((NOW + 1000) / 1000),
      data: { object: { id: SUBSCRIPTION_ID } },
    });
    provider.retrieveSubscription.mockResolvedValue({
      ...subscriptionFixture("active", ids.organizationId, ids.operationId),
      cancel_at_period_end: false,
    });
    await insertReceipt(t, "evt_schedule_off", "customer.subscription.updated", SUBSCRIPTION_ID, NOW + 1000);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: "evt_schedule_off" });
    billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing?.state).toEqual({ kind: "active", plan: "pro" });
  });
});

async function seedStripeOrganization(
  t: TestConvex<typeof schema>,
  subject: string,
  billingState: Doc<"organizationBillingStates">["state"],
) {
  return await t.run(async (ctx) => {
    const ids = await seedOrganizationManagerShop(ctx, { subject, plan: "free" });
    await patchBillingState(ctx, ids.organizationId, billingState);
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: ids.organizationId,
      stripeCustomerId: CUSTOMER_ID,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const operationId = await insertCheckoutOperation(ctx, ids.organizationId, subject);
    return { ...ids, operationId };
  });
}

async function patchBillingState(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  state: Doc<"organizationBillingStates">["state"],
) {
  const billing = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (!billing) throw new Error("billing state missing");
  await ctx.db.patch(billing._id, { state, version: billing.version + 1, updatedAt: NOW });
}

async function insertCheckoutOperation(ctx: MutationCtx, organizationId: Id<"organizations">, suffix: string) {
  return await ctx.db.insert("organizationStripeOperations", {
    organizationId,
    kind: "immediateProCheckout",
    requestKey: `request_${suffix}`.slice(0, 64),
    stripeIdempotencyKey: `test:${suffix}`,
    livemode: false,
    expectedBillingVersion: 2,
    providerGeneration: 1,
    stripePriceIdSnapshot: PRICE_ID,
    stripeObjectId: "cs_shiftori_processor",
    status: "succeeded",
    attemptCount: 1,
    completedAt: NOW,
    expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

async function insertReceipt(
  t: TestConvex<typeof schema>,
  stripeEventId: string,
  type:
    | "invoice.paid"
    | "invoice.payment_failed"
    | "customer.subscription.updated"
    | "customer.subscription.deleted"
    | "checkout.session.completed"
    | "checkout.session.expired",
  objectId: string,
  eventCreatedAt: number,
  objectCustomerId?: string,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId,
      type,
      apiVersion: STRIPE_WEBHOOK_API_VERSION,
      livemode: false,
      objectId,
      ...(objectCustomerId ? { objectCustomerId } : {}),
      eventCreatedAt,
      status: "received",
      attemptCount: 0,
      receivedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      updatedAt: NOW,
    });
  });
}

async function receiptById(t: TestConvex<typeof schema>, stripeEventId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
      .unique(),
  );
}

async function seedComplimentaryWebhookMappings(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const ids = await seedOrganizationManagerShop(ctx, {
      subject: "stripe_complimentary_all_webhook_guards",
      plan: "pro",
      complimentary: true,
    });
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: ids.organizationId,
      stripeCustomerId: CUSTOMER_ID,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId: ids.organizationId,
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripePriceId: PRICE_ID,
      livemode: false,
      status: "active",
      providerGeneration: 1,
      cancelAtPeriodEnd: false,
      latestInvoiceId: INVOICE_ID,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeOperations", {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout",
      requestKey: "complimentary-checkout-request",
      stripeIdempotencyKey: "checkout:complimentary",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: PRICE_ID,
      stripeObjectId: "cs_complimentary",
      status: "succeeded",
      attemptCount: 1,
      completedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return ids;
  });
}

async function seedExpiredCheckout(t: TestConvex<typeof schema>, kind: "trialSetupCheckout" | "immediateProCheckout") {
  return await t.run(async (ctx) => {
    const ids = await seedOrganizationManagerShop(ctx, {
      subject: `stripe_expired_${kind}`,
      plan: "free",
    });
    await patchBillingState(
      ctx,
      ids.organizationId,
      kind === "trialSetupCheckout"
        ? { kind: "trial", trialEndsAt: NOW + 30 * 24 * 60 * 60_000 }
        : { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: NOW - 60_000 },
    );
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: ids.organizationId,
      stripeCustomerId: CUSTOMER_ID,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const operationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: ids.organizationId,
      kind,
      requestKey: `expired-${kind}`,
      stripeIdempotencyKey: `checkout:expired:${kind}`,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      stripePriceIdSnapshot: PRICE_ID,
      stripeObjectId: `cs_expired_${kind}`,
      status: "succeeded",
      attemptCount: 1,
      completedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return { ...ids, operationId };
  });
}

function mockPaidInvoiceEvent(
  stripeEventId: string,
  subscriptionStatus: "trialing" | "active",
  createdAt: number,
  organizationId: Id<"organizations">,
  operationId: Id<"organizationStripeOperations">,
  type: "invoice.paid" | "invoice.payment_failed" = "invoice.paid",
) {
  provider.retrieveEvent.mockResolvedValue({
    id: stripeEventId,
    type,
    livemode: false,
    api_version: STRIPE_WEBHOOK_API_VERSION,
    created: Math.floor(createdAt / 1000),
    data: { object: { id: INVOICE_ID } },
  });
  provider.retrieveInvoice.mockResolvedValue({
    id: INVOICE_ID,
    customer: CUSTOMER_ID,
    livemode: false,
    status: "paid",
    parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
  });
  provider.retrieveSubscription.mockResolvedValue(subscriptionFixture(subscriptionStatus, organizationId, operationId));
  provider.retrieveCheckout.mockResolvedValue({
    id: "cs_shiftori_processor",
    customer: CUSTOMER_ID,
    subscription: SUBSCRIPTION_ID,
    livemode: false,
    mode: "subscription",
    status: "complete",
    client_reference_id: String(organizationId),
    metadata: {
      shiftori_organization_id: String(organizationId),
      shiftori_operation_id: String(operationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: PRICE_ID,
    },
  });
}

function subscriptionFixture(
  status: "trialing" | "active" | "past_due" | "canceled" | "paused",
  organizationId: Id<"organizations">,
  operationId: Id<"organizationStripeOperations">,
) {
  return {
    id: SUBSCRIPTION_ID,
    customer: CUSTOMER_ID,
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: PRICE_ID,
      shiftori_operation_id: String(operationId),
    },
    items: {
      data: [
        {
          id: "si_shiftori_processor",
          current_period_end: Math.floor((NOW + 30 * 24 * 60 * 60_000) / 1000),
          price: priceFixture(),
        },
      ],
    },
    trial_end: status === "trialing" ? Math.floor((NOW + 7 * 24 * 60 * 60_000) / 1000) : null,
    cancel_at_period_end: false,
    latest_invoice: INVOICE_ID,
  };
}

async function insertCurrentSubscription(
  t: TestConvex<typeof schema>,
  organizationId: Id<"organizations">,
  status: "active" | "paused",
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId,
      stripeCustomerId: CUSTOMER_ID,
      stripeSubscriptionId: SUBSCRIPTION_ID,
      stripeSubscriptionItemId: "si_shiftori_processor",
      stripePriceId: PRICE_ID,
      livemode: false,
      status,
      providerGeneration: 1,
      currentPeriodEndsAt: NOW + 30 * 24 * 60 * 60_000,
      cancelAtPeriodEnd: false,
      latestInvoiceId: INVOICE_ID,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

function priceFixture() {
  return {
    id: PRICE_ID,
    active: true,
    livemode: false,
    currency: "jpy",
    unit_amount: 1000,
    recurring: { interval: "month", interval_count: 1 },
  };
}
