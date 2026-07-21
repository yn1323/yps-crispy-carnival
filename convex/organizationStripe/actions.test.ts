import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, testAuthTokenIdentifier } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STRIPE_WEBHOOK_EVENT_RETENTION_MS } from "../constants";
import { STRIPE_WEBHOOK_API_VERSION, type StripeBillingConfiguration } from "./config";

const configurationMock = vi.hoisted(() => vi.fn<() => StripeBillingConfiguration>());
const MockStripeError = vi.hoisted(
  () =>
    class extends Error {
      statusCode?: number;
      type: string;

      constructor(statusCode?: number, type = "StripeAPIError") {
        super("Mock Stripe error");
        this.statusCode = statusCode;
        this.type = type;
      }
    },
);

vi.mock("./config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./config")>();
  return { ...actual, getStripeBillingConfiguration: configurationMock };
});

vi.mock("stripe", () => {
  const providerRequest = async (resource: string, args: unknown[] = []) =>
    await globalThis.fetch(`https://stripe.invalid/${resource}`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  class MockStripe {
    static errors = { StripeError: MockStripeError };
    static createFetchHttpClient = vi.fn();
    static createSubtleCryptoProvider = vi.fn();
    prices = { retrieve: async () => await providerRequest("prices.retrieve") };
    checkout = {
      sessions: {
        retrieve: async () => await providerRequest("checkout.sessions.retrieve"),
        create: async (...args: unknown[]) => await providerRequest("checkout.sessions.create", args),
      },
    };
    customers = {
      retrieve: async (...args: unknown[]) => await providerRequest("customers.retrieve", args),
      create: async (...args: unknown[]) => await providerRequest("customers.create", args),
      update: async (...args: unknown[]) => await providerRequest("customers.update", args),
    };
    billingPortal = {
      configurations: {
        retrieve: async (...args: unknown[]) => await providerRequest("billingPortal.configurations.retrieve", args),
      },
      sessions: {
        create: async (...args: unknown[]) => await providerRequest("billingPortal.sessions.create", args),
      },
    };
    subscriptions = {
      list: async (...args: unknown[]) => await providerRequest("subscriptions.list", args),
      retrieve: async (...args: unknown[]) => await providerRequest("subscriptions.retrieve", args),
      update: async (...args: unknown[]) => await providerRequest("subscriptions.update", args),
      cancel: async (...args: unknown[]) => await providerRequest("subscriptions.cancel", args),
      create: async (...args: unknown[]) => await providerRequest("subscriptions.create", args),
    };
    events = { retrieve: async () => await providerRequest("events.retrieve") };
    invoices = {
      retrieve: async (...args: unknown[]) => await providerRequest("invoices.retrieve", args),
      list: async (...args: unknown[]) => await providerRequest("invoices.list", args),
      update: async (...args: unknown[]) => await providerRequest("invoices.update", args),
    };
    setupIntents = { retrieve: async () => await providerRequest("setupIntents.retrieve") };
    paymentMethods = { retrieve: async () => await providerRequest("paymentMethods.retrieve") };
  }
  return { default: MockStripe };
});

const READY_TEST_CONFIGURATION = {
  status: "ready",
  livemode: false,
  secretKey: "sk_test_organization_stripe",
  webhookSecret: "whsec_organization_stripe",
  proPriceId: "price_pro_test",
  portalConfigurationId: "bpc_test",
} satisfies StripeBillingConfiguration;
const NOW = Date.parse("2026-07-20T00:00:00.000Z");
const providerFetchMock = vi.fn<typeof globalThis.fetch>(async () => {
  throw new Error("Unexpected Stripe provider call");
});

describe("organizationStripe/actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    configurationMock.mockReset();
    configurationMock.mockReturnValue(READY_TEST_CONFIGURATION);
    providerFetchMock.mockReset();
    providerFetchMock.mockImplementation(async () => {
      throw new Error("Unexpected Stripe provider call");
    });
    vi.stubGlobal("fetch", providerFetchMock);
    vi.stubEnv("STRIPE_SECRET_KEY", READY_TEST_CONFIGURATION.secretKey);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", READY_TEST_CONFIGURATION.webhookSecret);
    vi.stubEnv("STRIPE_PRO_PRICE_ID", READY_TEST_CONFIGURATION.proPriceId);
    vi.stubEnv("APP_URL", "https://app.example.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("complimentary.proでは3 Actionともprovider通信せずStripe 4表を空のまま保つ", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "stripe_complimentary",
          plan: "pro",
          complimentary: true,
        }),
    );

    const results = await invokeBillingActions(t.withIdentity({ subject: "stripe_complimentary" }), ids.shopId);

    expect(results).toEqual([
      { status: "unavailable", reason: "not_allowed" },
      { status: "unavailable", reason: "not_allowed" },
      { status: "unavailable", reason: "not_allowed" },
    ]);
    await expectNoStripeSideEffects(t);
  });

  it("未認証・removed・readOnly・別organizationでは3 Actionともprovider通信しない", async () => {
    {
      const t = convexTest(schema, modules);
      const ids = await t.run(
        async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_unauthenticated", plan: "free" }),
      );
      expect((await settleBillingActions(t, ids.shopId)).map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
      await expectNoStripeSideEffects(t);
    }

    {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_removed", plan: "free" });
        await ctx.db.patch(seeded.memberId, { status: "removed" });
        return seeded;
      });
      expect(
        (await settleBillingActions(t.withIdentity({ subject: "stripe_removed" }), ids.shopId)).map(
          (result) => result.status,
        ),
      ).toEqual(["rejected", "rejected", "rejected"]);
      await expectNoStripeSideEffects(t);
    }

    {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_read_only", plan: "free" });
        await ctx.db.patch(seeded.memberId, { status: "readOnly" });
        return seeded;
      });
      expect(await invokeBillingActions(t.withIdentity({ subject: "stripe_read_only" }), ids.shopId)).toEqual([
        { status: "unavailable", reason: "not_allowed" },
        { status: "unavailable", reason: "not_allowed" },
        { status: "unavailable", reason: "not_allowed" },
      ]);
      await expectNoStripeSideEffects(t);
    }

    {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        await seedOrganizationManagerShop(ctx, { subject: "stripe_other_org_actor", plan: "free" });
        return await seedOrganizationManagerShop(ctx, { subject: "stripe_other_org_target", plan: "free" });
      });
      expect(
        (await settleBillingActions(t.withIdentity({ subject: "stripe_other_org_actor" }), ids.shopId)).map(
          (result) => result.status,
        ),
      ).toEqual(["rejected", "rejected", "rejected"]);
      await expectNoStripeSideEffects(t);
    }
  });

  it("必須設定不足では3 Actionともprovider通信しない", async () => {
    const configuration = {
      status: "misconfigured",
      missing: ["STRIPE_SECRET_KEY"],
    } satisfies StripeBillingConfiguration;
    configurationMock.mockReturnValue(configuration);
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_config_missing", plan: "free" }),
    );

    const results = await invokeBillingActions(t.withIdentity({ subject: "stripe_config_missing" }), ids.shopId);

    expect(results).toEqual([
      { status: "unavailable", reason: "configuration_pending" },
      { status: "unavailable", reason: "configuration_pending" },
      { status: "unavailable", reason: "configuration_pending" },
    ]);
    await expectNoStripeSideEffects(t);
  });

  it("Pro Priceがアーカイブ済みなら価格を公開せず、新しいCheckoutを作成しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_price_archived", plan: "free" }),
    );
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      return providerResponse({
        id: READY_TEST_CONFIGURATION.proPriceId,
        active: false,
        livemode: false,
        currency: "jpy",
        unit_amount: 1480,
        recurring: { interval: "month", interval_count: 1 },
      });
    });
    const actor = t.withIdentity({ subject: "stripe_price_archived" });

    await expect(actor.action(api.organizationStripe.actions.getProPrice, { shopId: ids.shopId })).resolves.toEqual({
      status: "unavailable",
      reason: "price_unavailable",
    });
    await expect(
      actor.action(api.organizationStripe.actions.startProCheckout, {
        shopId: ids.shopId,
        requestId: "archived-price-checkout",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });

    expect(providerResources).toEqual(["prices.retrieve", "prices.retrieve"]);
    const state = await stripeState(t);
    expect(state.customers).toEqual([]);
    expect(state.subscriptions).toEqual([]);
    expect(state.events).toEqual([]);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ status: "failed", lastErrorCode: "price_invalid" });
  });

  it.each([
    { kind: "trial", expectedMode: "setup" },
    { kind: "immediate", expectedMode: "subscription" },
  ] as const)("$kind Checkoutはcard限定かつ固定の戻り先を使い、生カードfieldを渡さない", async (testCase) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `stripe_checkout_payload_${testCase.kind}`,
        plan: "free",
      });
      if (testCase.kind === "trial") {
        const billing = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billing) throw new Error("billing state missing");
        await ctx.db.patch(billing._id, {
          state: { kind: "trial", trialEndsAt: NOW + 14 * 24 * 60 * 60_000 },
          updatedAt: NOW,
        });
      }
      return seeded;
    });
    const checkoutCreateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "customers.create") {
        return providerResponse({ id: `cus_checkout_payload_${testCase.kind}`, livemode: false });
      }
      if (resource === "checkout.sessions.create") {
        checkoutCreateCalls.push(args);
        return providerResponse({
          id: `cs_checkout_payload_${testCase.kind}`,
          url: `https://checkout.stripe.test/${testCase.kind}`,
          livemode: false,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: `stripe_checkout_payload_${testCase.kind}` })
        .action(api.organizationStripe.actions.startProCheckout, {
          shopId: ids.shopId,
          requestId: `checkout-payload-${testCase.kind}`,
        }),
    ).resolves.toEqual({ status: "redirect", url: `https://checkout.stripe.test/${testCase.kind}` });

    expect(checkoutCreateCalls).toHaveLength(1);
    const payload = checkoutCreateCalls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ mode: testCase.expectedMode, payment_method_types: ["card"] });
    for (const [urlValue, result] of [
      [payload.success_url, "returned"],
      [payload.cancel_url, "cancelled"],
    ] as const) {
      const url = new URL(String(urlValue));
      expect(`${url.origin}${url.pathname}`).toBe("https://app.example.test/settings");
      expect(url.searchParams.get("tab")).toBe("billing");
      expect(url.searchParams.get("stripe")).toBe(result);
    }
    expect(payload).not.toHaveProperty("payment_method_data");
    expect(payload).not.toHaveProperty("card");
    expect(payload).not.toHaveProperty("cvc");
    expect(payload).not.toHaveProperty("number");
    expect(payload).not.toHaveProperty("exp_month");
    expect(payload).not.toHaveProperty("exp_year");
  });

  it.each([
    { name: "SetupIntent status", setupPatch: { status: "requires_action" }, errorCode: "setup_intent_invalid" },
    { name: "SetupIntent usage", setupPatch: { usage: "on_session" }, errorCode: "setup_intent_invalid" },
    {
      name: "SetupIntent customer",
      setupPatch: { customer: "cus_other_setup_intent" },
      errorCode: "setup_intent_invalid",
    },
    {
      name: "PaymentMethod type",
      paymentMethodPatch: { type: "us_bank_account" },
      errorCode: "payment_method_invalid",
    },
    {
      name: "PaymentMethod customer",
      paymentMethodPatch: { customer: "cus_other_payment_method" },
      errorCode: "payment_method_invalid",
    },
  ])("$name不一致ではSubscriptionを作らずactionRequiredにする", async (testCase) => {
    const t = convexTest(schema, modules);
    const suffix = testCase.name.replaceAll(" ", "-").toLowerCase();
    const ids = await seedTrialCheckoutCompletion(t, suffix);
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: ids.stripeSetupIntentId,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "setupIntents.retrieve") {
        return providerResponse({
          id: ids.stripeSetupIntentId,
          customer: ids.stripeCustomerId,
          payment_method: ids.stripePaymentMethodId,
          status: "succeeded",
          usage: "off_session",
          ...testCase.setupPatch,
        });
      }
      if (resource === "paymentMethods.retrieve") {
        return providerResponse({
          id: ids.stripePaymentMethodId,
          customer: ids.stripeCustomerId,
          type: "card",
          ...testCase.paymentMethodPatch,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    const state = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      createOperations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("kind", "createTrialSubscription"),
        )
        .collect(),
    }));
    expect(state.billing?.state).toEqual({ kind: "trial", trialEndsAt: ids.trialEndsAt });
    expect(state.receipt).toMatchObject({ status: "actionRequired", lastErrorCode: testCase.errorCode });
    expect(state.subscriptions).toEqual([]);
    expect(state.createOperations).toEqual([]);
    expect(providerResources).not.toContain("subscriptions.create");
  });

  it("Stripe拒否詳細・email・tokenをclient、console、永続状態へ露出しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "stripe_error_redaction",
          plan: "free",
        }),
    );
    const sentinels = [
      "decline-sentinel-do-not-expose",
      "provider-email-sentinel@example.test",
      "tok_provider_sentinel_do_not_expose",
    ];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "customers.create") {
        return providerResponse({ id: "cus_error_redaction", livemode: false });
      }
      if (resource === "checkout.sessions.create") {
        const error = new MockStripeError(402, "StripeCardError");
        error.message = sentinels.join(" ");
        throw Object.assign(error, {
          decline_code: sentinels[0],
          raw: { message: sentinels[0], email: sentinels[1], token: sentinels[2] },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await t
      .withIdentity({ subject: "stripe_error_redaction" })
      .action(api.organizationStripe.actions.startProCheckout, {
        shopId: ids.shopId,
        requestId: "stripe-error-redaction",
      });
    const state = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      customers: await ctx.db.query("organizationStripeCustomers").collect(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
      operations: await ctx.db.query("organizationStripeOperations").collect(),
      receipts: await ctx.db.query("stripeWebhookEvents").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const exposed = JSON.stringify({
      result,
      state,
      console: [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls],
    });

    expect(result).toEqual({ status: "unavailable", reason: "configuration_pending" });
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ status: "retrying", lastErrorCode: "stripe_request_rejected" });
    for (const sentinel of sentinels) expect(exposed).not.toContain(sentinel);
  });

  it("Pro Priceのアーカイブ後は発行済みTrial Setupの完了からSubscriptionを作成しない", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW - 1;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_setup_completed_after_archive" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_setup_completed_after_archive",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const checkoutOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "trialSetupCheckout",
        requestKey: "setup_completed_after_archive",
        stripeIdempotencyKey: "test:setup-completed-after-archive",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        stripeObjectId: "cs_setup_completed_after_archive",
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("stripeWebhookEvents", {
        stripeEventId: "evt_setup_completed_after_archive",
        type: "checkout.session.completed",
        apiVersion: STRIPE_WEBHOOK_API_VERSION,
        livemode: false,
        objectId: "cs_setup_completed_after_archive",
        eventCreatedAt: NOW,
        status: "received",
        attemptCount: 0,
        receivedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        updatedAt: NOW,
      });
      return { ...seeded, checkoutOperationId };
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: "evt_setup_completed_after_archive",
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: "cs_setup_completed_after_archive" } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: "cs_setup_completed_after_archive",
          customer: "cus_setup_completed_after_archive",
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: "seti_setup_completed_after_archive",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "setupIntents.retrieve") {
        return providerResponse({
          id: "seti_setup_completed_after_archive",
          customer: "cus_setup_completed_after_archive",
          payment_method: "pm_setup_completed_after_archive",
          status: "succeeded",
          usage: "off_session",
        });
      }
      if (resource === "paymentMethods.retrieve") {
        return providerResponse({
          id: "pm_setup_completed_after_archive",
          customer: "cus_setup_completed_after_archive",
          type: "card",
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_setup_completed_after_archive",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_setup_completed_after_archive"))
        .unique(),
      trialSubscriptionOperations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("kind", "createTrialSubscription"),
        )
        .collect(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    }));
    expect(providerResources).toEqual(["events.retrieve", "checkout.sessions.retrieve", "prices.retrieve"]);
    expect(providerResources).not.toContain("subscriptions.create");
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt });
    expect(result.receipt).toMatchObject({
      status: "actionRequired",
      lastErrorCode: "price_invalid",
      processedAt: NOW,
    });
    expect(result.trialSubscriptionOperations).toEqual([]);
    expect(result.subscriptions).toEqual([]);
  });

  it("Price停止前のbind未完了Subscriptionは一意なprovider objectだけを回収して取消す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_unbound",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const providerArgs = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        expect(providerArgs[0]).toEqual({ customer: ids.stripeCustomerId, status: "all", limit: 100 });
        return providerResponse({ data: [inactivePriceTrialSubscription(ids)], has_more: false });
      }
      if (resource === "subscriptions.cancel") {
        expect(providerArgs[0]).toBe(ids.stripeSubscriptionId);
        return providerResponse(inactivePriceTrialSubscription(ids, "canceled"));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.list",
      "subscriptions.cancel",
    ]);
    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      cleanup: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("kind", "cancelSubscription"),
        )
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique(),
    }));
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt: ids.trialEndsAt });
    expect(result.receipt).toMatchObject({ status: "actionRequired", lastErrorCode: "price_inactive" });
    expect(result.source).toMatchObject({
      status: "actionRequired",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionId,
      lastErrorCode: "price_inactive",
    });
    expect(result.cleanup).toMatchObject({
      status: "succeeded",
      recoveryPurpose: "invalidTrialSubscriptionCancellation",
      sourceOperationId: ids.sourceOperationId,
      stripeObjectId: ids.stripeSubscriptionId,
    });
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
  });

  it("Price停止前にローカル同期済みのSubscriptionは現在のPaymentMethodに依存せずTrial選択へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_mapped",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "mapped",
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse(inactivePriceTrialSubscription(ids));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
    ]);
    expect(providerResources).not.toContain("subscriptions.create");
    expect(providerResources).not.toContain("subscriptions.cancel");
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique(),
    }));
    expect(result.billing).toMatchObject({
      state: { kind: "trial", trialEndsAt: ids.trialEndsAt, selectedPaidPlan: "pro" },
    });
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionId,
    });
    expect(result.subscription).toMatchObject({ status: "trialing" });
  });

  it("Price停止前に同期済みの契約が期限後activeかつ支払済みならFreeからProへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_active_paid",
      trialEndsAt: NOW - 60_000,
      source: "mapped",
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "active", plan: "free" },
        version: billing.version + 1,
        updatedAt: NOW,
      });
    });
    const providerResources = mockInactivePriceMappedWebhook(ids, {
      ...inactivePriceTrialSubscription(ids),
      status: "active",
      latest_invoice: {
        id: "in_inactive_price_active_paid",
        customer: ids.stripeCustomerId,
        livemode: false,
        status: "paid",
        amount_remaining: 0,
        parent: { subscription_details: { subscription: ids.stripeSubscriptionId } },
      },
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
    ]);
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.billing).toMatchObject({ state: { kind: "active", plan: "pro" } });
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({ status: "succeeded" });
  });

  it.each([
    ["trialing", "trial_subscription_billing_state_invalid"],
    ["past_due", "subscription_billing_state_invalid"],
  ] as const)("期限後ローカルFreeでproviderが%sなら将来課金を防ぐため同期済み契約を取消す", async (providerStatus, expectedErrorCode) => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: `inactive_price_free_${providerStatus}`,
      trialEndsAt: NOW - 60_000,
      source: "mapped",
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "active", plan: "free" },
        version: billing.version + 1,
        updatedAt: NOW,
      });
    });
    const providerResources = mockInactivePriceMappedWebhook(ids, {
      ...inactivePriceTrialSubscription(ids),
      status: providerStatus,
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
      "subscriptions.cancel",
    ]);
    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique(),
    }));
    expect(result.billing).toMatchObject({ state: { kind: "active", plan: "free" } });
    expect(result.receipt).toMatchObject({ status: "actionRequired", lastErrorCode: expectedErrorCode });
    expect(result.source).toMatchObject({ status: "actionRequired", lastErrorCode: expectedErrorCode });
    expect(result.subscription).toMatchObject({ status: "canceled" });
  });

  it("同期済みTrialのprovider境界が作成intentと違う場合は取消し、選択済みProも解除する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_trial_boundary_mismatch",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "mapped",
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      const mapping = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique();
      if (!billing || !mapping) throw new Error("billing fixture missing");
      const mismatchedTrialEndsAt = ids.trialEndsAt + 24 * 60 * 60_000;
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt: ids.trialEndsAt, selectedPaidPlan: "pro" },
        version: billing.version + 1,
        updatedAt: NOW,
      });
      await ctx.db.patch(mapping._id, { trialEndsAt: mismatchedTrialEndsAt, updatedAt: NOW });
    });
    const providerResources = mockInactivePriceMappedWebhook(ids, {
      ...inactivePriceTrialSubscription(ids),
      trial_end: Math.floor((ids.trialEndsAt + 24 * 60 * 60_000) / 1000),
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
      "subscriptions.cancel",
    ]);
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique(),
    }));
    expect(result.billing).toMatchObject({ state: { kind: "trial", trialEndsAt: ids.trialEndsAt } });
    expect(result.billing?.state).not.toHaveProperty("selectedPaidPlan");
    expect(result.receipt).toMatchObject({ status: "actionRequired", lastErrorCode: "trial_subscription_invalid" });
    expect(result.source).toMatchObject({ status: "actionRequired", lastErrorCode: "trial_subscription_invalid" });
    expect(result.subscription).toMatchObject({ status: "canceled" });
  });

  it("Price停止前に同期とTrial選択まで完了した再送は追加のprovider操作なしで収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_converged_replay",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "mapped",
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt: ids.trialEndsAt, selectedPaidPlan: "pro" },
        version: billing.version + 1,
        updatedAt: NOW,
      });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual(["events.retrieve", "checkout.sessions.retrieve", "prices.retrieve"]);
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      cleanup: await ctx.db
        .query("organizationStripeOperations")
        .filter((q) =>
          q.and(q.eq(q.field("organizationId"), ids.organizationId), q.eq(q.field("kind"), "cancelSubscription")),
        )
        .collect(),
    }));
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({ status: "succeeded", attemptCount: 1 });
    expect(result.cleanup).toEqual([]);
  });

  it("Price停止前の取消済みSubscription再送はpendingActivationへ戻さず取消状態へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_canceled_replay",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "mapped",
    });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      const mapping = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique();
      if (!billing || !mapping) throw new Error("billing fixture missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "active", plan: "free" },
        version: billing.version + 1,
        updatedAt: NOW,
      });
      await ctx.db.patch(mapping._id, { status: "canceled", terminalAt: NOW, updatedAt: NOW });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          ...inactivePriceTrialSubscription(ids, "canceled"),
          canceled_at: Math.floor(NOW / 1000),
          ended_at: Math.floor(NOW / 1000),
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
    ]);
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.billing).toMatchObject({ state: { kind: "active", plan: "free" } });
    expect(result.billing?.state.kind).not.toBe("pendingActivation");
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({ status: "succeeded" });
  });

  it("Price停止の取消判定より通常同期が先行した場合は同期済みSubscriptionを保持する", async () => {
    const t = convexTest(schema, modules);
    const suffix = "inactive_price_save_wins";
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix,
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    const sourceLeaseToken = `${suffix}-abandoned-lease`;
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.sourceOperationId, { stripeObjectId: ids.stripeSubscriptionId });
    });
    const before = await t.query(internal.organizationStripe.queries.getTrialCreationRecoveryContext, {
      organizationId: ids.organizationId,
      requestKey: ids.stripeEventId,
    });
    expect(before).toMatchObject({ mappingState: "none" });

    await t.mutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
      organizationId: ids.organizationId,
      stripeCustomerId: ids.stripeCustomerId,
      stripeSubscriptionId: ids.stripeSubscriptionId,
      stripeSubscriptionItemId: ids.stripeSubscriptionItemId,
      stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
      livemode: false,
      status: "trialing",
      providerGeneration: 1,
      trialEndsAt: ids.trialEndsAt,
      currentPeriodEndsAt: ids.trialEndsAt,
      cancelAtPeriodEnd: false,
      eventCreatedAt: Math.floor(NOW / 1000),
      stripeEventId: ids.stripeEventId,
      syncedAt: NOW,
      trialCreationOperationId: ids.sourceOperationId,
      trialCreationOperationLeaseToken: sourceLeaseToken,
    });
    const resolution = await t.mutation(internal.organizationStripe.mutations.resolveInactivePriceTrialSubscription, {
      organizationId: ids.organizationId,
      sourceOperationId: ids.sourceOperationId,
      sourceLeaseToken,
      requestKey: "inactive_price_save_wins_cleanup",
      stripeSubscriptionId: ids.stripeSubscriptionId,
      errorCode: "price_inactive",
    });

    expect(resolution).toMatchObject({
      kind: "preserved",
      providerGeneration: 1,
      billingConverged: false,
      leaseToken: expect.any(String),
    });
    const result = await t.run(async (ctx) => ({
      source: await ctx.db.get(ids.sourceOperationId),
      cleanup: await ctx.db
        .query("organizationStripeOperations")
        .filter((q) =>
          q.and(q.eq(q.field("organizationId"), ids.organizationId), q.eq(q.field("kind"), "cancelSubscription")),
        )
        .collect(),
    }));
    expect(result.source).toMatchObject({
      status: "processing",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionId,
    });
    expect(result.cleanup).toEqual([]);
  });

  it("Price停止の取消intentが先行した場合は古い通常同期を拒否して同じ取消を再利用する", async () => {
    const t = convexTest(schema, modules);
    const suffix = "inactive_price_cleanup_wins";
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix,
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    const sourceLeaseToken = `${suffix}-abandoned-lease`;
    const requestKey = "inactive_price_cleanup_wins_key";
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.sourceOperationId, { stripeObjectId: ids.stripeSubscriptionId });
    });
    const first = await t.mutation(internal.organizationStripe.mutations.resolveInactivePriceTrialSubscription, {
      organizationId: ids.organizationId,
      sourceOperationId: ids.sourceOperationId,
      sourceLeaseToken,
      requestKey,
      stripeSubscriptionId: ids.stripeSubscriptionId,
      errorCode: "price_inactive",
    });
    expect(first).toMatchObject({ kind: "cleanup", operation: { created: true, status: "processing" } });
    if (first.kind !== "cleanup") throw new Error("cleanup operation missing");

    await expect(
      t.mutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
        organizationId: ids.organizationId,
        stripeCustomerId: ids.stripeCustomerId,
        stripeSubscriptionId: ids.stripeSubscriptionId,
        stripeSubscriptionItemId: ids.stripeSubscriptionItemId,
        stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
        livemode: false,
        status: "trialing",
        providerGeneration: 1,
        trialEndsAt: ids.trialEndsAt,
        currentPeriodEndsAt: ids.trialEndsAt,
        cancelAtPeriodEnd: false,
        eventCreatedAt: Math.floor(NOW / 1000),
        stripeEventId: ids.stripeEventId,
        syncedAt: NOW,
        trialCreationOperationId: ids.sourceOperationId,
        trialCreationOperationLeaseToken: sourceLeaseToken,
      }),
    ).rejects.toThrow("Trial subscription operation no longer owns snapshot");

    const repeated = await t.mutation(internal.organizationStripe.mutations.resolveInactivePriceTrialSubscription, {
      organizationId: ids.organizationId,
      sourceOperationId: ids.sourceOperationId,
      requestKey,
      stripeSubscriptionId: ids.stripeSubscriptionId,
      errorCode: "price_inactive",
    });
    expect(repeated).toMatchObject({
      kind: "cleanup",
      operation: {
        operationId: first.operation.operationId,
        stripeIdempotencyKey: first.operation.stripeIdempotencyKey,
        created: false,
      },
    });
    const result = await t.run(async (ctx) => ({
      source: await ctx.db.get(ids.sourceOperationId),
      mapping: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
          q.eq("livemode", false).eq("stripeSubscriptionId", ids.stripeSubscriptionId),
        )
        .unique(),
    }));
    expect(result.source).toMatchObject({ status: "actionRequired", lastErrorCode: "price_inactive" });
    expect(result.mapping).toBeNull();
  });

  it.each([
    { initialAttemptCount: 2, initialReceiptAttemptCount: 0 },
    { initialAttemptCount: 8, initialReceiptAttemptCount: 7 },
  ])("Price停止時は元create試行が$initialAttemptCount回、Webhook試行が$initialReceiptAttemptCount回でも3回再照合する", async ({
    initialAttemptCount,
    initialReceiptAttemptCount,
  }) => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: `inactive_price_not_found_${initialAttemptCount}`,
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    await t.run(async (ctx) => {
      const receipt = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique();
      if (!receipt) throw new Error("webhook receipt missing");
      await ctx.db.patch(ids.sourceOperationId, {
        status: initialAttemptCount >= 8 ? "actionRequired" : "retrying",
        attemptCount: initialAttemptCount,
        lastErrorCode: initialAttemptCount >= 8 ? "attempt_limit_exceeded" : "stripe_create_result_unknown",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        nextRunAt: undefined,
        completedAt: initialAttemptCount >= 8 ? NOW - 1 : undefined,
        updatedAt: NOW,
      });
      await ctx.db.patch(receipt._id, { attemptCount: initialReceiptAttemptCount, updatedAt: NOW });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        return providerResponse({ data: [], has_more: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    const firstRetryDelay = initialReceiptAttemptCount >= 7 ? 30 * 60_000 : 30_000;
    const secondRetryDelay = initialReceiptAttemptCount >= 7 ? 30 * 60_000 : 60_000;
    vi.setSystemTime(NOW + firstRetryDelay + 1);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    vi.setSystemTime(NOW + firstRetryDelay + secondRetryDelay + 2);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources.filter((resource) => resource === "subscriptions.list")).toHaveLength(3);
    expect(providerResources).not.toContain("subscriptions.create");
    expect(providerResources).not.toContain("subscriptions.cancel");
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.receipt).toMatchObject({
      status: "actionRequired",
      attemptCount: initialReceiptAttemptCount + 3,
      lastErrorCode: "price_inactive_subscription_not_found",
    });
    expect(result.source).toMatchObject({
      status: "actionRequired",
      attemptCount: initialAttemptCount + 3,
      lastErrorCode: "price_inactive_subscription_not_found",
    });
  });

  it("既存Subscription一覧の一時障害がWebhook上限に達しても回復照合を継続する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_provider_retry_after_webhook_limit",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    await t.run(async (ctx) => {
      const receipt = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique();
      if (!receipt) throw new Error("webhook receipt missing");
      await ctx.db.patch(ids.sourceOperationId, {
        status: "actionRequired",
        attemptCount: 8,
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.patch(receipt._id, { attemptCount: 7, updatedAt: NOW });
    });
    const providerResources: string[] = [];
    let listAttemptCount = 0;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        listAttemptCount += 1;
        if (listAttemptCount === 1) throw new MockStripeError(undefined, "StripeConnectionError");
        return providerResponse({ data: [], has_more: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    expect(
      await t.run(async (ctx) => {
        const receipt = await ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
          .unique();
        return { receipt, source: await ctx.db.get(ids.sourceOperationId) };
      }),
    ).toMatchObject({
      receipt: {
        status: "retrying",
        attemptCount: 8,
        lastErrorCode: "price_inactive_subscription_provider_retry",
      },
      source: {
        status: "retrying",
        attemptCount: 9,
        lastErrorCode: "price_inactive_subscription_pending_0",
      },
    });

    vi.setSystemTime(NOW + 30 * 60_000 + 1);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources.filter((resource) => resource === "subscriptions.list")).toHaveLength(2);
    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.receipt).toMatchObject({
      status: "retrying",
      attemptCount: 9,
      lastErrorCode: "price_inactive_subscription_pending",
    });
    expect(result.source).toMatchObject({
      status: "retrying",
      attemptCount: 10,
      lastErrorCode: "price_inactive_subscription_pending_1",
    });
  });

  it("Price停止回収中の恒久的なStripe 4xxはWebhook上限を越えて再試行しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_provider_rejected_after_webhook_limit",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    await t.run(async (ctx) => {
      const receipt = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique();
      if (!receipt) throw new Error("webhook receipt missing");
      await ctx.db.patch(ids.sourceOperationId, {
        status: "actionRequired",
        attemptCount: 8,
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.patch(receipt._id, { attemptCount: 7, updatedAt: NOW });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        throw new MockStripeError(400, "StripeAPIError");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.receipt).toMatchObject({
      status: "actionRequired",
      attemptCount: 8,
      lastErrorCode: "attempt_limit_exceeded",
    });
    expect(result.source).toMatchObject({
      status: "retrying",
      attemptCount: 9,
      lastErrorCode: "price_inactive_subscription_pending_0",
    });
  });

  it("Price停止回収中の前段Stripe一時障害でもWebhook上限を越えて3回照合する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_outer_provider_retry_after_webhook_limit",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    await t.run(async (ctx) => {
      const receipt = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique();
      if (!receipt) throw new Error("webhook receipt missing");
      await ctx.db.patch(ids.sourceOperationId, {
        status: "actionRequired",
        attemptCount: 8,
        lastErrorCode: "attempt_limit_exceeded",
        leaseToken: undefined,
        leaseExpiresAt: undefined,
        completedAt: NOW - 1,
        updatedAt: NOW,
      });
      await ctx.db.patch(receipt._id, { attemptCount: 7, updatedAt: NOW });
    });
    const providerResources: string[] = [];
    let eventRetrieveAttemptCount = 0;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        eventRetrieveAttemptCount += 1;
        if (eventRetrieveAttemptCount === 2) {
          throw new MockStripeError(undefined, "StripeConnectionError");
        }
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        return providerResponse({ data: [], has_more: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    vi.setSystemTime(NOW + 30 * 60_000 + 1);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    expect(
      await t.run(async (ctx) => {
        const receipt = await ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
          .unique();
        return { receipt, source: await ctx.db.get(ids.sourceOperationId) };
      }),
    ).toMatchObject({
      receipt: {
        status: "retrying",
        attemptCount: 9,
        lastErrorCode: "price_inactive_subscription_provider_retry",
      },
      source: {
        status: "retrying",
        attemptCount: 9,
        lastErrorCode: "price_inactive_subscription_pending_1",
      },
    });

    vi.setSystemTime(NOW + 60 * 60_000 + 2);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });
    vi.setSystemTime(NOW + 90 * 60_000 + 3);
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources.filter((resource) => resource === "events.retrieve")).toHaveLength(4);
    expect(providerResources.filter((resource) => resource === "subscriptions.list")).toHaveLength(3);
    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.receipt).toMatchObject({
      status: "actionRequired",
      attemptCount: 11,
      lastErrorCode: "price_inactive_subscription_not_found",
    });
    expect(result.source).toMatchObject({
      status: "actionRequired",
      attemptCount: 11,
      lastErrorCode: "price_inactive_subscription_not_found",
    });
  });

  it("Webhook 8回目のPrice停止回収claim直後に停止しても再開しSubscription作成を再送しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_reactivated_after_claim",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    await t.run(async (ctx) => {
      const receipt = await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique();
      if (!receipt) throw new Error("webhook receipt missing");
      await ctx.db.patch(receipt._id, { attemptCount: 7, updatedAt: NOW });
    });
    const webhookClaim = await t.mutation(internal.organizationStripe.mutations.claimWebhookEvent, {
      stripeEventId: ids.stripeEventId,
    });
    if (!webhookClaim) throw new Error("webhook claim missing");
    const recoveryArgs = {
      organizationId: ids.organizationId,
      operationId: ids.sourceOperationId,
      requestKey: ids.stripeEventId,
      stripeIdempotencyKey: "test:inactive_price_reactivated_after_claim:create",
      livemode: false,
      providerGeneration: 1,
      stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      webhookLeaseToken: webhookClaim.leaseToken,
    } as const;
    const claimed = await t.mutation(
      internal.organizationStripe.mutations.claimInactivePriceTrialSubscriptionRecovery,
      recoveryArgs,
    );
    expect(claimed).toMatchObject({ created: true, status: "processing" });
    expect(
      await t.run(async (ctx) => {
        const receipt = await ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
          .unique();
        return { receipt, source: await ctx.db.get(ids.sourceOperationId) };
      }),
    ).toMatchObject({
      receipt: {
        status: "processing",
        attemptCount: 8,
        lastErrorCode: "price_inactive_subscription_recovery_busy",
      },
      source: {
        status: "processing",
        attemptCount: 2,
        lastErrorCode: "price_inactive_subscription_pending_0",
      },
    });

    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: `seti_${ids.stripeEventId}`,
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        return providerResponse({ data: [], has_more: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    vi.setSystemTime(NOW + 15 * 60_000 + 1);
    const fenced = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "createTrialSubscription",
      requestKey: ids.stripeEventId,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      trialSubscriptionCreateSnapshot: {
        stripeCustomerId: ids.stripeCustomerId,
        stripePaymentMethodId: ids.stripePaymentMethodId,
        trialEndsAt: ids.trialEndsAt,
      },
    });
    expect(fenced).toMatchObject({ created: false, status: "processing" });
    expect(await t.run(async (ctx) => await ctx.db.get(ids.sourceOperationId))).toMatchObject({
      attemptCount: 2,
      lastErrorCode: "price_inactive_subscription_pending_0",
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.list",
    ]);
    expect(providerResources).not.toContain("setupIntents.retrieve");
    expect(providerResources).not.toContain("paymentMethods.retrieve");
    expect(providerResources).not.toContain("subscriptions.create");
    const result = await t.run(async (ctx) => ({
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
    }));
    expect(result.receipt).toMatchObject({
      status: "retrying",
      attemptCount: 9,
      lastErrorCode: "price_inactive_subscription_pending",
    });
    expect(result.source).toMatchObject({
      status: "retrying",
      attemptCount: 3,
      lastErrorCode: "price_inactive_subscription_pending_1",
    });
  });

  it("Price停止時に未bind Subscription候補が複数なら推測せず新規作成もしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_price_ambiguous",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "unbound",
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "events.retrieve") {
        return providerResponse({
          id: ids.stripeEventId,
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: ids.stripeSessionId } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: ids.stripeSessionId,
          customer: ids.stripeCustomerId,
          livemode: false,
          mode: "setup",
          status: "complete",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: READY_TEST_CONFIGURATION.proPriceId,
          active: false,
          livemode: false,
          currency: "jpy",
          unit_amount: 1480,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.list") {
        const candidate = inactivePriceTrialSubscription(ids);
        return providerResponse({
          data: [
            { ...candidate, id: "sub_inactive_price_ambiguous_a" },
            { ...candidate, id: "sub_inactive_price_ambiguous_b" },
          ],
          has_more: false,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.list",
    ]);
    expect(providerResources).not.toContain("subscriptions.create");
    expect(providerResources).not.toContain("subscriptions.cancel");
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipt: await ctx.db
        .query("stripeWebhookEvents")
        .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", ids.stripeEventId))
        .unique(),
      source: await ctx.db.get(ids.sourceOperationId),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    }));
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt: ids.trialEndsAt });
    expect(result.receipt).toMatchObject({
      status: "actionRequired",
      lastErrorCode: "trial_subscription_recovery_ambiguous",
    });
    expect(result.source).toMatchObject({
      status: "actionRequired",
      attemptCount: 2,
      lastErrorCode: "trial_subscription_recovery_ambiguous",
    });
    expect(result.subscriptions).toEqual([]);
  });

  it("同じrequestIdのidempotency keyを維持し、別Checkout要求との競合でもoperationを1件に保つ", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_operation_idempotency", plan: "free" }),
    );
    const args = {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout" as const,
      requestKey: "checkout_request_001",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
    };

    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, args);
    const repeated = await t.mutation(internal.organizationStripe.mutations.beginOperation, args);
    const competing = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...args,
      kind: "trialSetupCheckout",
      requestKey: "checkout_request_002",
    });

    expect(first).toMatchObject({ created: true, conflict: false });
    expect(repeated).toMatchObject({
      operationId: first.operationId,
      stripeIdempotencyKey: first.stripeIdempotencyKey,
      created: false,
      conflict: false,
    });
    expect(competing).toMatchObject({
      operationId: first.operationId,
      stripeIdempotencyKey: first.stripeIdempotencyKey,
      created: false,
      conflict: true,
    });
    expect(first.stripeIdempotencyKey).toBe(
      `shiftori:test:immediateProCheckout:${ids.organizationId}:checkout_request_001`,
    );

    const state = await stripeState(t);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      organizationId: ids.organizationId,
      kind: "immediateProCheckout",
      requestKey: "checkout_request_001",
      stripeIdempotencyKey: first.stripeIdempotencyKey,
      status: "processing",
      attemptCount: 1,
    });
    expect(state.customers).toEqual([]);
    expect(state.subscriptions).toEqual([]);
    expect(state.events).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("同じrequestIdでもStripe provider intentが変わったoperationは再利用しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_operation_intent", plan: "free" }),
    );
    const base = {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout" as const,
      requestKey: "immutable_intent_request",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
    };
    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, base);
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: first.operationId,
      leaseToken: first.leaseToken as string,
      status: "retrying",
      errorCode: "temporary_provider_error",
    });

    const changedGeneration = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      providerGeneration: 2,
    });

    expect(changedGeneration).toMatchObject({
      operationId: first.operationId,
      created: false,
      conflict: true,
      status: "retrying",
    });
    const persisted = await t.run(async (ctx) => await ctx.db.get(first.operationId));
    expect(persisted).toMatchObject({ providerGeneration: 1, attemptCount: 1, status: "retrying" });
  });

  it("Trial Subscription createのpayload snapshotが変わったoperationは再利用しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_trial_create_snapshot" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_trial_create_snapshot",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    const base = {
      organizationId: ids.organizationId,
      kind: "createTrialSubscription" as const,
      requestKey: "trial_create_snapshot_request",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
      trialSubscriptionCreateSnapshot: {
        stripeCustomerId: "cus_trial_create_snapshot",
        stripePaymentMethodId: "pm_trial_create_snapshot",
        trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      },
    };
    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, base);
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: first.operationId,
      leaseToken: first.leaseToken as string,
      status: "retrying",
      errorCode: "temporary_provider_error",
    });

    const changedPaymentMethod = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      trialSubscriptionCreateSnapshot: {
        ...base.trialSubscriptionCreateSnapshot,
        stripePaymentMethodId: "pm_changed_trial_create_snapshot",
      },
    });

    expect(changedPaymentMethod).toMatchObject({
      operationId: first.operationId,
      created: false,
      conflict: true,
      status: "retrying",
    });
    const persisted = await t.run(async (ctx) => await ctx.db.get(first.operationId));
    expect(persisted).toMatchObject({
      attemptCount: 1,
      status: "retrying",
      trialSubscriptionCreateSnapshot: base.trialSubscriptionCreateSnapshot,
    });
  });

  it("期限切れTrial Setup operationを即時Pro Checkoutとして再利用しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_cross_kind_reclaim", plan: "free" }),
    );
    const trialSetup = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "trialSetupCheckout",
      requestKey: "trial_setup_stale_request",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: trialSetup.operationId,
      leaseToken: trialSetup.leaseToken as string,
      status: "retrying",
      errorCode: "temporary_provider_error",
    });

    const immediate = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout",
      requestKey: "immediate_after_trial_request",
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
    });

    expect(immediate).toMatchObject({
      operationId: trialSetup.operationId,
      created: false,
      conflict: true,
      status: "retrying",
    });
    const persisted = await t.run(async (ctx) => await ctx.db.get(trialSetup.operationId));
    expect(persisted).toMatchObject({ kind: "trialSetupCheckout", attemptCount: 1, status: "retrying" });
  });

  it("期限切れleaseは同じgenerationのoperationとして回収し、古いworkerの完了を拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_stale_lease", plan: "free" }),
    );
    const base = {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout" as const,
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
    };
    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      requestKey: "stale_lease_request_1",
    });
    vi.setSystemTime(NOW + 16 * 60_000);
    const reclaimed = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      requestKey: "stale_lease_request_2",
    });
    expect(reclaimed).toMatchObject({ operationId: first.operationId, created: true, conflict: false });
    expect(reclaimed.leaseToken).not.toBe(first.leaseToken);
    await expect(
      t.mutation(internal.organizationStripe.mutations.finishOperation, {
        operationId: first.operationId,
        leaseToken: first.leaseToken as string,
        status: "succeeded",
        stripeObjectId: "cs_stale_worker",
      }),
    ).resolves.toEqual({ changed: false });
    await expect(
      t.mutation(internal.organizationStripe.mutations.finishOperation, {
        operationId: reclaimed.operationId,
        leaseToken: reclaimed.leaseToken as string,
        status: "succeeded",
        stripeObjectId: "cs_current_worker",
      }),
    ).resolves.toEqual({ changed: true });
    const competing = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      requestKey: "stale_lease_request_3",
    });
    expect(competing).toMatchObject({
      operationId: first.operationId,
      status: "succeeded",
      stripeObjectId: "cs_current_worker",
      created: false,
      conflict: true,
    });
  });

  it("同じgenerationに古いoperationが100件超あってもCheckout single-flightを見失わない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_many_operations", plan: "free" });
      for (let index = 0; index < 120; index += 1) {
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: seeded.organizationId,
          kind: "portalSession",
          requestKey: `old_portal_${String(index).padStart(3, "0")}`,
          stripeIdempotencyKey: `test:old-portal:${index}`,
          livemode: false,
          providerGeneration: 1,
          status: "succeeded",
          attemptCount: 1,
          completedAt: NOW - 60_000,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW - 60_000,
          updatedAt: NOW - 60_000,
        });
      }
      return seeded;
    });
    const base = {
      organizationId: ids.organizationId,
      kind: "immediateProCheckout" as const,
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      stripePriceIdSnapshot: "price_pro_test",
    };
    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      requestKey: "checkout_after_old_operations_1",
    });
    const competing = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      requestKey: "checkout_after_old_operations_2",
    });
    expect(competing).toMatchObject({ operationId: first.operationId, created: false, conflict: true });
  });

  it("期限後のSetup完了は開始時PriceとPMでtrial_endなし即時Subscriptionへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_late_setup", plan: "free" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt: NOW - 1000 },
        version: 2,
        updatedAt: NOW - 1000,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_late_setup",
        livemode: false,
        createdAt: NOW - 1000,
        updatedAt: NOW - 1000,
      });
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "trialSetupCheckout",
        requestKey: "late_setup_checkout",
        stripeIdempotencyKey: "test:late-setup-checkout",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_started_before_rotation",
        stripeObjectId: "cs_late_setup",
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW - 1000,
        updatedAt: NOW,
      });
      await ctx.db.insert("stripeWebhookEvents", {
        stripeEventId: "evt_late_setup",
        type: "checkout.session.completed",
        apiVersion: STRIPE_WEBHOOK_API_VERSION,
        livemode: false,
        objectId: "cs_late_setup",
        eventCreatedAt: NOW,
        status: "received",
        attemptCount: 0,
        receivedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        updatedAt: NOW,
      });
      return { ...seeded, operationId };
    });
    const providerCalls: Array<{ resource: string; args: unknown[] }> = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      providerCalls.push({ resource, args });
      if (resource === "events.retrieve") {
        return providerResponse({
          id: "evt_late_setup",
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: "cs_late_setup" } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: "cs_late_setup",
          customer: "cus_late_setup",
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: "seti_late_setup",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.operationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: "price_started_before_rotation",
          },
        });
      }
      if (resource === "setupIntents.retrieve") {
        return providerResponse({
          id: "seti_late_setup",
          customer: "cus_late_setup",
          payment_method: "pm_late_setup",
          status: "succeeded",
          usage: "off_session",
        });
      }
      if (resource === "paymentMethods.retrieve") {
        return providerResponse({ id: "pm_late_setup", customer: "cus_late_setup", type: "card" });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: "price_started_before_rotation",
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1000,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.create") {
        const create = args[0] as { metadata: Record<string, string> };
        return providerResponse({
          id: "sub_late_setup",
          customer: "cus_late_setup",
          livemode: false,
          status: "active",
          metadata: create.metadata,
          trial_end: null,
          cancel_at_period_end: false,
          latest_invoice: {
            id: "in_late_setup",
            customer: "cus_late_setup",
            livemode: false,
            status: "paid",
            amount_remaining: 0,
            parent: { subscription_details: { subscription: "sub_late_setup" } },
          },
          items: {
            data: [
              {
                id: "si_late_setup",
                current_period_end: Math.floor((NOW + 30 * 24 * 60 * 60_000) / 1000),
                price: {
                  id: "price_started_before_rotation",
                  active: true,
                  livemode: false,
                  recurring: { interval: "month", interval_count: 1 },
                },
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_late_setup",
    });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_late_setup"))
          .unique(),
      ),
    ).resolves.toMatchObject({ status: "processed" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]).toMatchObject({
      stripeSubscriptionId: "sub_late_setup",
      stripePriceId: "price_started_before_rotation",
      providerGeneration: 1,
    });
    const createCall = providerCalls.find((call) => call.resource === "subscriptions.create");
    expect(createCall?.args[0]).toMatchObject({
      customer: "cus_late_setup",
      items: [{ price: "price_started_before_rotation" }],
      default_payment_method: "pm_late_setup",
    });
    expect(createCall?.args[0]).not.toHaveProperty("trial_end");
  });

  it("Trial用Subscriptionの状態が不正なら即時取消し、operationをactionRequiredで終端化する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW + 10 * 24 * 60 * 60_000;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_invalid_trial_subscription" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_invalid_trial",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const checkoutOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "trialSetupCheckout",
        requestKey: "invalid_trial_checkout",
        stripeIdempotencyKey: "test:invalid-trial-checkout",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_invalid_trial_test",
        stripeObjectId: "cs_invalid_trial",
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("stripeWebhookEvents", {
        stripeEventId: "evt_invalid_trial_subscription",
        type: "checkout.session.completed",
        apiVersion: STRIPE_WEBHOOK_API_VERSION,
        livemode: false,
        objectId: "cs_invalid_trial",
        eventCreatedAt: NOW,
        status: "received",
        attemptCount: 0,
        receivedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        updatedAt: NOW,
      });
      return { ...seeded, checkoutOperationId };
    });
    const cancelCalls: unknown[][] = [];
    let createdMetadata: Record<string, string> = {};
    const subscription = (status: "active" | "canceled", metadata: Record<string, string>) => ({
      id: "sub_invalid_trial",
      customer: "cus_invalid_trial",
      livemode: false,
      status,
      metadata,
      trial_end: Math.floor(trialEndsAt / 1000),
      cancel_at_period_end: false,
      latest_invoice: null,
      items: {
        data: [
          {
            id: "si_invalid_trial",
            current_period_end: Math.floor(trialEndsAt / 1000),
            price: {
              id: "price_invalid_trial_test",
              active: true,
              livemode: false,
              recurring: { interval: "month", interval_count: 1 },
            },
          },
        ],
      },
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "events.retrieve") {
        return providerResponse({
          id: "evt_invalid_trial_subscription",
          type: "checkout.session.completed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: "cs_invalid_trial" } },
        });
      }
      if (resource === "checkout.sessions.retrieve") {
        return providerResponse({
          id: "cs_invalid_trial",
          customer: "cus_invalid_trial",
          livemode: false,
          mode: "setup",
          status: "complete",
          setup_intent: "seti_invalid_trial",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.checkoutOperationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: "price_invalid_trial_test",
          },
        });
      }
      if (resource === "setupIntents.retrieve") {
        return providerResponse({
          id: "seti_invalid_trial",
          customer: "cus_invalid_trial",
          payment_method: "pm_invalid_trial",
          status: "succeeded",
          usage: "off_session",
        });
      }
      if (resource === "paymentMethods.retrieve") {
        return providerResponse({ id: "pm_invalid_trial", customer: "cus_invalid_trial", type: "card" });
      }
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: "price_invalid_trial_test",
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1000,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "subscriptions.create") {
        createdMetadata = (args[0] as { metadata: Record<string, string> }).metadata;
        return providerResponse(subscription("active", createdMetadata));
      }
      if (resource === "subscriptions.cancel") {
        cancelCalls.push(args);
        return providerResponse(subscription("canceled", createdMetadata));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, {
      stripeEventId: "evt_invalid_trial_subscription",
    });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", "evt_invalid_trial_subscription"))
          .unique(),
      ),
    ).resolves.toMatchObject({ status: "actionRequired", lastErrorCode: "trial_subscription_invalid" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operation: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .filter((q) => q.eq(q.field("kind"), "createTrialSubscription"))
        .unique(),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique(),
    }));
    expect(cancelCalls).toHaveLength(1);
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt });
    expect(result.operation).toMatchObject({
      status: "actionRequired",
      stripeObjectId: "sub_invalid_trial",
      lastErrorCode: "trial_subscription_invalid",
    });
    expect(result.operation).not.toHaveProperty("leaseToken");
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
  });

  it("無効Trial取消のprovider成功前に停止しても同じoperationを回収して権利状態を変えずに終端化する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW + 10 * 24 * 60 * 60_000;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_invalid_trial_cleanup_resume" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_invalid_trial_cleanup_resume",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const sourceOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "createTrialSubscription",
        requestKey: "invalid-trial-source-resume",
        stripeIdempotencyKey: "test:invalid-trial-source-resume",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_invalid_trial_cleanup_resume",
        status: "actionRequired",
        attemptCount: 1,
        lastErrorCode: "trial_subscription_invalid",
        completedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const cleanupOperationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "cancelSubscription",
        requestKey: "invalid-trial-cleanup-resume",
        stripeIdempotencyKey: "test:invalid-trial-cleanup-resume",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        recoveryPurpose: "invalidTrialSubscriptionCancellation",
        sourceOperationId,
        stripePriceIdSnapshot: "price_pro_test",
        stripeObjectId: "sub_invalid_trial_cleanup_resume",
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...seeded, sourceOperationId, cleanupOperationId };
    });
    const providerSubscription = (status: "trialing" | "canceled") => ({
      id: "sub_invalid_trial_cleanup_resume",
      customer: "cus_invalid_trial_cleanup_resume",
      livemode: false,
      status,
      metadata: {},
      trial_end: Math.floor(trialEndsAt / 1000),
      cancel_at_period_end: false,
      latest_invoice: null,
      items: {
        data: [
          {
            id: "si_invalid_trial_cleanup_resume",
            current_period_end: Math.floor(trialEndsAt / 1000),
            price: { id: "price_pro_test" },
          },
        ],
      },
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "subscriptions.retrieve") return providerResponse(providerSubscription("trialing"));
      if (resource === "subscriptions.cancel") {
        expect(args[0]).toBe("sub_invalid_trial_cleanup_resume");
        expect((args[2] as { idempotencyKey: string }).idempotencyKey).toBe("test:invalid-trial-cleanup-resume");
        return providerResponse(providerSubscription("canceled"));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileInvalidTrialSubscriptionCancellation, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "invalid-trial-cleanup-resume",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      cleanup: await ctx.db.get(ids.cleanupOperationId),
      source: await ctx.db.get(ids.sourceOperationId),
      subscription: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique(),
    }));
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt });
    expect(result.source).toMatchObject({ status: "actionRequired", lastErrorCode: "trial_subscription_invalid" });
    expect(result.cleanup).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: "sub_invalid_trial_cleanup_resume",
    });
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
  });

  it("initialPaymentPendingはbounded再照合でpaidをactiveへ回収する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_initial_reconcile", plan: "pro" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "initialPaymentPending", plan: "pro", startedAt: NOW - 15 * 60_000 },
        version: 2,
        updatedAt: NOW - 15 * 60_000,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_initial_reconcile",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_initial_reconcile",
        stripeSubscriptionId: "sub_initial_reconcile",
        stripeSubscriptionItemId: "si_initial_reconcile",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "past_due",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        latestInvoiceId: "in_initial_reconcile",
        syncedAt: NOW - 15 * 60_000,
        createdAt: NOW - 15 * 60_000,
        updatedAt: NOW - 15 * 60_000,
      });
      return seeded;
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          id: "sub_initial_reconcile",
          customer: "cus_initial_reconcile",
          livemode: false,
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          latest_invoice: "in_initial_reconcile",
          items: {
            data: [
              {
                id: "si_initial_reconcile",
                price: { id: "price_pro_test" },
                current_period_end: Math.floor((NOW + 30 * 24 * 60 * 60_000) / 1000),
              },
            ],
          },
        });
      }
      if (resource === "invoices.retrieve") {
        return providerResponse({
          id: "in_initial_reconcile",
          customer: "cus_initial_reconcile",
          livemode: false,
          status: "paid",
          amount_remaining: 0,
          parent: { subscription_details: { subscription: "sub_initial_reconcile" } },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileInitialPaymentPending, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "initial-payment-reconcile-2",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operations: await ctx.db.query("organizationStripeOperations").collect(),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({ kind: "reconcileSubscription", status: "succeeded" });
  });

  it("Trial継続取消はprovider成功後のlocal失敗を同じoperationで再収束する", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW + 7 * 24 * 60 * 60_000;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_trial_cancel_recovery" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt, selectedPaidPlan: "pro" },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_trial_cancel_recovery",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_trial_cancel_recovery",
        stripeSubscriptionId: "sub_trial_cancel_recovery",
        stripeSubscriptionItemId: "si_trial_cancel_recovery",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "trialing",
        providerGeneration: 1,
        trialEndsAt,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "cancelSubscription",
        requestKey: "trial-cancel-recovery-request",
        stripeIdempotencyKey: `shiftori:test:cancelSubscription:${seeded.organizationId}:trial-cancel-recovery-request`,
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        recoveryPurpose: "trialContinuationCancellation",
        stripeObjectId: "sub_trial_cancel_recovery",
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...seeded, operationId };
    });
    const canceledSubscription = {
      id: "sub_trial_cancel_recovery",
      customer: "cus_trial_cancel_recovery",
      livemode: false,
      status: "canceled",
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: "price_pro_test",
      },
      trial_end: Math.floor(trialEndsAt / 1000),
      cancel_at_period_end: false,
      latest_invoice: null,
      items: {
        data: [
          {
            id: "si_trial_cancel_recovery",
            current_period_end: Math.floor(trialEndsAt / 1000),
            price: {
              id: "price_pro_test",
              active: true,
              livemode: false,
              recurring: { interval: "month", interval_count: 1 },
            },
          },
        ],
      },
    };
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") return providerResponse(canceledSubscription);
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileTrialContinuationCancellation, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "trial-cancel-recovery-request",
    });

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
      operation: await ctx.db.get(ids.operationId),
    }));
    expect(result.billing?.state).toEqual({ kind: "trial", trialEndsAt });
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
    expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it("Trial取消の回復時に初回請求が支払済みならSubscriptionを解約しない", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW;
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_trial_cancel_already_paid" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "trial", trialEndsAt, selectedPaidPlan: "pro" },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_trial_cancel_already_paid",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_trial_cancel_already_paid",
        stripeSubscriptionId: "sub_trial_cancel_already_paid",
        stripeSubscriptionItemId: "si_trial_cancel_already_paid",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "trialing",
        providerGeneration: 1,
        trialEndsAt,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "cancelSubscription",
        requestKey: "trial-cancel-already-paid-request",
        stripeIdempotencyKey: `shiftori:test:cancelSubscription:${seeded.organizationId}:trial-cancel-already-paid-request`,
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        recoveryPurpose: "trialContinuationCancellation",
        stripeObjectId: "sub_trial_cancel_already_paid",
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...seeded, operationId };
    });
    const providerCalls: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerCalls.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          id: "sub_trial_cancel_already_paid",
          customer: "cus_trial_cancel_already_paid",
          livemode: false,
          status: "active",
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: "price_pro_test",
          },
          trial_end: Math.floor(trialEndsAt / 1000),
          cancel_at_period_end: false,
          latest_invoice: {
            id: "in_trial_cancel_already_paid",
            customer: "cus_trial_cancel_already_paid",
            livemode: false,
            status: "paid",
            amount_remaining: 0,
            parent: { subscription_details: { subscription: "sub_trial_cancel_already_paid" } },
          },
          items: {
            data: [
              {
                id: "si_trial_cancel_already_paid",
                current_period_end: Math.floor((NOW + 30 * 24 * 60 * 60_000) / 1000),
                price: { id: "price_pro_test" },
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileTrialContinuationCancellation, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "trial-cancel-already-paid-request",
    });

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
      operation: await ctx.db.get(ids.operationId),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.subscription).toMatchObject({ status: "active" });
    expect(result.subscription?.terminalAt).toBeUndefined();
    expect(result.operation).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      lastErrorCode: "trial_continuation_already_paid",
    });
    expect(providerCalls).toEqual(["subscriptions.retrieve"]);
  });

  it("期間末Free予約はprovider成功後のlocal停止を同じoperationで回収する", async () => {
    const t = convexTest(schema, modules);
    const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
    const ids = await seedCancelAtPeriodEndRecoveryContext(t, {
      subject: "stripe_schedule_free_recovery",
      operationKind: "scheduleFree",
      cancelAtPeriodEndSnapshot: false,
      periodEndsAt,
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          cancelAtPeriodEndSubscription(ids, {
            cancelAtPeriodEnd: true,
            periodEndsAt,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "schedule-free-provider-succeeded",
      operationKind: "scheduleFree",
    });

    const result = await cancelAtPeriodEndRecoveryState(t, ids.organizationId, ids.operationId);
    expect(result.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt: periodEndsAt,
    });
    expect(result.subscription).toMatchObject({ cancelAtPeriodEnd: true, currentPeriodEndsAt: periodEndsAt });
    expect(result.operation).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionId,
      stripeIdempotencyKey: ids.stripeIdempotencyKey,
    });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it("期間末Free取消はprovider成功後のlocal停止を同じoperationで回収する", async () => {
    const t = convexTest(schema, modules);
    const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
    const ids = await seedCancelAtPeriodEndRecoveryContext(t, {
      subject: "stripe_cancel_free_schedule_recovery",
      operationKind: "cancelFreeSchedule",
      cancelAtPeriodEndSnapshot: true,
      periodEndsAt,
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          cancelAtPeriodEndSubscription(ids, {
            cancelAtPeriodEnd: false,
            periodEndsAt,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "cancel-free-schedule-provider-succeeded",
      operationKind: "cancelFreeSchedule",
    });

    const result = await cancelAtPeriodEndRecoveryState(t, ids.organizationId, ids.operationId);
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.subscription).toMatchObject({ cancelAtPeriodEnd: false, currentPeriodEndsAt: periodEndsAt });
    expect(result.operation).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionId,
      stripeIdempotencyKey: ids.stripeIdempotencyKey,
    });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it("期間末Free予約の再試行でも同じStripe idempotency keyを使う", async () => {
    const t = convexTest(schema, modules);
    const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
    const ids = await seedCancelAtPeriodEndRecoveryContext(t, {
      subject: "stripe_schedule_free_idempotent_retry",
      operationKind: "scheduleFree",
      cancelAtPeriodEndSnapshot: false,
      periodEndsAt,
    });
    const updateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          cancelAtPeriodEndSubscription(ids, {
            cancelAtPeriodEnd: false,
            periodEndsAt,
          }),
        );
      }
      if (resource === "subscriptions.update") {
        updateCalls.push(JSON.parse(String(init?.body ?? "[]")) as unknown[]);
        return providerResponse(
          cancelAtPeriodEndSubscription(ids, {
            cancelAtPeriodEnd: true,
            periodEndsAt,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "schedule-free-provider-succeeded",
      operationKind: "scheduleFree",
    });

    expect(updateCalls).toEqual([
      [ids.stripeSubscriptionId, { cancel_at_period_end: true }, { idempotencyKey: ids.stripeIdempotencyKey }],
    ]);
    const result = await cancelAtPeriodEndRecoveryState(t, ids.organizationId, ids.operationId);
    expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
  });

  it("期間末FreeはStripeがactiveで取消解除済みならProへ戻し、Free化しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_free_cancelled");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids.organizationId, "active", false));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-free-cancelled-request",
    });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operation: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
          q
            .eq("organizationId", ids.organizationId)
            .eq("kind", "reconcileSubscription")
            .eq("requestKey", "scheduled-free-cancelled-request"),
        )
        .unique(),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.operation).toMatchObject({ status: "succeeded", recoveryPurpose: "scheduledFreeDeadline" });
  });

  it("期間末FreeはStripeのterminal Subscription確認後にだけ確定する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_free_confirmed");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids.organizationId, "canceled", true));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-free-confirmed-request",
    });

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
    expect(result.billing?.state).toEqual({ kind: "active", plan: "free" });
    expect(result.subscription).toMatchObject({ status: "canceled", terminalAt: NOW });
  });

  it("paymentGraceExpiredではSubscriptionをcancelし、対象open/draft Invoiceの自動回収を停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredGraceStripeContext(t, "stripe_grace_success");
    const providerCalls: Array<{ resource: string; args: unknown[] }> = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      providerCalls.push({ resource, args });
      if (resource === "subscriptions.retrieve") return providerResponse(stripeSubscription("past_due"));
      if (resource === "subscriptions.cancel") return providerResponse(stripeSubscription("canceled"));
      if (resource === "invoices.retrieve") return providerResponse(stripeInvoice("in_open"));
      if (resource === "invoices.list") {
        const status = (args[0] as { status?: string }).status;
        return providerResponse({
          data: status === "open" ? [stripeInvoice("in_open")] : [stripeInvoice("in_draft")],
          has_more: false,
        });
      }
      if (resource === "invoices.update") {
        return providerResponse({ ...stripeInvoice(String(args[0])), auto_advance: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, {
        organizationId: ids.organizationId,
        expectedBillingVersion: 2,
        requestId: "grace-expired-001",
      }),
    ).resolves.toBeNull();

    const state = await safetyState(t);
    expect(state.operations).toHaveLength(3);
    expect(
      state.operations.map((operation) => ({
        kind: operation.kind,
        status: operation.status,
        stripeObjectId: operation.stripeObjectId,
      })),
    ).toEqual([
      { kind: "reconcileSubscription", status: "succeeded", stripeObjectId: "sub_grace" },
      { kind: "cancelSubscription", status: "succeeded", stripeObjectId: "sub_grace" },
      { kind: "stopInvoiceCollection", status: "succeeded", stripeObjectId: "in_open" },
    ]);
    expect(state.subscription).toMatchObject({
      status: "canceled",
      terminalAt: NOW,
      latestInvoiceId: "in_open",
    });
    expect(state.scheduled).toEqual([]);

    const updateCalls = providerCalls
      .filter((call) => call.resource === "invoices.update")
      .map((call) => call.args)
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
    const invoiceOperation = state.operations.find((operation) => operation.kind === "stopInvoiceCollection");
    expect(updateCalls).toEqual([
      ["in_draft", { auto_advance: false }, { idempotencyKey: `${invoiceOperation?.stripeIdempotencyKey}:in_draft` }],
      ["in_open", { auto_advance: false }, { idempotencyKey: `${invoiceOperation?.stripeIdempotencyKey}:in_open` }],
    ]);
  });

  it("Stripe secretが猶予期限時に欠けてもoperationを再試行し、復旧後に回収停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredGraceStripeContext(t, "stripe_grace_config_retry");
    const args = {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "grace-config-retry",
    };
    vi.stubEnv("STRIPE_SECRET_KEY", "");

    await t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, args);

    let state = await safetyState(t);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "reconcileSubscription",
      status: "retrying",
      nextRunAt: NOW + 30_000,
      lastErrorCode: "stripe_configuration_unavailable",
    });
    expect(providerFetchMock).not.toHaveBeenCalled();

    vi.stubEnv("STRIPE_SECRET_KEY", READY_TEST_CONFIGURATION.secretKey);
    vi.setSystemTime(NOW + 30_000);
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const providerArgs = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "subscriptions.retrieve") return providerResponse(stripeSubscription("past_due"));
      if (resource === "subscriptions.cancel") return providerResponse(stripeSubscription("canceled"));
      if (resource === "invoices.retrieve") return providerResponse(stripeInvoice("in_open"));
      if (resource === "invoices.list") {
        const status = (providerArgs[0] as { status?: string }).status;
        return providerResponse({
          data: status === "open" ? [stripeInvoice("in_open")] : [stripeInvoice("in_draft")],
          has_more: false,
        });
      }
      if (resource === "invoices.update") {
        return providerResponse({ ...stripeInvoice(String(providerArgs[0])), auto_advance: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, args);

    state = await safetyState(t);
    expect(state.operations.map((operation) => [operation.kind, operation.status])).toEqual([
      ["reconcileSubscription", "succeeded"],
      ["cancelSubscription", "succeeded"],
      ["stopInvoiceCollection", "succeeded"],
    ]);
    expect(state.subscription).toMatchObject({ status: "canceled", terminalAt: NOW + 30_000 });
  });

  it("猶予停止の一時障害は同じoperationを再予約し、8回目の失敗でactionRequiredに隔離する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredGraceStripeContext(t, "stripe_grace_retry");
    providerFetchMock.mockRejectedValue(new MockStripeError(500));
    const args = {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "grace-expired-002",
    };

    await expect(t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, args)).resolves.toBeNull();

    let state = await safetyState(t);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "reconcileSubscription",
      status: "retrying",
      attemptCount: 1,
      nextRunAt: NOW + 30_000,
      lastErrorCode: "stripe_temporary_error",
    });
    expect(state.scheduled).toEqual([
      {
        name: "organizationStripe/actions:stopExpiredGraceCollection",
        args: [args],
      },
    ]);

    await t.run(async (ctx) => {
      await ctx.db.patch(state.operations[0]._id, {
        status: "retrying",
        attemptCount: 7,
        nextRunAt: NOW,
      });
    });
    await expect(t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, args)).resolves.toBeNull();

    state = await safetyState(t);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "reconcileSubscription",
      status: "actionRequired",
      attemptCount: 8,
      completedAt: NOW,
      lastErrorCode: "attempt_limit_exceeded",
    });
    expect(state.operations[0]).not.toHaveProperty("leaseToken");
    expect(state.operations[0]).not.toHaveProperty("leaseExpiresAt");
    expect(state.scheduled).toHaveLength(1);
  });

  it("請求先メール同期はCustomer未作成ならproviderを呼ばない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_email_no_customer", plan: "pro" });
      await ctx.db.patch(seeded.organizationId, {
        billingEmail: "billing-no-customer@example.com",
        billingEmailNormalized: "billing-no-customer@example.com",
      });
      return seeded;
    });
    await t.action(internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: ids.organizationId,
      requestId: "billing-email-no-customer",
    });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("古い請求先メール同期が遅れてもlocal最新値へ再収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_email_fence", plan: "pro" });
      await ctx.db.patch(seeded.organizationId, {
        billingEmail: "old-billing@example.com",
        billingEmailNormalized: "old-billing@example.com",
        billingEmailSyncKey: "billing-email-old-revision",
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_email_fence",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    const updateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "customers.retrieve") {
        return providerResponse({
          id: "cus_email_fence",
          email: "before@example.com",
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      if (resource === "customers.update") {
        updateCalls.push(args);
        const email = (args[1] as { email: string }).email;
        if (updateCalls.length === 1) {
          await t.run((ctx) =>
            ctx.db.patch(ids.organizationId, {
              billingEmail: "latest-billing@example.com",
              billingEmailNormalized: "latest-billing@example.com",
              billingEmailSyncKey: "billing-email-latest-revision",
              updatedAt: NOW + 1,
            }),
          );
        }
        return providerResponse({
          id: "cus_email_fence",
          email,
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    await t.action(internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: ids.organizationId,
      requestId: "billing-email-fence-old-job",
    });
    expect(updateCalls.map((args) => (args[1] as { email: string }).email)).toEqual([
      "old-billing@example.com",
      "latest-billing@example.com",
    ]);
    expect((updateCalls[0][2] as { idempotencyKey: string }).idempotencyKey).not.toBe(
      (updateCalls[1][2] as { idempotencyKey: string }).idempotencyKey,
    );
  });

  it("新しい同期が先に成功しても、遅い旧同期の完了後にlocal最新値へ補正する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_email_parallel", plan: "pro" });
      await ctx.db.patch(seeded.organizationId, {
        billingEmail: "parallel-old@example.com",
        billingEmailNormalized: "parallel-old@example.com",
        billingEmailSyncKey: "billing-email-parallel-old",
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_email_parallel",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    let releaseOldUpdate!: () => void;
    let markOldUpdateStarted!: () => void;
    const oldUpdateStarted = new Promise<void>((resolve) => {
      markOldUpdateStarted = resolve;
    });
    const oldUpdateGate = new Promise<void>((resolve) => {
      releaseOldUpdate = resolve;
    });
    const completedEmails: string[] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "customers.retrieve") {
        return providerResponse({
          id: "cus_email_parallel",
          email: "before@example.com",
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      if (resource === "customers.update") {
        const email = (args[1] as { email: string }).email;
        if (email === "parallel-old@example.com") {
          markOldUpdateStarted();
          await oldUpdateGate;
        }
        completedEmails.push(email);
        return providerResponse({
          id: "cus_email_parallel",
          email,
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    const oldAction = t.action(internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: ids.organizationId,
      requestId: "billing-email-parallel-old-job",
    });
    await oldUpdateStarted;
    await t.run((ctx) =>
      ctx.db.patch(ids.organizationId, {
        billingEmail: "parallel-latest@example.com",
        billingEmailNormalized: "parallel-latest@example.com",
        billingEmailSyncKey: "billing-email-parallel-latest",
        updatedAt: NOW + 1,
      }),
    );
    await t.action(internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: ids.organizationId,
      requestId: "billing-email-parallel-new-job",
    });
    releaseOldUpdate();
    await oldAction;

    expect(completedEmails).toEqual([
      "parallel-latest@example.com",
      "parallel-old@example.com",
      "parallel-latest@example.com",
    ]);
  });

  it("請求先メール同期の一時障害は同じoperationとidempotency keyで再試行する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_email_retry", plan: "pro" });
      await ctx.db.patch(seeded.organizationId, {
        billingEmail: "retry-billing@example.com",
        billingEmailNormalized: "retry-billing@example.com",
        billingEmailSyncKey: "billing-email-retry-revision",
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_email_retry",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    let shouldFail = true;
    const idempotencyKeys: string[] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "customers.retrieve") {
        return providerResponse({
          id: "cus_email_retry",
          email: "before@example.com",
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      if (resource === "customers.update") {
        idempotencyKeys.push((args[2] as { idempotencyKey: string }).idempotencyKey);
        if (shouldFail) throw new MockStripeError(500);
        return providerResponse({
          id: "cus_email_retry",
          email: (args[1] as { email: string }).email,
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.syncBillingEmail, {
      organizationId: ids.organizationId,
      requestId: "billing-email-retry-job",
    });
    let state = await t.run(async (ctx) => ({
      operation: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.operation).toMatchObject({
      kind: "syncBillingEmail",
      status: "retrying",
      attemptCount: 1,
      nextRunAt: NOW + 30_000,
    });
    const retryArgs = state.scheduled.find((job) => job.name.endsWith("syncBillingEmail"))?.args[0] as
      | { organizationId: Id<"organizations">; requestId: string }
      | undefined;
    expect(retryArgs?.requestId).toBe(state.operation?.requestKey);

    shouldFail = false;
    vi.setSystemTime(NOW + 30_000);
    if (!retryArgs) throw new Error("billing email retry was not scheduled");
    await t.action(internal.organizationStripe.actions.syncBillingEmail, retryArgs);
    state = await t.run(async (ctx) => ({
      operation: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.operation).toMatchObject({ kind: "syncBillingEmail", status: "succeeded", attemptCount: 2 });
    expect(idempotencyKeys).toHaveLength(2);
    expect(new Set(idempotencyKeys).size).toBe(1);
  });

  it("Portal設定が危険ならSessionを作成せず、安全設定ではstable idempotency keyを使う", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_portal_safety", plan: "pro" });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_portal_safety",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return seeded;
    });
    let safeConfiguration = false;
    const portalCreateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "customers.retrieve") {
        return providerResponse({
          id: "cus_portal_safety",
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      if (resource === "billingPortal.configurations.retrieve") {
        return providerResponse({
          id: "bpc_test",
          active: true,
          features: {
            payment_method_update: { enabled: true },
            invoice_history: { enabled: true },
            subscription_cancel: { enabled: !safeConfiguration },
            subscription_update: { enabled: false },
            customer_update: { enabled: !safeConfiguration },
          },
        });
      }
      if (resource === "billingPortal.sessions.create") {
        portalCreateCalls.push(args);
        return providerResponse({ id: "bps_safe", url: "https://billing.stripe.test/session" });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "stripe_portal_safety" });
    await expect(
      actor.action(api.organizationStripe.actions.openCustomerPortal, {
        shopId: ids.shopId,
        requestId: "portal-unsafe-configuration",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "configuration_pending" });
    expect(portalCreateCalls).toHaveLength(0);

    safeConfiguration = true;
    await expect(
      actor.action(api.organizationStripe.actions.openCustomerPortal, {
        shopId: ids.shopId,
        requestId: "portal-safe-configuration",
      }),
    ).resolves.toEqual({ status: "redirect", url: "https://billing.stripe.test/session" });
    expect(portalCreateCalls).toHaveLength(1);
    const portalOperation = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationStripeOperations")
          .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
            q
              .eq("organizationId", ids.organizationId)
              .eq("kind", "portalSession")
              .eq("requestKey", "portal-safe-configuration"),
          )
          .unique(),
    );
    expect((portalCreateCalls[0][1] as { idempotencyKey: string }).idempotencyKey).toBe(
      portalOperation?.stripeIdempotencyKey,
    );
  });

  it("paused世代はprovider取消確認まで再契約を止め、終端化後だけ次世代Checkoutを許可する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, { subject: "stripe_paused_restart", plan: "pro" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing state was not seeded");
      await ctx.db.patch(billing._id, {
        state: {
          kind: "restricted",
          reason: "unexpectedCancellation",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: NOW,
        },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_paused_restart",
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const subscriptionId = await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId: "cus_paused_restart",
        stripeSubscriptionId: "sub_paused_restart",
        stripeSubscriptionItemId: "si_paused_restart",
        stripePriceId: "price_pro_test",
        livemode: false,
        status: "paused",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...seeded, subscriptionId };
    });
    const actor = t.withIdentity({ subject: "stripe_paused_restart" });

    await expect(
      actor.action(api.organizationStripe.actions.startProCheckout, {
        shopId: ids.shopId,
        requestId: "paused-before-provider-cancel",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    expect(providerFetchMock).not.toHaveBeenCalled();

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.subscriptionId, { status: "canceled", terminalAt: NOW, updatedAt: NOW });
    });
    const checkoutCreateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") {
        return providerResponse({
          id: "price_pro_test",
          active: true,
          livemode: false,
          currency: "jpy",
          unit_amount: 1000,
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "customers.retrieve") {
        return providerResponse({
          id: "cus_paused_restart",
          livemode: false,
          metadata: { shiftori_organization_id: String(ids.organizationId) },
        });
      }
      if (resource === "checkout.sessions.create") {
        checkoutCreateCalls.push(args);
        return providerResponse({
          id: "cs_paused_restart_generation_2",
          url: "https://checkout.stripe.test/paused-restart",
          livemode: false,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      actor.action(api.organizationStripe.actions.startProCheckout, {
        shopId: ids.shopId,
        requestId: "paused-after-provider-cancel",
      }),
    ).resolves.toEqual({ status: "redirect", url: "https://checkout.stripe.test/paused-restart" });

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operation: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_requestKey", (q) =>
          q
            .eq("organizationId", ids.organizationId)
            .eq("kind", "immediateProCheckout")
            .eq("requestKey", "paused-after-provider-cancel"),
        )
        .unique(),
      subscriptions: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(result.billing?.state).toMatchObject({ kind: "pendingActivation", plan: "pro", fallback: "restricted" });
    expect(result.operation).toMatchObject({
      kind: "immediateProCheckout",
      providerGeneration: 2,
      status: "succeeded",
      stripeObjectId: "cs_paused_restart_generation_2",
    });
    expect(result.subscriptions).toHaveLength(1);
    expect(result.subscriptions[0]).toMatchObject({
      stripeSubscriptionId: "sub_paused_restart",
      providerGeneration: 1,
      status: "canceled",
      terminalAt: NOW,
    });
    expect(checkoutCreateCalls).toHaveLength(1);
    expect(checkoutCreateCalls[0][0]).toMatchObject({
      mode: "subscription",
      customer: "cus_paused_restart",
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_provider_generation: "2",
        shiftori_price_id: "price_pro_test",
      },
      subscription_data: {
        metadata: {
          shiftori_organization_id: String(ids.organizationId),
          shiftori_provider_generation: "2",
          shiftori_price_id: "price_pro_test",
        },
      },
    });
    expect((checkoutCreateCalls[0][1] as { idempotencyKey: string }).idempotencyKey).toBe(
      result.operation?.stripeIdempotencyKey,
    );
  });

  it("grace取消後はcancelとinvoice停止の両方が成功するまで再契約を許可しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredGraceStripeContext(t, "stripe_finalization_gate");
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      const subscription = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique();
      if (!billing || !subscription) throw new Error("billing fixture missing");
      await ctx.db.patch(billing._id, {
        state: {
          kind: "restricted",
          reason: "paymentGraceExpired",
          previousPlan: "pro",
          recoveryManagerPersonIds: [ids.personId],
          previousActiveShopIds: [ids.shopId],
          restrictedAt: NOW,
        },
        version: 3,
      });
      await ctx.db.patch(subscription._id, { status: "canceled", terminalAt: NOW });
    });
    const context = () =>
      t.query(internal.organizationStripe.queries.getActionContext, {
        tokenIdentifier: testAuthTokenIdentifier("stripe_finalization_gate"),
        shopId: ids.shopId,
        purpose: "startCheckout",
      });
    await expect(context()).resolves.toBeNull();
    const insertFinalizationProof = async (kind: "cancelSubscription" | "stopInvoiceCollection") =>
      await t.run(async (ctx) => {
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: ids.organizationId,
          kind,
          requestKey: `finalization-${kind}`,
          stripeIdempotencyKey: `finalization:${kind}`,
          livemode: false,
          expectedBillingVersion: 3,
          providerGeneration: 1,
          stripeObjectId: kind === "cancelSubscription" ? "sub_grace" : "in_open",
          status: "succeeded",
          attemptCount: 1,
          completedAt: NOW,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW,
          updatedAt: NOW,
        });
      });
    await insertFinalizationProof("cancelSubscription");
    await expect(context()).resolves.toBeNull();
    await insertFinalizationProof("stopInvoiceCollection");
    await expect(context()).resolves.not.toBeNull();
    expect(providerFetchMock).not.toHaveBeenCalled();
  });
});

type ActionRunner = Pick<TestConvex<typeof schema>, "action">;

async function invokeBillingActions(runner: ActionRunner, shopId: Id<"shops">) {
  return await Promise.all([
    runner.action(api.organizationStripe.actions.getProPrice, { shopId }),
    runner.action(api.organizationStripe.actions.startProCheckout, {
      shopId,
      requestId: "checkout_boundary_request",
    }),
    runner.action(api.organizationStripe.actions.openCustomerPortal, {
      shopId,
      requestId: "portal_boundary_request",
    }),
  ]);
}

async function settleBillingActions(runner: ActionRunner, shopId: Id<"shops">) {
  return await Promise.allSettled([
    runner.action(api.organizationStripe.actions.getProPrice, { shopId }),
    runner.action(api.organizationStripe.actions.startProCheckout, {
      shopId,
      requestId: "checkout_boundary_request",
    }),
    runner.action(api.organizationStripe.actions.openCustomerPortal, {
      shopId,
      requestId: "portal_boundary_request",
    }),
  ]);
}

async function stripeState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    customers: await ctx.db.query("organizationStripeCustomers").collect(),
    subscriptions: await ctx.db.query("organizationStripeSubscriptions").collect(),
    operations: await ctx.db.query("organizationStripeOperations").collect(),
    events: await ctx.db.query("stripeWebhookEvents").collect(),
  }));
}

async function expectNoStripeSideEffects(t: TestConvex<typeof schema>) {
  const state = await stripeState(t);
  expect(state.customers).toEqual([]);
  expect(state.subscriptions).toEqual([]);
  expect(state.operations).toEqual([]);
  expect(state.events).toEqual([]);
  expect(providerFetchMock).not.toHaveBeenCalled();
}

async function seedTrialCheckoutCompletion(t: TestConvex<typeof schema>, suffix: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject: `stripe_setup_validation_${suffix}` });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing state missing");
    const trialEndsAt = NOW + 14 * 24 * 60 * 60_000;
    await ctx.db.patch(billing._id, {
      state: { kind: "trial", trialEndsAt },
      updatedAt: NOW,
    });
    const stripeCustomerId = `cus_setup_validation_${suffix}`;
    const stripeSessionId = `cs_setup_validation_${suffix}`;
    const stripeEventId = `evt_setup_validation_${suffix}`;
    const stripeSetupIntentId = `seti_setup_validation_${suffix}`;
    const stripePaymentMethodId = `pm_setup_validation_${suffix}`;
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const checkoutOperationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: seeded.organizationId,
      kind: "trialSetupCheckout",
      requestKey: `setup-validation-${suffix}`,
      stripeIdempotencyKey: `test:setup-validation:${suffix}`,
      livemode: false,
      expectedBillingVersion: billing.version,
      providerGeneration: 1,
      stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      stripeObjectId: stripeSessionId,
      status: "succeeded",
      attemptCount: 1,
      completedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId,
      type: "checkout.session.completed",
      apiVersion: STRIPE_WEBHOOK_API_VERSION,
      livemode: false,
      objectId: stripeSessionId,
      eventCreatedAt: NOW,
      status: "received",
      attemptCount: 0,
      receivedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      checkoutOperationId,
      stripeCustomerId,
      stripeSessionId,
      stripeEventId,
      stripeSetupIntentId,
      stripePaymentMethodId,
      trialEndsAt,
    };
  });
}

async function seedExpiredGraceStripeContext(t: TestConvex<typeof schema>, subject: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("Billing state was not seeded");
    await ctx.db.patch(billing._id, {
      state: { kind: "grace", plan: "pro", startedAt: NOW - 1000, endsAt: NOW },
      version: 2,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId: "cus_grace",
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId: seeded.organizationId,
      stripeCustomerId: "cus_grace",
      stripeSubscriptionId: "sub_grace",
      stripeSubscriptionItemId: "si_grace",
      stripePriceId: "price_pro_test",
      livemode: false,
      status: "past_due",
      providerGeneration: 1,
      cancelAtPeriodEnd: false,
      latestInvoiceId: "in_open",
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return seeded;
  });
}

async function seedScheduledFreeStripeContext(t: TestConvex<typeof schema>, subject: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "pro" });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing state was not seeded");
    await ctx.db.patch(billing._id, {
      state: { kind: "scheduledChange", currentPlan: "pro", targetPlan: "free", effectiveAt: NOW },
      version: 2,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId: "cus_scheduled_free",
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId: seeded.organizationId,
      stripeCustomerId: "cus_scheduled_free",
      stripeSubscriptionId: "sub_scheduled_free",
      stripeSubscriptionItemId: "si_scheduled_free",
      stripePriceId: "price_pro_test",
      livemode: false,
      status: "active",
      providerGeneration: 1,
      currentPeriodEndsAt: NOW,
      cancelAtPeriodEnd: true,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return seeded;
  });
}

async function seedCancelAtPeriodEndRecoveryContext(
  t: TestConvex<typeof schema>,
  args: {
    subject: string;
    operationKind: "scheduleFree" | "cancelFreeSchedule";
    cancelAtPeriodEndSnapshot: boolean;
    periodEndsAt: number;
  },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject: args.subject, plan: "pro" });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing state was not seeded");
    await ctx.db.patch(billing._id, {
      state:
        args.operationKind === "scheduleFree"
          ? { kind: "active", plan: "pro" }
          : {
              kind: "scheduledChange",
              currentPlan: "pro",
              targetPlan: "free",
              effectiveAt: args.periodEndsAt,
            },
      version: 2,
      updatedAt: NOW,
    });
    const suffix = args.operationKind === "scheduleFree" ? "schedule_recovery" : "cancel_schedule_recovery";
    const stripeCustomerId = `cus_${suffix}`;
    const stripeSubscriptionId = `sub_${suffix}`;
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId: seeded.organizationId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionItemId: `si_${suffix}`,
      stripePriceId: "price_pro_test",
      livemode: false,
      status: "active",
      providerGeneration: 1,
      currentPeriodEndsAt: args.periodEndsAt,
      cancelAtPeriodEnd: args.cancelAtPeriodEndSnapshot,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const requestKey =
      args.operationKind === "scheduleFree"
        ? "schedule-free-provider-succeeded"
        : "cancel-free-schedule-provider-succeeded";
    const stripeIdempotencyKey = `shiftori:test:${args.operationKind}:${seeded.organizationId}:${requestKey}`;
    const operationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: seeded.organizationId,
      kind: args.operationKind,
      requestKey,
      stripeIdempotencyKey,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      status: "retrying",
      attemptCount: 1,
      nextRunAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      operationId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeIdempotencyKey,
      stripeSubscriptionItemId: `si_${suffix}`,
    };
  });
}

function cancelAtPeriodEndSubscription(
  ids: {
    organizationId: Id<"organizations">;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string;
  },
  args: { cancelAtPeriodEnd: boolean; periodEndsAt: number },
) {
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status: "active",
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: "price_pro_test",
    },
    trial_end: null,
    cancel_at_period_end: args.cancelAtPeriodEnd,
    latest_invoice: null,
    items: {
      data: [
        {
          id: ids.stripeSubscriptionItemId,
          current_period_end: Math.floor(args.periodEndsAt / 1000),
          price: {
            id: "price_pro_test",
            active: true,
            livemode: false,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}

async function cancelAtPeriodEndRecoveryState(
  t: TestConvex<typeof schema>,
  organizationId: Id<"organizations">,
  operationId: Id<"organizationStripeOperations">,
) {
  return await t.run(async (ctx) => ({
    billing: await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    subscription: await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) =>
        q.eq("organizationId", organizationId).eq("providerGeneration", 1),
      )
      .unique(),
    operation: await ctx.db.get(operationId),
  }));
}

function scheduledFreeSubscription(
  organizationId: Id<"organizations">,
  status: "active" | "canceled",
  cancelAtPeriodEnd: boolean,
) {
  return {
    id: "sub_scheduled_free",
    customer: "cus_scheduled_free",
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: "price_pro_test",
    },
    trial_end: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    latest_invoice: null,
    items: {
      data: [
        {
          id: "si_scheduled_free",
          current_period_end: Math.floor(NOW / 1000),
          price: {
            id: "price_pro_test",
            active: true,
            livemode: false,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}

async function safetyState(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    operations: await ctx.db.query("organizationStripeOperations").withIndex("by_organizationId_and_status").collect(),
    subscription: await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_livemode_and_stripeSubscriptionId", (q) =>
        q.eq("livemode", false).eq("stripeSubscriptionId", "sub_grace"),
      )
      .unique(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((job) => job.name.startsWith("organizationStripe/"))
      .map((job) => ({ name: job.name, args: job.args })),
  }));
}

function stripeSubscription(status: "past_due" | "canceled") {
  return {
    id: "sub_grace",
    customer: "cus_grace",
    livemode: false,
    status,
    cancel_at_period_end: false,
    trial_end: null,
    latest_invoice: "in_open",
    items: {
      data: [
        {
          id: "si_grace",
          price: { id: "price_pro_test" },
          current_period_end: Math.floor((NOW + 30 * 24 * 60 * 60_000) / 1_000),
        },
      ],
    },
  };
}

function stripeInvoice(id: string) {
  return {
    id,
    customer: "cus_grace",
    livemode: false,
    auto_advance: true,
    status: "open",
    amount_remaining: 1000,
    parent: { subscription_details: { subscription: "sub_grace" } },
  };
}

async function seedInactivePriceTrialRecovery(
  t: TestConvex<typeof schema>,
  args: { suffix: string; trialEndsAt: number; source: "unbound" | "mapped" },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject: `stripe_${args.suffix}` });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing missing");
    await ctx.db.patch(billing._id, {
      state: { kind: "trial", trialEndsAt: args.trialEndsAt },
      version: 2,
      updatedAt: NOW,
    });
    const stripeCustomerId = `cus_${args.suffix}`;
    const stripePaymentMethodId = `pm_${args.suffix}`;
    const stripeSessionId = `cs_${args.suffix}`;
    const stripeEventId = `evt_${args.suffix}`;
    const stripeSubscriptionId = `sub_${args.suffix}`;
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId,
      livemode: false,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const checkoutOperationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: seeded.organizationId,
      kind: "trialSetupCheckout",
      requestKey: `${args.suffix}_checkout`,
      stripeIdempotencyKey: `test:${args.suffix}:checkout`,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      stripeObjectId: stripeSessionId,
      status: "succeeded",
      attemptCount: 1,
      completedAt: NOW - 60_000,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW - 60_000,
      updatedAt: NOW - 60_000,
    });
    const sourceOperationId = await ctx.db.insert("organizationStripeOperations", {
      organizationId: seeded.organizationId,
      kind: "createTrialSubscription",
      requestKey: stripeEventId,
      stripeIdempotencyKey: `test:${args.suffix}:create`,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: 1,
      stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      trialSubscriptionCreateSnapshot: {
        stripeCustomerId,
        stripePaymentMethodId,
        trialEndsAt: args.trialEndsAt,
      },
      ...(args.source === "mapped" ? { stripeObjectId: stripeSubscriptionId } : {}),
      status: "processing",
      attemptCount: 1,
      leaseToken: `${args.suffix}-abandoned-lease`,
      leaseExpiresAt: NOW - 1,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW - 30_000,
      updatedAt: NOW - 30_000,
    });
    if (args.source === "mapped") {
      await ctx.db.insert("organizationStripeSubscriptions", {
        organizationId: seeded.organizationId,
        stripeCustomerId,
        stripeSubscriptionId,
        stripeSubscriptionItemId: `si_${args.suffix}`,
        stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
        livemode: false,
        status: "trialing",
        providerGeneration: 1,
        trialEndsAt: args.trialEndsAt,
        currentPeriodEndsAt: args.trialEndsAt,
        cancelAtPeriodEnd: false,
        syncedAt: NOW - 30_000,
        createdAt: NOW - 30_000,
        updatedAt: NOW - 30_000,
      });
    }
    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId,
      type: "checkout.session.completed",
      apiVersion: STRIPE_WEBHOOK_API_VERSION,
      livemode: false,
      objectId: stripeSessionId,
      eventCreatedAt: NOW,
      status: "received",
      attemptCount: 0,
      receivedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      checkoutOperationId,
      sourceOperationId,
      stripeCustomerId,
      stripePaymentMethodId,
      stripeSessionId,
      stripeEventId,
      stripeSubscriptionId,
      stripeSubscriptionItemId: `si_${args.suffix}`,
      trialEndsAt: args.trialEndsAt,
    };
  });
}

function inactivePriceTrialSubscription(
  ids: Awaited<ReturnType<typeof seedInactivePriceTrialRecovery>>,
  status: "trialing" | "canceled" = "trialing",
) {
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_operation_id: String(ids.sourceOperationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
    },
    trial_end: Math.floor(ids.trialEndsAt / 1000),
    cancel_at_period_end: false,
    latest_invoice: null,
    items: {
      data: [
        {
          id: ids.stripeSubscriptionItemId,
          current_period_end: Math.floor(ids.trialEndsAt / 1000),
          price: {
            id: READY_TEST_CONFIGURATION.proPriceId,
            active: false,
            livemode: false,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
}

function mockInactivePriceMappedWebhook(
  ids: Awaited<ReturnType<typeof seedInactivePriceTrialRecovery>>,
  subscription: Record<string, unknown> & { id: string },
) {
  const providerResources: string[] = [];
  providerFetchMock.mockImplementation(async (input) => {
    const resource = String(input).split("/").pop() ?? "";
    providerResources.push(resource);
    if (resource === "events.retrieve") {
      return providerResponse({
        id: ids.stripeEventId,
        type: "checkout.session.completed",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(NOW / 1000),
        data: { object: { id: ids.stripeSessionId } },
      });
    }
    if (resource === "checkout.sessions.retrieve") {
      return providerResponse({
        id: ids.stripeSessionId,
        customer: ids.stripeCustomerId,
        livemode: false,
        mode: "setup",
        status: "complete",
        setup_intent: `seti_${ids.stripeEventId}`,
        client_reference_id: String(ids.organizationId),
        metadata: {
          shiftori_organization_id: String(ids.organizationId),
          shiftori_operation_id: String(ids.checkoutOperationId),
          shiftori_provider_generation: "1",
          shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
        },
      });
    }
    if (resource === "prices.retrieve") {
      return providerResponse({
        id: READY_TEST_CONFIGURATION.proPriceId,
        active: false,
        livemode: false,
        currency: "jpy",
        unit_amount: 1480,
        recurring: { interval: "month", interval_count: 1 },
      });
    }
    if (resource === "subscriptions.retrieve") return providerResponse(subscription);
    if (resource === "subscriptions.cancel") {
      return providerResponse({
        ...subscription,
        status: "canceled",
        canceled_at: Math.floor(Date.now() / 1000),
        ended_at: Math.floor(Date.now() / 1000),
      });
    }
    throw new Error(`Unexpected Stripe provider call: ${resource}`);
  });
  return providerResources;
}

function providerResponse(value: unknown) {
  return value as Response;
}
