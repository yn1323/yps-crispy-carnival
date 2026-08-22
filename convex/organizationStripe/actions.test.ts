import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
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
    prices = { retrieve: async (...args: unknown[]) => await providerRequest("prices.retrieve", args) };
    checkout = {
      sessions: {
        retrieve: async () => await providerRequest("checkout.sessions.retrieve"),
        create: async (...args: unknown[]) => await providerRequest("checkout.sessions.create", args),
        expire: async (...args: unknown[]) => await providerRequest("checkout.sessions.expire", args),
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
      createPreview: async (...args: unknown[]) => await providerRequest("invoices.createPreview", args),
    };
    subscriptionSchedules = {
      retrieve: async (...args: unknown[]) => await providerRequest("subscriptionSchedules.retrieve", args),
      create: async (...args: unknown[]) => await providerRequest("subscriptionSchedules.create", args),
      update: async (...args: unknown[]) => await providerRequest("subscriptionSchedules.update", args),
      release: async (...args: unknown[]) => await providerRequest("subscriptionSchedules.release", args),
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
const BUSINESS_PRICE_ID = "price_business_test";
const READY_BUSINESS_TEST_CONFIGURATION = {
  ...READY_TEST_CONFIGURATION,
  businessPriceId: BUSINESS_PRICE_ID,
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
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", BUSINESS_PRICE_ID);
    vi.stubEnv("APP_URL", "https://app.example.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("complimentary.businessでは3 Actionともprovider通信せずStripe 4表を空のまま保つ", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "stripe_complimentary",
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

  it("complimentary.businessではoperation・Customer・SubscriptionのStripe mutationを拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_complimentary_business_mutations",
        complimentary: true,
      });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing fixture missing");
      await ctx.db.patch(billing._id, { state: { kind: "complimentary", plan: "business" } });
      return seeded;
    });

    await expect(
      t.mutation(internal.organizationStripe.mutations.beginOperation, {
        organizationId: ids.organizationId,
        kind: "immediatePaidCheckout",
        requestKey: "complimentary_business_checkout",
        livemode: false,
        providerGeneration: 1,
        targetPlan: "business",
        changeMode: "checkout",
        targetStripePriceIdSnapshot: "price_business_complimentary",
      }),
    ).rejects.toThrow("支払い不要プランではStripeを利用しません");
    await expect(
      t.mutation(internal.organizationStripe.mutations.saveCustomerMapping, {
        organizationId: ids.organizationId,
        stripeCustomerId: "cus_complimentary_business",
        livemode: false,
      }),
    ).rejects.toThrow("支払い不要プランではStripeを利用しません");
    await expect(
      t.mutation(internal.organizationStripe.mutations.saveSubscriptionSnapshot, {
        organizationId: ids.organizationId,
        stripeCustomerId: "cus_complimentary_business",
        stripeSubscriptionId: "sub_complimentary_business",
        stripePriceId: "price_business_complimentary",
        plan: "business",
        livemode: false,
        status: "active",
        providerGeneration: 1,
        cancelAtPeriodEnd: false,
        syncedAt: NOW,
      }),
    ).rejects.toThrow("支払い不要プランではStripeを利用しません");
    await expectNoStripeSideEffects(t);
  });

  it("complimentary.businessではBusiness向け公開Actionもprovider通信前に拒否する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: "stripe_complimentary_business_public_actions",
        complimentary: true,
      });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing fixture missing");
      await ctx.db.patch(billing._id, { state: { kind: "complimentary", plan: "business" } });
      return seeded;
    });
    const actor = t.withIdentity({ subject: "stripe_complimentary_business_public_actions" });

    const results = await Promise.all([
      actor.action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
      actor.action(api.organizationStripe.actions.startPaidCheckout, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId: "complimentary-business-checkout",
      }),
      actor.action(api.organizationStripe.actions.previewPaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId: "complimentary-business-preview",
      }),
      actor.action(api.organizationStripe.actions.changePaidPlanNow, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId: "complimentary-business-change",
        prorationDate: Math.floor(NOW / 1000),
      }),
      actor.action(api.organizationStripe.actions.schedulePaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "pro",
        requestId: "complimentary-business-schedule",
      }),
      actor.action(api.organizationStripe.actions.cancelScheduledPlanChange, {
        shopId: ids.shopId,
        requestId: "complimentary-business-cancel-schedule",
      }),
    ]);

    expect(results).toEqual(Array.from({ length: 6 }, () => ({ status: "unavailable", reason: "not_allowed" })));
    expect(providerFetchMock).not.toHaveBeenCalled();
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

  it("Checkout照合とキャンセル復旧は別組織actorとreadOnly actorをprovider通信前に拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, { subject: "stripe_cancel_actor_other_org", plan: "free" });
      const target = await seedOrganizationManagerShop(ctx, { subject: "stripe_cancel_actor_target", plan: "free" });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
        .unique();
      if (!billing) throw new Error("billing state missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: NOW },
        version: 2,
        updatedAt: NOW,
      });
      return target;
    });

    const otherOrganizationActor = t.withIdentity({ subject: "stripe_cancel_actor_other_org" });
    await expect(
      otherOrganizationActor.action(api.organizationStripe.actions.inspectPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      otherOrganizationActor.action(api.organizationStripe.actions.cancelPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).rejects.toThrow("Not found");

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.memberId, { status: "readOnly" });
    });
    const readOnlyActor = t.withIdentity({ subject: "stripe_cancel_actor_target" });
    await expect(
      readOnlyActor.action(api.organizationStripe.actions.inspectPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    await expect(
      readOnlyActor.action(api.organizationStripe.actions.cancelPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    expect(providerFetchMock).not.toHaveBeenCalled();
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

  it("Business価格はserver-side allowlistのPriceだけをProと同じ通貨・請求周期で公開する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_business_price", plan: "free" }),
    );
    const requestedPriceIds: string[] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      requestedPriceIds.push(priceId);
      return providerResponse({
        ...priceFixtureFor(priceId),
        recurring: { interval: "day", interval_count: 2 },
      });
    });

    await expect(
      t.withIdentity({ subject: "stripe_business_price" }).action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
    ).resolves.toEqual({
      status: "available",
      currency: "jpy",
      unitAmount: 2980,
      interval: "day",
      intervalCount: 2,
      taxBehavior: "inclusive",
    });
    expect(requestedPriceIds).toEqual([BUSINESS_PRICE_ID, READY_TEST_CONFIGURATION.proPriceId]);

    requestedPriceIds.length = 0;
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      requestedPriceIds.push(priceId);
      return providerResponse({
        ...priceFixtureFor(priceId),
        tax_behavior: priceId === BUSINESS_PRICE_ID ? "unspecified" : "inclusive",
      });
    });
    await expect(
      t.withIdentity({ subject: "stripe_business_price" }).action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
    expect(requestedPriceIds).toEqual([BUSINESS_PRICE_ID]);

    requestedPriceIds.length = 0;
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      requestedPriceIds.push(priceId);
      return providerResponse({
        ...priceFixtureFor(priceId),
        currency: priceId === BUSINESS_PRICE_ID ? "usd" : "jpy",
      });
    });
    await expect(
      t.withIdentity({ subject: "stripe_business_price" }).action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
    expect(requestedPriceIds).toEqual([BUSINESS_PRICE_ID, READY_TEST_CONFIGURATION.proPriceId]);

    requestedPriceIds.length = 0;
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      requestedPriceIds.push(priceId);
      return providerResponse({
        ...priceFixtureFor(priceId),
        recurring:
          priceId === BUSINESS_PRICE_ID
            ? { interval: "day", interval_count: 1 }
            : { interval: "month", interval_count: 1 },
      });
    });
    await expect(
      t.withIdentity({ subject: "stripe_business_price" }).action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
    expect(requestedPriceIds).toEqual([BUSINESS_PRICE_ID, READY_TEST_CONFIGURATION.proPriceId]);

    configurationMock.mockReturnValue(READY_TEST_CONFIGURATION);
    providerFetchMock.mockClear();
    await expect(
      t.withIdentity({ subject: "stripe_business_price" }).action(api.organizationStripe.actions.getPlanPrice, {
        shopId: ids.shopId,
        targetPlan: "business",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("現在契約は保存済みの旧inactive PriceをID非公開で返し、明示された税区分だけを含める", async () => {
    const t = convexTest(schema, modules);
    const persistedPriceId = "price_archived_current_subscription";
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_price",
      priceId: persistedPriceId,
    });
    const requestedPriceIds: string[] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      requestedPriceIds.push(priceId);
      return providerResponse({
        ...priceFixtureFor(priceId),
        active: false,
        unit_amount: 1680,
        tax_behavior: requestedPriceIds.length === 1 ? "exclusive" : "unspecified",
        recurring: { interval: "week", interval_count: 2 },
      });
    });
    const actor = t.withIdentity({ subject: "stripe_current_subscription_price" });

    await expect(
      actor.action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({
      status: "available",
      currency: "jpy",
      unitAmount: 1680,
      interval: "week",
      intervalCount: 2,
      taxBehavior: "exclusive",
    });
    await expect(
      actor.action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({
      status: "available",
      currency: "jpy",
      unitAmount: 1680,
      interval: "week",
      intervalCount: 2,
    });
    expect(requestedPriceIds).toEqual([persistedPriceId, persistedPriceId]);
  });

  it.each([
    { caseName: "one-time", subjectSuffix: "one_time", recurring: null },
    {
      caseName: "interval_count不正",
      subjectSuffix: "invalid_interval_count",
      recurring: { interval: "day", interval_count: 0 },
    },
  ])("$caseName Priceは新規販売用として公開しない", async ({ subjectSuffix, recurring }) => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, { subject: `stripe_invalid_recurring_${subjectSuffix}`, plan: "free" }),
    );
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      return providerResponse({ ...priceFixtureFor(priceId), recurring });
    });

    await expect(
      t
        .withIdentity({ subject: `stripe_invalid_recurring_${subjectSuffix}` })
        .action(api.organizationStripe.actions.getPlanPrice, { shopId: ids.shopId, targetPlan: "pro" }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
  });

  it("別organizationのactorは対象shopの契約Priceを取得できずprovider通信しない", async () => {
    const t = convexTest(schema, modules);
    await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "stripe_current_subscription_other_org_actor",
          plan: "pro",
        }),
    );
    const target = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_other_org_target",
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_other_org_actor" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: target.shopId }),
    ).rejects.toThrow();
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("保存済みsubscriptionとsecretのlivemodeが不一致ならprovider通信しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_livemode_mismatch",
      subscriptionLivemode: true,
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_livemode_mismatch" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({ status: "unavailable", reason: "configuration_pending" });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it.each(["active.free", "trial"] as const)(
    "%sに古いsubscription snapshotが残っても現在契約Priceを返さない",
    async (stateKind) => {
      const t = convexTest(schema, modules);
      const subject = `stripe_stale_current_subscription_${stateKind.replace(".", "_")}`;
      const ids = await seedCurrentSubscriptionPriceContext(t, {
        subject,
        billingState:
          stateKind === "active.free"
            ? () => ({ kind: "active", plan: "free" })
            : () => ({ kind: "trial", trialEndsAt: NOW + 7 * 24 * 60 * 60_000 }),
      });

      await expect(
        t
          .withIdentity({ subject })
          .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
      ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
      expect(providerFetchMock).not.toHaveBeenCalled();
    },
  );

  it("canonical有料planとsubscription snapshotのplanが不一致ならprovider通信しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_plan_mismatch",
      subscriptionPlan: "business",
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_plan_mismatch" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({ status: "unavailable", reason: "price_unavailable" });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("終了済みsubscription snapshotだけなら現在契約Priceを返さずprovider通信しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_terminal_current_subscription",
      terminalAt: NOW,
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_terminal_current_subscription" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("支払い制限中は復旧managerだけが保存済み契約Priceを取得できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_recovery_manager",
      subscriptionStatus: "past_due",
      billingState: ({ personId, shopId }) => ({
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: "pro",
        recoveryManagerPersonIds: [personId],
        previousActiveShopIds: [shopId],
        restrictedAt: NOW,
      }),
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      return providerResponse({ ...priceFixtureFor(priceId), active: false });
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_recovery_manager" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toMatchObject({ status: "available", unitAmount: 1480 });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      label: "scheduledChange",
      state: () => ({
        kind: "scheduledChange" as const,
        currentPlan: "pro" as const,
        targetPlan: "free" as const,
        effectiveAt: NOW + 30 * 24 * 60 * 60_000,
      }),
    },
    {
      label: "grace",
      state: () => ({
        kind: "grace" as const,
        plan: "pro" as const,
        startedAt: NOW,
        endsAt: NOW + 14 * 24 * 60 * 60_000,
      }),
    },
  ])("$labelでも現在表示中の有料契約Priceを取得できる", async ({ label, state }) => {
    const t = convexTest(schema, modules);
    const subject = `stripe_current_subscription_${label}`;
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject,
      billingState: state,
      ...(label === "grace" ? { subscriptionStatus: "past_due" as const } : {}),
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      return providerResponse(priceFixtureFor(priceId));
    });

    await expect(
      t.withIdentity({ subject }).action(api.organizationStripe.actions.getCurrentSubscriptionPrice, {
        shopId: ids.shopId,
      }),
    ).resolves.toMatchObject({ status: "available", unitAmount: 1480 });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it("一般のreadOnly actorは有料契約Priceを取得できずprovider通信しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_read_only",
    });
    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly" }));

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_read_only" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("restricted recoveryManagerはreadOnlyになっても契約Priceを取得できる", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedCurrentSubscriptionPriceContext(t, {
      subject: "stripe_current_subscription_read_only_recovery",
      subscriptionStatus: "past_due",
      billingState: ({ personId, shopId }) => ({
        kind: "restricted",
        reason: "paymentGraceExpired",
        previousPlan: "pro",
        recoveryManagerPersonIds: [personId],
        previousActiveShopIds: [shopId],
        restrictedAt: NOW,
      }),
    });
    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly" }));
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource !== "prices.retrieve") throw new Error(`Unexpected Stripe provider call: ${resource}`);
      const [priceId] = JSON.parse(String(init?.body ?? "[]")) as [string];
      return providerResponse({ ...priceFixtureFor(priceId), active: false });
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_current_subscription_read_only_recovery" })
        .action(api.organizationStripe.actions.getCurrentSubscriptionPrice, { shopId: ids.shopId }),
    ).resolves.toMatchObject({ status: "available", unitAmount: 1480 });
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
  });

  it("Freeから日次Business Checkoutを開始しても支払確認前はpendingActivationを維持する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_free_to_business", plan: "free" }),
    );
    const checkoutCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") {
        return providerResponse(priceFixtureFor(String(args[0]), { interval: "day", interval_count: 1 }));
      }
      if (resource === "customers.create") return providerResponse({ id: "cus_free_to_business", livemode: false });
      if (resource === "checkout.sessions.create") {
        checkoutCalls.push(args);
        return providerResponse({
          id: "cs_free_to_business",
          url: "https://checkout.stripe.test/free-to-business",
          livemode: false,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject: "stripe_free_to_business" }).action(api.organizationStripe.actions.startPaidCheckout, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId: "free-to-business-checkout",
      }),
    ).resolves.toEqual({ status: "available", url: "https://checkout.stripe.test/free-to-business" });

    expect(checkoutCalls).toHaveLength(1);
    expect(checkoutCalls[0][0]).toMatchObject({
      mode: "subscription",
      customer: "cus_free_to_business",
      payment_method_types: ["card"],
      line_items: [{ price: BUSINESS_PRICE_ID, quantity: 1 }],
    });
    const state = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("kind", "immediatePaidCheckout"),
        )
        .collect(),
      customers: await ctx.db
        .query("organizationStripeCustomers")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
      subscriptions: await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", ids.organizationId))
        .collect(),
    }));
    expect(state.billing?.state).toEqual({
      kind: "pendingActivation",
      plan: "business",
      fallback: "free",
      startedAt: NOW,
    });
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "immediatePaidCheckout",
      status: "succeeded",
      targetPlan: "business",
      changeMode: "checkout",
      stripePriceIdSnapshot: BUSINESS_PRICE_ID,
      targetStripePriceIdSnapshot: BUSINESS_PRICE_ID,
      stripeObjectId: "cs_free_to_business",
    });
    expect(state.customers.map((customer) => customer.stripeCustomerId)).toEqual(["cus_free_to_business"]);
    expect(state.subscriptions).toEqual([]);
  });

  it("ProからBusinessの日割り見積もりと実更新で同じproration_date・Subscription Itemを使う", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_pro_to_business_paid",
      plan: "pro",
    });
    const previewCalls: unknown[][] = [];
    const updateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "invoices.createPreview") {
        previewCalls.push(args);
        return providerResponse({
          id: "in_preview_business",
          livemode: false,
          currency: "jpy",
          amount_due: 1500,
        });
      }
      if (resource === "subscriptions.update") {
        updateCalls.push(args);
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "business", invoiceStatus: "paid" }));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "stripe_pro_to_business_paid" });

    const preview = await actor.action(api.organizationStripe.actions.previewPaidPlanChange, {
      shopId: ids.shopId,
      targetPlan: "business",
      requestId: "preview-pro-to-business",
    });
    expect(preview).toEqual({
      status: "available",
      currency: "jpy",
      amountDue: 1500,
      currentPeriodEnd: ids.periodEndsAt,
      prorationDate: Math.floor(NOW / 1000),
    });
    if (preview.status !== "available") throw new Error("preview fixture failed");

    await expect(
      actor.action(api.organizationStripe.actions.changePaidPlanNow, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId: "preview-pro-to-business",
        prorationDate: preview.prorationDate,
      }),
    ).resolves.toEqual({ status: "accepted" });

    expect(previewCalls).toHaveLength(1);
    expect(previewCalls[0][0]).toEqual({
      customer: ids.stripeCustomerId,
      subscription: ids.stripeSubscriptionId,
      subscription_details: {
        items: [{ id: ids.stripeSubscriptionItemId, price: BUSINESS_PRICE_ID, quantity: 1 }],
        proration_behavior: "always_invoice",
        proration_date: preview.prorationDate,
        billing_cycle_anchor: "unchanged",
      },
    });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0][0]).toBe(ids.stripeSubscriptionId);
    expect(updateCalls[0][1]).toEqual({
      items: [{ id: ids.stripeSubscriptionItemId, price: BUSINESS_PRICE_ID, quantity: 1 }],
      proration_behavior: "always_invoice",
      payment_behavior: "pending_if_incomplete",
      proration_date: preview.prorationDate,
      billing_cycle_anchor: "unchanged",
      expand: ["latest_invoice"],
    });
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).toMatchObject({
      stripeSubscriptionId: ids.stripeSubscriptionId,
      stripeSubscriptionItemId: ids.stripeSubscriptionItemId,
      stripePriceId: BUSINESS_PRICE_ID,
      plan: "business",
      currentPeriodStartsAt: ids.periodStartsAt,
      currentPeriodEndsAt: ids.periodEndsAt,
      billingCycleAnchor: ids.billingCycleAnchor,
    });
  });

  it.each([
    { name: "成功済み見積もりがない", previewProrationOffset: undefined },
    { name: "見積もりとproration_dateが異なる", previewProrationOffset: -1 },
  ] as const)("ProからBusinessの実更新は$name場合にprovider更新を開始しない", async (testCase) => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: `stripe_paid_plan_preview_required_${testCase.previewProrationOffset ?? "missing"}`,
      plan: "pro",
    });
    const requestId = `preview-required-${testCase.previewProrationOffset ?? "missing"}`;
    const requestedProrationDate = Math.floor(NOW / 1000);
    if (testCase.previewProrationOffset !== undefined) {
      await seedSucceededPaidPlanPreview(t, ids, requestId, requestedProrationDate + testCase.previewProrationOffset);
    }
    const updateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "subscriptions.update") {
        updateCalls.push(args);
        throw new Error("successful matching preview is required before provider update");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: `stripe_paid_plan_preview_required_${testCase.previewProrationOffset ?? "missing"}` })
        .action(api.organizationStripe.actions.changePaidPlanNow, {
          shopId: ids.shopId,
          targetPlan: "business",
          requestId,
          prorationDate: requestedProrationDate,
        }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

    expect(updateCalls).toEqual([]);
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.operations.filter((operation) => operation.kind === "changePaidPlanNow")).toEqual([]);
  });

  it("ProからBusinessのprovider更新が未確定ならPro entitlementをfallbackとして維持する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_pro_to_business_pending",
      plan: "pro",
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "open" }));
      }
      if (resource === "subscriptions.update") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "pro",
            invoiceStatus: "open",
            subscriptionStatus: "active",
            pendingUpdate: true,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    await seedSucceededPaidPlanPreview(t, ids, "apply-pro-to-business-pending");

    await expect(
      t
        .withIdentity({ subject: "stripe_pro_to_business_pending" })
        .action(api.organizationStripe.actions.changePaidPlanNow, {
          shopId: ids.shopId,
          targetPlan: "business",
          requestId: "apply-pro-to-business-pending",
          prorationDate: Math.floor(NOW / 1000),
        }),
    ).resolves.toEqual({ status: "accepted" });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "pendingActivation",
      plan: "business",
      fallback: "pro",
      startedAt: NOW,
    });
    expect(state.subscription).toMatchObject({ stripePriceId: READY_TEST_CONFIGURATION.proPriceId, plan: "pro" });
    expect(state.operations).toHaveLength(2);
    expect(state.operations.find((operation) => operation.kind === "changePaidPlanNow")).toMatchObject({
      status: "succeeded",
    });
  });

  it("pending_if_incomplete後にBusiness Priceがrotationしても保存済みintentの旧Priceでinvoice.paidを回収する", async () => {
    const oldBusinessPriceId = "price_business_before_pending_rotation";
    configurationMock.mockReturnValue({
      ...READY_BUSINESS_TEST_CONFIGURATION,
      businessPriceId: oldBusinessPriceId,
    });
    const t = convexTest(schema, modules);
    const subject = "stripe_pending_business_rotation_matching";
    const requestId = "pending-business-rotation-matching";
    const ids = await seedPaidPlanStripeContext(t, { subject, plan: "pro" });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") {
        const priceId = String(args[0]);
        return providerResponse({
          ...priceFixtureFor(priceId),
          unit_amount: priceId === oldBusinessPriceId ? 2_980 : 1_480,
        });
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "invoices.createPreview") {
        return providerResponse({
          id: "in_preview_pending_business_rotation",
          livemode: false,
          currency: "jpy",
          amount_due: 1_500,
        });
      }
      if (resource === "subscriptions.update") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "pro",
            invoiceStatus: "open",
            pendingUpdate: true,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject });
    const preview = await actor.action(api.organizationStripe.actions.previewPaidPlanChange, {
      shopId: ids.shopId,
      targetPlan: "business",
      requestId,
    });
    if (preview.status !== "available") throw new Error("paid plan preview unavailable");
    await expect(
      actor.action(api.organizationStripe.actions.changePaidPlanNow, {
        shopId: ids.shopId,
        targetPlan: "business",
        requestId,
        prorationDate: preview.prorationDate,
      }),
    ).resolves.toEqual({ status: "accepted" });
    let state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toMatchObject({
      kind: "pendingActivation",
      plan: "business",
      fallback: "pro",
    });
    expect(state.operations.find((operation) => operation.kind === "changePaidPlanNow")).toMatchObject({
      status: "succeeded",
      expectedBillingVersion: 1,
      sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      targetStripePriceIdSnapshot: oldBusinessPriceId,
    });

    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const stripeEventId = "evt_pending_business_rotation_matching";
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "business",
      subscriptionPriceId: oldBusinessPriceId,
      invoicePriceId: oldBusinessPriceId,
      invoiceStatus: "paid",
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, { stripeEventId, type: "invoice.paid", objectId: invoice.id });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).toMatchObject({ plan: "business", stripePriceId: oldBusinessPriceId });
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "processed" });
  });

  it.each([
    { caseName: "別Subscriptionのforeign intent", operationEvidence: "foreign" },
    { caseName: "重複した保存済みintent", operationEvidence: "duplicate" },
    { caseName: "一世代前のbilling versionに属するintent", operationEvidence: "staleVersion" },
  ] as const)("Business Price rotation後のpending更新は$caseNameならfail closedにする", async (testCase) => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const oldBusinessPriceId = "price_business_before_pending_rotation";
    const subject = `stripe_pending_business_rotation_${testCase.operationEvidence}`;
    const ids = await seedPaidPlanStripeContext(t, { subject, plan: "pro" });
    await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing state missing");
      await ctx.db.patch(billing._id, {
        state: {
          kind: "pendingActivation",
          plan: "business",
          fallback: "pro",
          startedAt: NOW - 1_000,
        },
        version: 2,
        updatedAt: NOW - 1_000,
      });
      const operationCount = testCase.operationEvidence === "duplicate" ? 2 : 1;
      for (let index = 0; index < operationCount; index += 1) {
        const foreign = testCase.operationEvidence === "foreign";
        const stripeSubscriptionId = foreign ? "sub_foreign_pending_business_rotation" : ids.stripeSubscriptionId;
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: ids.organizationId,
          kind: "changePaidPlanNow",
          requestKey: `pending-business-rotation-${testCase.operationEvidence}-${index}`,
          stripeIdempotencyKey: `test:pending-business-rotation:${testCase.operationEvidence}:${index}`,
          livemode: false,
          expectedBillingVersion: testCase.operationEvidence === "staleVersion" ? 0 : 1,
          providerGeneration: 1,
          sourcePlan: "pro",
          targetPlan: "business",
          changeMode: "immediate",
          stripeSubscriptionIdSnapshot: stripeSubscriptionId,
          stripeSubscriptionItemIdSnapshot: foreign
            ? "si_foreign_pending_business_rotation"
            : ids.stripeSubscriptionItemId,
          sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
          targetStripePriceIdSnapshot: oldBusinessPriceId,
          prorationDate: Math.floor((NOW - 1_000) / 1000),
          effectiveAt: NOW - 1_000,
          stripeObjectId: stripeSubscriptionId,
          status: "succeeded",
          attemptCount: 1,
          completedAt: NOW - 500,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW - 1_000,
          updatedAt: NOW - 500,
        });
      }
    });
    const stripeEventId = `evt_pending_business_rotation_${testCase.operationEvidence}`;
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "business",
      subscriptionPriceId: oldBusinessPriceId,
      invoicePriceId: oldBusinessPriceId,
      invoiceStatus: "paid",
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, { stripeEventId, type: "invoice.paid", objectId: invoice.id });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    const state = await paidPlanStripeState(t, ids.organizationId);
    const receipt = await t.run(
      async (ctx) =>
        await ctx.db
          .query("stripeWebhookEvents")
          .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
          .unique(),
    );
    expect(state.billing?.state).toEqual({
      kind: "pendingActivation",
      plan: "business",
      fallback: "pro",
      startedAt: NOW - 1_000,
    });
    expect(state.subscription).toMatchObject({
      plan: "pro",
      stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
    });
    expect(receipt).toMatchObject({ status: "actionRequired", lastErrorCode: "subscription_price_invalid" });
  });

  it("ProからBusinessの実適用時に既存pending_updateがあればprovider更新と状態変更を開始しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_pro_to_business_existing_pending",
      plan: "pro",
    });
    const updateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid", pendingUpdate: true }),
        );
      }
      if (resource === "subscriptions.update") {
        updateCalls.push(args);
        throw new Error("provider update must not be called");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    await expect(
      t
        .withIdentity({ subject: "stripe_pro_to_business_existing_pending" })
        .action(api.organizationStripe.actions.changePaidPlanNow, {
          shopId: ids.shopId,
          targetPlan: "business",
          requestId: "apply-existing-pending-update",
          prorationDate: Math.floor(NOW / 1000),
        }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

    expect(updateCalls).toEqual([]);
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.operations).toEqual([]);
  });

  it("日割りpreviewのprovider失敗はterminal failedにして世代lockを残さない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_paid_plan_preview_failure",
      plan: "pro",
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const providerArgs = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(providerArgs[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "invoices.createPreview") throw new MockStripeError(500);
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_paid_plan_preview_failure" })
        .action(api.organizationStripe.actions.previewPaidPlanChange, {
          shopId: ids.shopId,
          targetPlan: "business",
          requestId: "preview-provider-failure",
        }),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "previewPaidPlanChange",
      status: "failed",
      lastErrorCode: "stripe_temporary_error",
      completedAt: NOW,
    });
    expect(state.operations[0]).not.toHaveProperty("nextRunAt");
    const next = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "scheduleFree",
      requestKey: "after-preview-provider-failure",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "pro",
      targetPlan: "free",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
      stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
      sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      effectiveAt: ids.periodEndsAt,
    });
    expect(next).toMatchObject({ created: true, conflict: false });
  });

  it.each([
    { kind: "changePaidPlanNow", plan: "pro", scheduleId: undefined },
    { kind: "schedulePaidPlanChange", plan: "business", scheduleId: undefined },
    { kind: "cancelScheduledPlanChange", plan: "business", scheduleId: "sub_sched_retry_cancel" },
  ] as const)("$kindのprovider例外をdurableに再予約し、8回目はactionRequiredへ終端化する", async (testCase) => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const subject = `stripe_${testCase.kind}_durable_retry`;
    const ids = await seedPaidPlanStripeContext(t, {
      subject,
      plan: testCase.plan,
      ...(testCase.kind === "cancelScheduledPlanChange"
        ? {
            billingState: {
              kind: "scheduledChange" as const,
              currentPlan: "business" as const,
              targetPlan: "pro" as const,
              effectiveAt: NOW,
            },
          }
        : {}),
      ...(testCase.scheduleId ? { scheduleId: testCase.scheduleId } : {}),
    });
    if (testCase.kind === "cancelScheduledPlanChange") {
      await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    }
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const providerArgs = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(providerArgs[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: testCase.plan,
            invoiceStatus: "paid",
            ...(testCase.scheduleId ? { scheduleId: testCase.scheduleId } : {}),
          }),
        );
      }
      if (
        (testCase.kind === "changePaidPlanNow" && resource === "subscriptions.update") ||
        (testCase.kind === "schedulePaidPlanChange" && resource === "subscriptionSchedules.create") ||
        (testCase.kind === "cancelScheduledPlanChange" && resource === "subscriptionSchedules.retrieve")
      ) {
        throw new MockStripeError(500);
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject });
    if (testCase.kind === "changePaidPlanNow") {
      await seedSucceededPaidPlanPreview(t, ids, "durable-paid-plan-retry");
    }
    const invoke = async () => {
      if (testCase.kind === "changePaidPlanNow") {
        return await actor.action(api.organizationStripe.actions.changePaidPlanNow, {
          shopId: ids.shopId,
          targetPlan: "business",
          requestId: "durable-paid-plan-retry",
          prorationDate: Math.floor(NOW / 1000),
        });
      }
      if (testCase.kind === "schedulePaidPlanChange") {
        return await actor.action(api.organizationStripe.actions.schedulePaidPlanChange, {
          shopId: ids.shopId,
          targetPlan: "pro",
          requestId: "durable-paid-plan-retry",
        });
      }
      return await actor.action(api.organizationStripe.actions.cancelScheduledPlanChange, {
        shopId: ids.shopId,
        requestId: "durable-paid-plan-retry",
      });
    };

    await expect(invoke()).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });

    let state = await paidPlanStripeState(t, ids.organizationId);
    const operation = state.operations.find((candidate) => candidate.kind === testCase.kind);
    expect(operation).toMatchObject({
      status: "retrying",
      attemptCount: 1,
      nextRunAt: NOW + 30_000,
      lastErrorCode: "stripe_temporary_error",
    });
    const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "organizationStripe/actions:reconcilePaidPlanChangeOperation",
          args: [{ operationId: operation?._id }],
        }),
      ]),
    );
    if (!operation) throw new Error("paid plan operation missing");
    await t.run(async (ctx) => {
      await ctx.db.patch(operation._id, { attemptCount: 7, nextRunAt: NOW, updatedAt: NOW });
    });

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, {
      operationId: operation._id,
    });

    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.operations.find((candidate) => candidate._id === operation._id)).toMatchObject({
      status: "actionRequired",
      attemptCount: 8,
      lastErrorCode: "attempt_limit_exceeded",
      completedAt: NOW,
    });
  });

  it("Pro→Businessのprovider成功後に停止したretrying operationをlocalへ反映し、terminal後は世代lockを解放する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_paid_plan_recovery_after_provider_success",
      plan: "pro",
    });
    await seedSucceededPaidPlanPreview(t, ids, "recover-paid-plan-success");
    const operationId = await t.run(async (ctx) => {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billing) throw new Error("billing state was not seeded");
      await ctx.db.patch(billing._id, {
        state: { kind: "pendingActivation", plan: "business", fallback: "pro", startedAt: NOW - 1_000 },
        version: 2,
        updatedAt: NOW - 1_000,
      });
      return await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "changePaidPlanNow",
        requestKey: "recover-paid-plan-success",
        stripeIdempotencyKey: `shiftori:test:changePaidPlanNow:${ids.organizationId}:recover-paid-plan-success`,
        livemode: false,
        expectedBillingVersion: 1,
        providerGeneration: 1,
        sourcePlan: "pro",
        targetPlan: "business",
        changeMode: "immediate",
        stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
        stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
        sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        targetStripePriceIdSnapshot: BUSINESS_PRICE_ID,
        prorationDate: Math.floor(NOW / 1000),
        effectiveAt: NOW,
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        lastErrorCode: "stripe_temporary_error",
        expiresAt: NOW + 30 * 24 * 60 * 60_000,
        createdAt: NOW - 1_000,
        updatedAt: NOW - 1_000,
      });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "business", invoiceStatus: "paid" }));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, { operationId });

    expect(providerResources).toEqual(["subscriptions.retrieve"]);
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).toMatchObject({ plan: "business", stripePriceId: BUSINESS_PRICE_ID });
    expect(state.operations).toHaveLength(2);
    expect(state.operations.find((candidate) => candidate._id === operationId)).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
    });
    const notification = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).find(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "planActivated",
      ),
    );
    expect(notification?.args[0]?.notificationDetails).toEqual({
      targetPlan: "business",
      amountDue: 2_980,
      currency: "jpy",
      effectiveAt: NOW,
    });

    const next = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "schedulePaidPlanChange",
      requestKey: "after-terminal-plan-lock",
      livemode: false,
      expectedBillingVersion: 3,
      providerGeneration: 1,
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
      stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
      sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
      targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      effectiveAt: ids.periodEndsAt,
    });
    expect(next).toMatchObject({ created: true, conflict: false });
  });

  it("Business→Pro Schedule作成後のlocal停止は保存済みScheduleを再利用して収束する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_schedule_paid_plan_recovery_after_provider_success",
      plan: "business",
      scheduleId: "sub_sched_recovery_after_provider_success",
    });
    const stripeIdempotencyKey = "test:schedule-recovery-after-provider-success";
    const operationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: ids.organizationId,
          kind: "schedulePaidPlanChange",
          requestKey: "schedule-recovery-after-provider-success",
          stripeIdempotencyKey,
          livemode: false,
          expectedBillingVersion: 1,
          providerGeneration: 1,
          sourcePlan: "business",
          targetPlan: "pro",
          changeMode: "periodEnd",
          stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
          stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
          sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
          targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
          effectiveAt: ids.periodEndsAt,
          stripeObjectId: ids.stripeSubscriptionScheduleId,
          status: "retrying",
          attemptCount: 1,
          nextRunAt: NOW,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW - 1_000,
          updatedAt: NOW - 1_000,
        }),
    );
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            scheduleId: ids.stripeSubscriptionScheduleId,
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId,
            phases: [
              {
                start_date: Math.floor(ids.periodEndsAt / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, { operationId });

    expect(providerResources).toEqual(["subscriptions.retrieve", "subscriptionSchedules.retrieve"]);
    expect(providerResources).not.toContain("subscriptionSchedules.create");
    expect(providerResources).not.toContain("subscriptionSchedules.update");
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: ids.periodEndsAt,
    });
    expect(state.subscription).toMatchObject({
      stripeSubscriptionScheduleId: ids.stripeSubscriptionScheduleId,
      plan: "business",
    });
    expect(state.operations.find((operation) => operation._id === operationId)).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionScheduleId,
      stripeIdempotencyKey,
    });
  });

  it("BusinessのままScheduleがreleasedになった予約回収はscheduledChangeへ誤収束しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_schedule_released_before_target_applied",
      plan: "business",
      scheduleId: "sub_sched_released_before_target_applied",
    });
    const operation = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "schedulePaidPlanChange",
      requestKey: "released-before-target-applied",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
      stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
      sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
      targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      effectiveAt: ids.periodEndsAt,
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: operation.operationId,
      leaseToken: operation.leaseToken as string,
      status: "retrying",
      errorCode: "stripe_temporary_error",
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            scheduleId: ids.stripeSubscriptionScheduleId,
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "released",
            operationId: operation.operationId,
            phases: [
              {
                start_date: Math.floor(ids.periodEndsAt / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, {
      operationId: operation.operationId,
    });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).toMatchObject({
      plan: "business",
      stripePriceId: BUSINESS_PRICE_ID,
      stripeSubscriptionScheduleId: ids.stripeSubscriptionScheduleId,
    });
    expect(state.operations.find((candidate) => candidate._id === operation.operationId)).toMatchObject({
      status: "retrying",
      attemptCount: 2,
      lastErrorCode: "stripe_processing_error",
    });
  });

  it("Business→Pro Schedule解放後のlocal停止は保存済みScheduleを再releaseせず収束する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_cancel_paid_plan_recovery_after_provider_success",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_cancel_recovery_after_provider_success",
    });
    const sourceOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const stripeIdempotencyKey = "test:cancel-recovery-after-provider-success";
    const operationId = await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique();
      if (!subscription) throw new Error("subscription fixture missing");
      await ctx.db.patch(subscription._id, { stripeSubscriptionScheduleId: undefined });
      return await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "cancelScheduledPlanChange",
        requestKey: "cancel-recovery-after-provider-success",
        stripeIdempotencyKey,
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        sourcePlan: "business",
        targetPlan: "pro",
        changeMode: "periodEnd",
        stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
        stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
        sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
        targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        effectiveAt: NOW,
        stripeObjectId: ids.stripeSubscriptionScheduleId,
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW - 1_000,
        updatedAt: NOW - 1_000,
      });
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "business", invoiceStatus: "paid" }));
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, { status: "released", operationId: sourceOperationId }),
        );
      }
      if (resource === "subscriptionSchedules.release") {
        throw new Error("released Schedule must not be released again");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, { operationId });

    expect(providerResources).toEqual([
      "subscriptions.retrieve",
      "subscriptionSchedules.retrieve",
      "subscriptions.retrieve",
    ]);
    expect(providerResources).not.toContain("subscriptionSchedules.release");
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(state.operations.find((operation) => operation._id === operationId)).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      stripeObjectId: ids.stripeSubscriptionScheduleId,
      stripeIdempotencyKey,
    });
  });

  it.each([
    {
      caseName: "snapshot欠落",
      providerGeneration: 1,
      includeSourcePrice: false,
      errorCode: "paid_plan_change_snapshot_invalid",
    },
    {
      caseName: "provider世代不一致",
      providerGeneration: 2,
      includeSourcePrice: true,
      errorCode: "paid_plan_change_binding_invalid",
    },
  ] as const)("有料プラン変更の回収で$caseNameを検知したらactionRequiredへ終端化する", async (testCase) => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: `stripe_paid_plan_invalid_recovery_${testCase.providerGeneration}_${testCase.includeSourcePrice}`,
      plan: "pro",
    });
    const operationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: ids.organizationId,
          kind: "changePaidPlanNow",
          requestKey: `invalid-recovery-${testCase.providerGeneration}-${testCase.includeSourcePrice}`,
          stripeIdempotencyKey: `test:invalid-recovery:${testCase.providerGeneration}:${testCase.includeSourcePrice}`,
          livemode: false,
          expectedBillingVersion: 1,
          providerGeneration: testCase.providerGeneration,
          sourcePlan: "pro",
          targetPlan: "business",
          changeMode: "immediate",
          stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
          stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
          ...(testCase.includeSourcePrice ? { sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId } : {}),
          targetStripePriceIdSnapshot: BUSINESS_PRICE_ID,
          prorationDate: Math.floor(NOW / 1000),
          effectiveAt: NOW,
          status: "retrying",
          attemptCount: 1,
          nextRunAt: NOW,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW - 1_000,
          updatedAt: NOW - 1_000,
        }),
    );

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, { operationId });

    expect(await t.run(async (ctx) => await ctx.db.get(operationId))).toMatchObject({
      status: "actionRequired",
      lastErrorCode: testCase.errorCode,
      completedAt: NOW,
    });
    expect(await t.run(async (ctx) => await ctx.db.get(operationId))).not.toHaveProperty("nextRunAt");
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("有効leaseを持つ有料プラン変更へ重複schedulerが来ても正規ownerを終端化しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_paid_plan_duplicate_scheduler",
      plan: "pro",
    });
    const operationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("organizationStripeOperations", {
          organizationId: ids.organizationId,
          kind: "changePaidPlanNow",
          requestKey: "paid-plan-duplicate-scheduler",
          stripeIdempotencyKey: "test:paid-plan-duplicate-scheduler",
          livemode: false,
          expectedBillingVersion: 1,
          providerGeneration: 1,
          sourcePlan: "pro",
          targetPlan: "business",
          changeMode: "immediate",
          stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
          stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
          sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
          targetStripePriceIdSnapshot: BUSINESS_PRICE_ID,
          prorationDate: Math.floor(NOW / 1000),
          effectiveAt: NOW,
          status: "processing",
          attemptCount: 2,
          leaseToken: "active-paid-plan-owner-lease",
          leaseExpiresAt: NOW + 60_000,
          expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
          createdAt: NOW - 1_000,
          updatedAt: NOW - 1_000,
        }),
    );

    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, { operationId });

    expect(await t.run(async (ctx) => await ctx.db.get(operationId))).toMatchObject({
      status: "processing",
      attemptCount: 2,
      leaseToken: "active-paid-plan-owner-lease",
      leaseExpiresAt: NOW + 60_000,
    });
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("BusinessからProを現在の期間末へScheduleし、取消時はprovider確認後にBusinessへ戻す", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const dailyCadence = { interval: "day", interval_count: 1 } as const;
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_schedule",
      plan: "business",
    });
    const scheduleCreateCalls: unknown[][] = [];
    const scheduleUpdateCalls: unknown[][] = [];
    const scheduleReleaseCalls: unknown[][] = [];
    let scheduled = false;
    let scheduleOperationId: string | undefined;
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") {
        return providerResponse(priceFixtureFor(String(args[0]), dailyCadence));
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            scheduleId: scheduled ? ids.stripeSubscriptionScheduleId : undefined,
            priceRecurring: dailyCadence,
          }),
        );
      }
      if (resource === "subscriptionSchedules.create") {
        scheduleCreateCalls.push(args);
        const payload = args[0] as { metadata: { shiftori_operation_id: string } };
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "not_started",
            operationId: payload.metadata.shiftori_operation_id,
          }),
        );
      }
      if (resource === "subscriptionSchedules.update") {
        scheduleUpdateCalls.push(args);
        scheduled = true;
        const payload = args[1] as { phases: unknown[]; metadata: { shiftori_operation_id: string } };
        scheduleOperationId = payload.metadata.shiftori_operation_id;
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            phases: payload.phases,
            operationId: scheduleOperationId,
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, { status: "active", operationId: scheduleOperationId }),
        );
      }
      if (resource === "subscriptionSchedules.release") {
        scheduleReleaseCalls.push(args);
        scheduled = false;
        return providerResponse(
          subscriptionScheduleFixture(ids, { status: "released", operationId: scheduleOperationId }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "stripe_business_to_pro_schedule" });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "pro",
        requestId: "business-to-pro-at-period-end",
      }),
    ).resolves.toEqual({ status: "accepted" });

    expect(scheduleCreateCalls).toHaveLength(1);
    expect(scheduleCreateCalls[0][0]).toMatchObject({ from_subscription: ids.stripeSubscriptionId });
    expect(scheduleUpdateCalls).toHaveLength(1);
    expect(scheduleUpdateCalls[0][0]).toBe(ids.stripeSubscriptionScheduleId);
    expect(scheduleUpdateCalls[0][1]).toEqual({
      end_behavior: "release",
      proration_behavior: "none",
      metadata: expect.objectContaining({
        shiftori_organization_id: String(ids.organizationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
      }),
      phases: [
        {
          start_date: Math.floor(ids.periodStartsAt / 1000),
          end_date: Math.floor(ids.periodEndsAt / 1000),
          items: [{ price: BUSINESS_PRICE_ID, quantity: 1 }],
          proration_behavior: "none",
        },
        {
          start_date: Math.floor(ids.periodEndsAt / 1000),
          duration: { interval: "day", interval_count: 1 },
          items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
          proration_behavior: "none",
        },
      ],
    });
    let state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: ids.periodEndsAt,
    });
    expect(state.subscription).toMatchObject({
      plan: "business",
      stripePriceId: BUSINESS_PRICE_ID,
      stripeSubscriptionScheduleId: ids.stripeSubscriptionScheduleId,
    });

    await expect(
      actor.action(api.organizationStripe.actions.cancelScheduledPlanChange, {
        shopId: ids.shopId,
        requestId: "cancel-business-to-pro",
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(scheduleReleaseCalls).toHaveLength(1);
    expect(scheduleReleaseCalls[0][0]).toBe(ids.stripeSubscriptionScheduleId);
    expect(scheduleReleaseCalls[0][1]).toEqual({ preserve_cancel_date: false });
    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
  });

  it("Business→Pro開始時の既存Scheduleが別operation所有なら更新せず、actionRequired ownerを別requestで迂回させない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const subject = "stripe_business_to_pro_foreign_schedule_start";
    const foreignScheduleId = "sub_sched_foreign_schedule_start";
    const ids = await seedPaidPlanStripeContext(t, { subject, plan: "business" });
    let scheduleRetrieveCount = 0;
    const scheduleUpdateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            scheduleId: foreignScheduleId,
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        scheduleRetrieveCount += 1;
        return providerResponse({
          ...subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: "foreign-operation-owner",
          }),
          id: foreignScheduleId,
        });
      }
      if (resource === "subscriptionSchedules.update") {
        scheduleUpdateCalls.push(args);
        throw new Error("foreign Schedule must not be updated");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "pro",
        requestId: "foreign-schedule-owner-1",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });

    let state = await paidPlanStripeState(t, ids.organizationId);
    const operation = state.operations.find((candidate) => candidate.kind === "schedulePaidPlanChange");
    expect(operation).toMatchObject({ status: "retrying", attemptCount: 1 });
    if (!operation) throw new Error("schedule operation missing");
    await t.run(async (ctx) => {
      await ctx.db.patch(operation._id, { attemptCount: 7, nextRunAt: NOW, updatedAt: NOW });
    });
    await t.action(internal.organizationStripe.actions.reconcilePaidPlanChangeOperation, {
      operationId: operation._id,
    });

    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.operations.find((candidate) => candidate._id === operation._id)).toMatchObject({
      status: "actionRequired",
      attemptCount: 8,
      lastErrorCode: "attempt_limit_exceeded",
    });
    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "pro",
        requestId: "foreign-schedule-owner-2",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "in_progress" });
    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.operations.filter((candidate) => candidate.kind === "schedulePaidPlanChange")).toHaveLength(1);
    expect(scheduleRetrieveCount).toBe(2);
    expect(scheduleUpdateCalls).toEqual([]);
  });

  it("Business→Pro開始時に作成直後のScheduleがreleasedなら予約状態へ保存しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const subject = "stripe_business_to_pro_created_released";
    const ids = await seedPaidPlanStripeContext(t, { subject, plan: "business" });
    const scheduleUpdateCalls: unknown[][] = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "business", invoiceStatus: "paid" }));
      }
      if (resource === "subscriptionSchedules.create") {
        const payload = args[0] as { metadata: { shiftori_operation_id: string } };
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "released",
            operationId: payload.metadata.shiftori_operation_id,
          }),
        );
      }
      if (resource === "subscriptionSchedules.update") {
        scheduleUpdateCalls.push(args);
        throw new Error("released Schedule must not be updated");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject }).action(api.organizationStripe.actions.schedulePaidPlanChange, {
        shopId: ids.shopId,
        targetPlan: "pro",
        requestId: "created-released-schedule",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(state.operations.find((candidate) => candidate.kind === "schedulePaidPlanChange")).toMatchObject({
      status: "retrying",
      attemptCount: 1,
    });
    expect(scheduleUpdateCalls).toEqual([]);
  });

  it("Business→Pro Scheduleがすでにreleasedでも取消の再試行を成功扱いにする", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_already_released",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_already_released",
    });
    const sourceOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    let subscriptionRetrieveCount = 0;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        subscriptionRetrieveCount += 1;
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            ...(subscriptionRetrieveCount === 1 ? { scheduleId: ids.stripeSubscriptionScheduleId } : {}),
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, { status: "released", operationId: sourceOperationId }),
        );
      }
      if (resource === "subscriptionSchedules.release") {
        throw new Error("released Schedule must not be released again");
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_business_to_pro_already_released" })
        .action(api.organizationStripe.actions.cancelScheduledPlanChange, {
          shopId: ids.shopId,
          requestId: "cancel-already-released-schedule",
        }),
    ).resolves.toEqual({ status: "accepted" });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(providerFetchMock.mock.calls.map(([input]) => String(input))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("subscriptionSchedules.release")]),
    );
  });

  it("Pro Price rotation後も作成時snapshotの旧Priceを正としてBusiness→Pro Scheduleを取り消す", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_rotated_price_cancel",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_rotated_price",
    });
    const scheduledTargetPriceId = "price_pro_before_rotation";
    const sourceOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW, scheduledTargetPriceId);
    let subscriptionRetrieveCount = 0;
    let releaseCount = 0;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        subscriptionRetrieveCount += 1;
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            ...(subscriptionRetrieveCount === 1 ? { scheduleId: ids.stripeSubscriptionScheduleId } : {}),
          }),
        );
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: sourceOperationId,
            targetStripePriceId: scheduledTargetPriceId,
          }),
        );
      }
      if (resource === "subscriptionSchedules.release") {
        releaseCount += 1;
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "released",
            operationId: sourceOperationId,
            targetStripePriceId: scheduledTargetPriceId,
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_business_to_pro_rotated_price_cancel" })
        .action(api.organizationStripe.actions.cancelScheduledPlanChange, {
          shopId: ids.shopId,
          requestId: "cancel-schedule-after-pro-price-rotation",
        }),
    ).resolves.toEqual({ status: "accepted" });

    expect(releaseCount).toBe(1);
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(state.operations.find((operation) => operation.kind === "cancelScheduledPlanChange")).toMatchObject({
      status: "succeeded",
      targetStripePriceIdSnapshot: scheduledTargetPriceId,
    });
  });

  it("Subscriptionが別Scheduleへ差し替わっていたらBusiness→Pro予約の取消でreleaseしない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_foreign_schedule",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_owned",
    });
    await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          paidPlanSubscriptionFixture(ids, {
            plan: "business",
            invoiceStatus: "paid",
            scheduleId: "sub_sched_foreign_dashboard_replacement",
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_business_to_pro_foreign_schedule" })
        .action(api.organizationStripe.actions.cancelScheduledPlanChange, {
          shopId: ids.shopId,
          requestId: "cancel-foreign-schedule",
        }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

    expect(providerResources).toEqual(["subscriptions.retrieve"]);
    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: NOW,
    });
    expect(state.operations.filter((operation) => operation.kind === "cancelScheduledPlanChange")).toEqual([]);
  });

  it.each([
    { result: "paid", overProLimit: false, expectedKind: "active" },
    { result: "paid", overProLimit: true, expectedKind: "active" },
    { result: "failed", overProLimit: false, expectedKind: "grace" },
  ] as const)(
    "Business→Pro期限時にprovider結果=$result・Pro超過=$overProLimitを検証して$expectedKindへ確定する",
    async ({ result, overProLimit, expectedKind }) => {
      configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
      const t = convexTest(schema, modules);
      const ids = await seedPaidPlanStripeContext(t, {
        subject: `stripe_business_to_pro_${result}_${overProLimit}`,
        plan: "business",
        billingState: {
          kind: "scheduledChange",
          currentPlan: "business",
          targetPlan: "pro",
          effectiveAt: NOW,
        },
        scheduleId: "sub_sched_business_to_pro",
      });
      const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
      if (overProLimit) await seedAdditionalOrganizationStaff(t, ids, 20);
      providerFetchMock.mockImplementation(async (input) => {
        const resource = String(input).split("/").pop() ?? "";
        if (resource === "subscriptions.retrieve") {
          return providerResponse(
            paidPlanSubscriptionFixture(ids, {
              plan: "pro",
              invoiceStatus: result === "paid" ? "paid" : "open",
              subscriptionStatus: result === "paid" ? "active" : "past_due",
            }),
          );
        }
        if (resource === "subscriptionSchedules.retrieve") {
          return providerResponse(
            subscriptionScheduleFixture(ids, {
              status: "active",
              operationId: scheduleOperationId,
              phases: [
                {
                  start_date: Math.floor(NOW / 1000),
                  items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
                },
              ],
            }),
          );
        }
        throw new Error(`Unexpected Stripe provider call: ${resource}`);
      });

      await t.action(internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline, {
        organizationId: ids.organizationId,
        expectedBillingVersion: 2,
        requestId: `scheduled-paid-${result}-${overProLimit}`,
      });

      const state = await paidPlanStripeState(t, ids.organizationId);
      expect(state.billing?.state.kind).toBe(expectedKind);
      if (result === "paid") {
        expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
        const notification = await t.run(async (ctx) =>
          (await ctx.db.system.query("_scheduled_functions").collect()).find(
            (job) =>
              job.name === "organizationBilling/actions:enqueueBillingNotification" &&
              job.args[0]?.event === "planActivated",
          ),
        );
        expect(notification?.args[0]?.notificationDetails).toEqual({
          targetPlan: "pro",
          amountDue: 1_480,
          currency: "jpy",
          effectiveAt: NOW,
          ...(overProLimit ? { usageLimitExceeded: true } : {}),
        });
        if (overProLimit) {
          expect(state.billing).toMatchObject({
            businessNotificationCutoffVersion: 3,
            version: 3,
          });
          const cancellation = await t.run(async (ctx) =>
            (await ctx.db.system.query("_scheduled_functions").collect()).find(
              (job) =>
                job.name === "notificationOutbox/mutations:cancelOrganizationBusinessNotifications" &&
                job.args[0]?.cutoffVersion === 3,
            ),
          );
          expect(cancellation).toBeDefined();
        } else {
          expect(state.billing?.businessNotificationCutoffAt).toBeUndefined();
          expect(state.billing?.businessNotificationCutoffVersion).toBeUndefined();
        }
      } else {
        expect(state.billing?.state).toEqual({
          kind: "grace",
          plan: "business",
          targetPlan: "pro",
          startedAt: NOW,
          endsAt: NOW + 14 * 24 * 60 * 60_000,
        });
      }
      expect(state.subscription).toMatchObject({
        stripeSubscriptionId: ids.stripeSubscriptionId,
        stripeSubscriptionItemId: ids.stripeSubscriptionItemId,
        stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
        plan: "pro",
      });
      const reconciliation = state.operations.filter(
        (operation) => operation.recoveryPurpose === "scheduledPaidPlanDeadline",
      );
      expect(reconciliation).toHaveLength(1);
      expect(reconciliation[0]).toMatchObject({
        kind: "reconcileSubscription",
        recoveryPurpose: "scheduledPaidPlanDeadline",
        status: "succeeded",
        sourcePlan: "business",
        targetPlan: "pro",
        changeMode: "periodEnd",
      });
    },
  );

  it("Business→Pro期限の遅延再照合ではreleased Scheduleの元Subscription対応を受け入れる", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_released_deadline",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_released_deadline",
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "released",
            operationId: scheduleOperationId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-paid-released-deadline",
    });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.subscription).toMatchObject({ plan: "pro", stripePriceId: READY_TEST_CONFIGURATION.proPriceId });
  });

  it("Business→Proのinvoice.paid WebhookもSchedule証拠を照合し請求額・通貨・適用日を通知する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_paid_webhook",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_paid_webhook",
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const stripeEventId = "evt_business_to_pro_paid_webhook";
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "pro",
      invoiceStatus: "paid",
      scheduleId: ids.stripeSubscriptionScheduleId,
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, {
      stripeEventId,
      type: "invoice.paid",
      objectId: invoice.id,
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: scheduleOperationId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "processed" });
    const notification = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).find(
        (job) =>
          job.name === "organizationBilling/actions:enqueueBillingNotification" &&
          job.args[0]?.event === "planActivated",
      ),
    );
    expect(notification?.args[0]?.notificationDetails).toEqual({
      targetPlan: "pro",
      amountDue: 1_480,
      currency: "jpy",
      effectiveAt: NOW,
    });
  });

  it("Business→Proの初回Pro請求が未確定でもSchedule bindingを保持し、後続invoice.paidで回収する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_pending_then_paid",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_pending_then_paid",
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const pendingEventId = "evt_business_to_pro_invoice_pending";
    const paidEventId = "evt_business_to_pro_invoice_paid_after_pending";
    const pendingSubscription = paidPlanSubscriptionFixture(ids, {
      plan: "pro",
      invoiceStatus: "open",
    });
    const paidSubscription = paidPlanSubscriptionFixture(ids, {
      plan: "pro",
      invoiceStatus: "paid",
    });
    await seedStripeWebhookReceipt(t, {
      stripeEventId: pendingEventId,
      type: "customer.subscription.updated",
      objectId: ids.stripeSubscriptionId,
    });
    await seedStripeWebhookReceipt(t, {
      stripeEventId: paidEventId,
      type: "invoice.paid",
      objectId: paidSubscription.latest_invoice.id,
    });
    let activeEvent: typeof pendingEventId | typeof paidEventId = pendingEventId;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      const activeSubscription = activeEvent === pendingEventId ? pendingSubscription : paidSubscription;
      if (resource === "events.retrieve") {
        return providerResponse({
          id: activeEvent,
          type: activeEvent === pendingEventId ? "customer.subscription.updated" : "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: {
            object: {
              id: activeEvent === pendingEventId ? ids.stripeSubscriptionId : paidSubscription.latest_invoice.id,
            },
          },
        });
      }
      if (resource === "subscriptions.retrieve") return providerResponse(activeSubscription);
      if (resource === "invoices.retrieve") return providerResponse(paidSubscription.latest_invoice);
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "released",
            operationId: scheduleOperationId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: pendingEventId });

    let state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: NOW,
    });
    expect(state.subscription).toMatchObject({
      plan: "pro",
      stripePriceId: READY_TEST_CONFIGURATION.proPriceId,
      stripeSubscriptionScheduleId: ids.stripeSubscriptionScheduleId,
    });
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", pendingEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "retrying", lastErrorCode: "scheduled_paid_invoice_pending" });

    activeEvent = paidEventId;
    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: paidEventId });

    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.subscription).toMatchObject({ plan: "pro", stripePriceId: READY_TEST_CONFIGURATION.proPriceId });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", paidEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "processed" });
  });

  it.each([
    {
      name: "Price",
      invoicePriceId: "price_unrelated_invoice",
      invoiceEffectiveAt: NOW,
      billingReason: "subscription_cycle",
    },
    {
      name: "開始期間",
      invoicePriceId: READY_TEST_CONFIGURATION.proPriceId,
      invoiceEffectiveAt: NOW + 1_000,
      billingReason: "subscription_cycle",
    },
    {
      name: "billing_reason",
      invoicePriceId: READY_TEST_CONFIGURATION.proPriceId,
      invoiceEffectiveAt: NOW,
      billingReason: "subscription_update",
    },
  ] as const)("Business→Proの初回請求で$nameが予約snapshotと異なれば確定しない", async (testCase) => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const subject = `stripe_scheduled_paid_invoice_invalid_${testCase.name}`;
    const ids = await seedPaidPlanStripeContext(t, {
      subject,
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: `sub_sched_invoice_invalid_${testCase.name}`,
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const stripeEventId = `evt_scheduled_paid_invoice_invalid_${testCase.name}`;
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "pro",
      invoiceStatus: "paid",
      scheduleId: ids.stripeSubscriptionScheduleId,
      invoicePriceId: testCase.invoicePriceId,
      invoiceEffectiveAt: testCase.invoiceEffectiveAt,
      invoiceBillingReason: testCase.billingReason,
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, { stripeEventId, type: "invoice.paid", objectId: invoice.id });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: scheduleOperationId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: NOW,
    });
    expect(state.subscription).toHaveProperty("stripeSubscriptionScheduleId", ids.stripeSubscriptionScheduleId);
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "actionRequired", lastErrorCode: "scheduled_paid_invoice_invalid" });
  });

  it("Pro Priceローテーション後も予約operationの旧Price請求をBusiness→Proの根拠として受け入れる", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const oldProPriceId = "price_pro_before_webhook_rotation";
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_scheduled_paid_old_pro_price_webhook",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_old_pro_price_webhook",
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW, oldProPriceId);
    const stripeEventId = "evt_scheduled_paid_old_pro_price_webhook";
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "pro",
      subscriptionPriceId: oldProPriceId,
      invoicePriceId: oldProPriceId,
      invoiceStatus: "paid",
      scheduleId: ids.stripeSubscriptionScheduleId,
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, { stripeEventId, type: "invoice.paid", objectId: invoice.id });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: scheduleOperationId,
            targetStripePriceId: oldProPriceId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: oldProPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.subscription).toMatchObject({ plan: "pro", stripePriceId: oldProPriceId });
    expect(state.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
            .unique(),
      ),
    ).toMatchObject({ status: "processed" });
  });

  it("Business Priceのinvoice.paid WebhookではBusiness→Proを確定しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_price_paid_webhook",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_price_paid_webhook",
    });
    const scheduleOperationId = await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    const stripeEventId = "evt_business_price_paid_webhook";
    const subscription = paidPlanSubscriptionFixture(ids, {
      plan: "business",
      invoiceStatus: "paid",
      scheduleId: ids.stripeSubscriptionScheduleId,
    });
    const invoice = subscription.latest_invoice;
    await seedStripeWebhookReceipt(t, {
      stripeEventId,
      type: "invoice.paid",
      objectId: invoice.id,
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "events.retrieve") {
        return providerResponse({
          id: stripeEventId,
          type: "invoice.paid",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(NOW / 1000),
          data: { object: { id: invoice.id } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(invoice);
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: scheduleOperationId,
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: NOW,
    });
    expect(
      await t.run(
        async (ctx) =>
          await ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", stripeEventId))
            .unique(),
      ),
    ).toMatchObject({
      status: "actionRequired",
      lastErrorCode: "scheduled_paid_subscription_not_applied",
    });
    expect(
      await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect()).filter(
          (job) => job.name === "organizationBilling/actions:enqueueBillingNotification",
        ),
      ),
    ).toEqual([]);
  });

  it("Business→Pro期限時にScheduleのoperation対応がproviderと一致しなければ確定しない", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_to_pro_operation_mismatch",
      plan: "business",
      billingState: {
        kind: "scheduledChange",
        currentPlan: "business",
        targetPlan: "pro",
        effectiveAt: NOW,
      },
      scheduleId: "sub_sched_business_to_pro_mismatch",
    });
    await seedSucceededBusinessToProScheduleOperation(t, ids, NOW);
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }));
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse(
          subscriptionScheduleFixture(ids, {
            status: "active",
            operationId: "wrong-schedule-operation",
            phases: [
              {
                start_date: Math.floor(NOW / 1000),
                items: [{ price: READY_TEST_CONFIGURATION.proPriceId, quantity: 1 }],
              },
            ],
          }),
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledPaidPlanDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-paid-operation-mismatch",
    });

    const state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "business",
      targetPlan: "pro",
      effectiveAt: NOW,
    });
    expect(state.subscription).toMatchObject({ plan: "business", stripePriceId: BUSINESS_PRICE_ID });
    expect(
      state.operations.find((operation) => operation.recoveryPurpose === "scheduledPaidPlanDeadline"),
    ).toMatchObject({ status: "retrying", lastErrorCode: "stripe_processing_error" });
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
        tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
      expect(`${url.origin}${url.pathname}`).toBe("https://app.example.test/manage/billing");
      expect(url.searchParams.get("org")).toBe(ids.organizationId);
      expect(url.searchParams.get("stripe")).toBe(result);
    }
    expect(payload).not.toHaveProperty("payment_method_data");
    expect(payload).not.toHaveProperty("card");
    expect(payload).not.toHaveProperty("cvc");
    expect(payload).not.toHaveProperty("number");
    expect(payload).not.toHaveProperty("exp_month");
    expect(payload).not.toHaveProperty("exp_year");
  });

  it("organization-scoped Checkoutは組織を保持してapp課金画面へ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "stripe_app_checkout_return",
        plan: "free",
      }),
    );
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
          tax_behavior: "inclusive",
          recurring: { interval: "month", interval_count: 1 },
        });
      }
      if (resource === "customers.create") {
        return providerResponse({ id: "cus_app_checkout_return", livemode: false });
      }
      if (resource === "checkout.sessions.create") {
        checkoutCreateCalls.push(args);
        return providerResponse({
          id: "cs_app_checkout_return",
          url: "https://checkout.stripe.test/app-return",
          livemode: false,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t
        .withIdentity({ subject: "stripe_app_checkout_return" })
        .action(api.organizationStripe.actions.startPaidCheckoutForOrganization, {
          organizationId: ids.organizationId,
          targetPlan: "pro",
          requestId: "app-checkout-return",
        }),
    ).resolves.toEqual({ status: "available", url: "https://checkout.stripe.test/app-return" });

    expect(checkoutCreateCalls).toHaveLength(1);
    const payload = checkoutCreateCalls[0]?.[0] as Record<string, unknown>;
    for (const [urlValue, result] of [
      [payload.success_url, "returned"],
      [payload.cancel_url, "cancelled"],
    ] as const) {
      const url = new URL(String(urlValue));
      expect(`${url.origin}${url.pathname}`).toBe("https://app.example.test/manage/billing");
      expect(url.searchParams.get("org")).toBe(ids.organizationId);
      expect(url.searchParams.get("stripe")).toBe(result);
    }
  });

  it("ブラウザバック後のopen Checkoutは照合だけでは維持し、明示キャンセル後にfallbackへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, { subject: "stripe_cancelled_checkout_recovery", plan: "free" }),
    );
    const providerResources: string[] = [];
    let checkoutOperationId: Id<"organizationStripeOperations"> | undefined;
    let checkoutStatus: "open" | "expired" = "open";
    const session = () => ({
      id: "cs_cancelled_checkout_recovery",
      url: "https://checkout.stripe.test/cancelled-checkout-recovery",
      customer: "cus_cancelled_checkout_recovery",
      livemode: false,
      mode: "subscription",
      status: checkoutStatus,
      client_reference_id: String(ids.organizationId),
      metadata: {
        shiftori_organization_id: String(ids.organizationId),
        shiftori_operation_id: String(checkoutOperationId),
        shiftori_provider_generation: "1",
        shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
      },
    });
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixtureFor(String(args[0])));
      if (resource === "customers.create") {
        return providerResponse({ id: "cus_cancelled_checkout_recovery", livemode: false });
      }
      if (resource === "checkout.sessions.create") {
        return providerResponse({
          id: "cs_cancelled_checkout_recovery",
          url: "https://checkout.stripe.test/cancelled-checkout-recovery",
          livemode: false,
        });
      }
      if (resource === "checkout.sessions.retrieve") return providerResponse(session());
      if (resource === "checkout.sessions.expire") {
        checkoutStatus = "expired";
        return providerResponse(session());
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    const actor = t.withIdentity({ subject: "stripe_cancelled_checkout_recovery" });
    await expect(
      actor.action(api.organizationStripe.actions.startPaidCheckoutForOrganization, {
        organizationId: ids.organizationId,
        targetPlan: "pro",
        requestId: "cancelled-checkout-recovery",
      }),
    ).resolves.toEqual({ status: "available", url: "https://checkout.stripe.test/cancelled-checkout-recovery" });
    checkoutOperationId = await t.run(async (ctx) => {
      const operation = await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_kind_and_status", (q) =>
          q.eq("organizationId", ids.organizationId).eq("kind", "immediatePaidCheckout").eq("status", "succeeded"),
        )
        .unique();
      if (!operation) throw new Error("checkout operation missing");
      return operation._id;
    });

    await expect(
      actor.action(api.organizationStripe.actions.inspectPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({
      status: "open",
      url: "https://checkout.stripe.test/cancelled-checkout-recovery",
    });
    expect(providerResources).toEqual([
      "prices.retrieve",
      "customers.create",
      "checkout.sessions.create",
      "checkout.sessions.retrieve",
    ]);
    await expect(
      t.run(async (ctx) => ({
        billing: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
        operation: await ctx.db.get(checkoutOperationId as Id<"organizationStripeOperations">),
      })),
    ).resolves.toMatchObject({
      billing: { state: { kind: "pendingActivation", plan: "pro", fallback: "free" } },
      operation: { status: "succeeded" },
    });

    await expect(
      actor.action(api.organizationStripe.actions.cancelPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({ status: "cancelled" });
    expect(providerResources).toEqual([
      "prices.retrieve",
      "customers.create",
      "checkout.sessions.create",
      "checkout.sessions.retrieve",
      "checkout.sessions.retrieve",
      "checkout.sessions.expire",
    ]);
    await expect(
      t.run(async (ctx) => ({
        billing: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
        operation: await ctx.db.get(checkoutOperationId as Id<"organizationStripeOperations">),
      })),
    ).resolves.toMatchObject({
      billing: { state: { kind: "active", plan: "free" } },
      operation: { status: "cancelled", lastErrorCode: "checkout_session_cancelled" },
    });

    await expect(
      actor.action(api.organizationStripe.actions.cancelPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual({ status: "unchanged" });
    expect(providerResources).toHaveLength(6);
  });

  it.each([
    { name: "complete", providerFailure: false },
    { name: "provider取得失敗", providerFailure: true },
  ])("Checkoutが$nameならpendingActivationを解除せず安全に保留する", async (testCase) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `stripe_cancelled_checkout_${testCase.providerFailure ? "provider_failure" : "complete"}`,
        plan: "free",
      });
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing state missing");
      await ctx.db.patch(billing._id, {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free", startedAt: NOW },
        version: 2,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationStripeCustomers", {
        organizationId: seeded.organizationId,
        stripeCustomerId: `cus_cancelled_checkout_${testCase.providerFailure ? "provider_failure" : "complete"}`,
        livemode: false,
        createdAt: NOW,
        updatedAt: NOW,
      });
      const operationId = await ctx.db.insert("organizationStripeOperations", {
        organizationId: seeded.organizationId,
        kind: "immediatePaidCheckout",
        requestKey: `cancelled_checkout_${testCase.providerFailure ? "provider_failure" : "complete"}`,
        stripeIdempotencyKey: `test:cancelled_checkout:${testCase.providerFailure ? "provider_failure" : "complete"}`,
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        targetPlan: "pro",
        changeMode: "checkout",
        stripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        stripeObjectId: `cs_cancelled_checkout_${testCase.providerFailure ? "provider_failure" : "complete"}`,
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { ...seeded, operationId };
    });
    const providerResources: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerResources.push(resource);
      if (resource === "checkout.sessions.retrieve") {
        if (testCase.providerFailure) throw new Error("Stripe unavailable");
        return providerResponse({
          id: `cs_cancelled_checkout_complete`,
          customer: `cus_cancelled_checkout_complete`,
          livemode: false,
          mode: "subscription",
          status: "complete",
          client_reference_id: String(ids.organizationId),
          metadata: {
            shiftori_organization_id: String(ids.organizationId),
            shiftori_operation_id: String(ids.operationId),
            shiftori_provider_generation: "1",
            shiftori_price_id: READY_TEST_CONFIGURATION.proPriceId,
          },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    const subject = `stripe_cancelled_checkout_${testCase.providerFailure ? "provider_failure" : "complete"}`;
    await expect(
      t.withIdentity({ subject }).action(api.organizationStripe.actions.cancelPendingCheckoutForOrganization, {
        organizationId: ids.organizationId,
      }),
    ).resolves.toEqual(
      testCase.providerFailure ? { status: "unavailable", reason: "provider_unavailable" } : { status: "pending" },
    );
    expect(providerResources).toEqual(["checkout.sessions.retrieve"]);
    await expect(
      t.run(async (ctx) => ({
        billing: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
        operation: await ctx.db.get(ids.operationId),
      })),
    ).resolves.toMatchObject({
      billing: {
        state: { kind: "pendingActivation", plan: "pro", fallback: "free" },
      },
      operation: { status: "succeeded" },
    });
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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

  it("Business Price停止前に同期済みのTrial SubscriptionはBusiness選択へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_business_price_mapped",
      trialEndsAt: NOW + 10 * 24 * 60 * 60_000,
      source: "mapped",
      targetPlan: "business",
    });
    const providerResources = mockInactivePriceMappedWebhook(ids, inactivePriceTrialSubscription(ids));

    await t.action(internal.organizationStripe.actions.processWebhookEvent, { stripeEventId: ids.stripeEventId });

    expect(providerResources).toEqual([
      "events.retrieve",
      "checkout.sessions.retrieve",
      "prices.retrieve",
      "subscriptions.retrieve",
    ]);
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
    expect(result.billing?.state).toEqual({
      kind: "trial",
      trialEndsAt: ids.trialEndsAt,
      selectedPaidPlan: "business",
    });
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({ status: "succeeded", targetPlan: "business" });
    expect(result.subscription).toMatchObject({
      status: "trialing",
      plan: "business",
      stripePriceId: BUSINESS_PRICE_ID,
    });
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

  it("Business Price停止前に同期済みの契約が期限後activeかつ支払済みならBusinessへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedInactivePriceTrialRecovery(t, {
      suffix: "inactive_business_price_active_paid",
      trialEndsAt: NOW - 60_000,
      source: "mapped",
      targetPlan: "business",
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
        id: "in_inactive_business_price_active_paid",
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
    expect(result.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(result.receipt).toMatchObject({ status: "processed" });
    expect(result.source).toMatchObject({ status: "succeeded", targetPlan: "business" });
  });

  it.each([
    ["trialing", "trial_subscription_billing_state_invalid"],
    ["past_due", "subscription_billing_state_invalid"],
  ] as const)(
    "期限後ローカルFreeでproviderが%sなら将来課金を防ぐため同期済み契約を取消す",
    async (providerStatus, expectedErrorCode) => {
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
    },
  );

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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
  ])(
    "Price停止時は元create試行が$initialAttemptCount回、Webhook試行が$initialReceiptAttemptCount回でも3回再照合する",
    async ({ initialAttemptCount, initialReceiptAttemptCount }) => {
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
            tax_behavior: "inclusive",
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
    },
  );

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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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

  it("paid plan変更operationのintent snapshotは同じrequestIdで差し替えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_paid_plan_intent", plan: "pro" }),
    );
    const base = {
      organizationId: ids.organizationId,
      kind: "changePaidPlanNow" as const,
      requestKey: "paid_plan_immutable_intent",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "pro" as const,
      targetPlan: "business" as const,
      changeMode: "immediate" as const,
      stripeSubscriptionIdSnapshot: "sub_paid_plan_intent",
      stripeSubscriptionItemIdSnapshot: "si_paid_plan_intent",
      sourceStripePriceIdSnapshot: "price_pro_intent",
      targetStripePriceIdSnapshot: "price_business_intent",
      prorationDate: Math.floor(NOW / 1000),
      effectiveAt: NOW,
    };
    const preview = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...base,
      kind: "previewPaidPlanChange",
      effectiveAt: NOW - 1,
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: preview.operationId,
      leaseToken: preview.leaseToken as string,
      status: "succeeded",
    });
    const first = await t.mutation(internal.organizationStripe.mutations.beginOperation, base);
    const intentSnapshot = {
      sourcePlan: base.sourcePlan,
      targetPlan: base.targetPlan,
      changeMode: base.changeMode,
      stripeSubscriptionIdSnapshot: base.stripeSubscriptionIdSnapshot,
      stripeSubscriptionItemIdSnapshot: base.stripeSubscriptionItemIdSnapshot,
      sourceStripePriceIdSnapshot: base.sourceStripePriceIdSnapshot,
      targetStripePriceIdSnapshot: base.targetStripePriceIdSnapshot,
      prorationDate: base.prorationDate,
      effectiveAt: base.effectiveAt,
    };
    expect(first).toMatchObject({ ...intentSnapshot, created: true, conflict: false });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: first.operationId,
      leaseToken: first.leaseToken as string,
      status: "retrying",
      errorCode: "temporary_provider_error",
    });

    const changedIntents = [
      { ...base, sourcePlan: "business" as const },
      { ...base, targetPlan: "free" as const },
      { ...base, changeMode: "periodEnd" as const },
      { ...base, stripeSubscriptionIdSnapshot: "sub_changed_intent" },
      { ...base, stripeSubscriptionItemIdSnapshot: "si_changed_intent" },
      { ...base, sourceStripePriceIdSnapshot: "price_changed_source" },
      { ...base, targetStripePriceIdSnapshot: "price_changed_target" },
      { ...base, prorationDate: base.prorationDate + 1 },
      { ...base, effectiveAt: base.effectiveAt + 1 },
    ];
    for (const changedIntent of changedIntents) {
      await expect(
        t.mutation(internal.organizationStripe.mutations.beginOperation, changedIntent),
      ).resolves.toMatchObject({
        operationId: first.operationId,
        created: false,
        conflict: true,
        status: "retrying",
      });
    }

    const [persisted, queried] = await Promise.all([
      t.run(async (ctx) => await ctx.db.get(first.operationId)),
      t.query(internal.organizationStripe.queries.getOperation, { operationId: first.operationId }),
    ]);
    expect(persisted).toMatchObject({ ...base, attemptCount: 1, status: "retrying" });
    expect(queried).toMatchObject(intentSnapshot);
  });

  it("有料プラン変更は同じprovider世代で排他し、同一intentの見積もり→実適用だけrequestIdを引き継ぐ", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, { subject: "stripe_paid_plan_generation_lock", plan: "pro" }),
    );
    const sharedIntent = {
      organizationId: ids.organizationId,
      requestKey: "paid_plan_shared_intent",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "pro" as const,
      targetPlan: "business" as const,
      changeMode: "immediate" as const,
      stripeSubscriptionIdSnapshot: "sub_paid_plan_lock",
      stripeSubscriptionItemIdSnapshot: "si_paid_plan_lock",
      sourceStripePriceIdSnapshot: "price_pro_lock",
      targetStripePriceIdSnapshot: "price_business_lock",
      prorationDate: Math.floor(NOW / 1000),
    };
    const preview = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...sharedIntent,
      kind: "previewPaidPlanChange",
      effectiveAt: NOW - 1,
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: preview.operationId,
      leaseToken: preview.leaseToken as string,
      status: "succeeded",
    });

    const apply = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...sharedIntent,
      kind: "changePaidPlanNow",
      effectiveAt: NOW,
    });
    expect(apply).toMatchObject({ created: true, conflict: false });

    const scheduleIntent = {
      organizationId: ids.organizationId,
      kind: "schedulePaidPlanChange" as const,
      requestKey: "paid_plan_schedule_lock",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "business" as const,
      targetPlan: "pro" as const,
      changeMode: "periodEnd" as const,
      stripeSubscriptionIdSnapshot: "sub_paid_plan_lock",
      stripeSubscriptionItemIdSnapshot: "si_paid_plan_lock",
      sourceStripePriceIdSnapshot: "price_business_lock",
      targetStripePriceIdSnapshot: "price_pro_lock",
      effectiveAt: NOW + 30 * 24 * 60 * 60_000,
    };
    const competing = await t.mutation(internal.organizationStripe.mutations.beginOperation, scheduleIntent);
    expect(competing).toMatchObject({ operationId: apply.operationId, created: false, conflict: true });

    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: apply.operationId,
      leaseToken: apply.leaseToken as string,
      status: "actionRequired",
      errorCode: "provider_action_required",
    });
    const reusedByOtherKind = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...scheduleIntent,
      requestKey: sharedIntent.requestKey,
    });
    expect(reusedByOtherKind).toMatchObject({ created: false, conflict: true });

    const afterTerminal = await t.mutation(internal.organizationStripe.mutations.beginOperation, scheduleIntent);
    expect(afterTerminal).toMatchObject({ operationId: apply.operationId, created: false, conflict: true });
  });

  it("Free変更のactionRequired ownerは同じprovider世代の取消・有料変更・自己reclaimを遮断する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, { subject: "stripe_free_plan_generation_lock", plan: "pro" }),
    );
    const freeIntent = {
      organizationId: ids.organizationId,
      requestKey: "free-generation-owner",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "pro" as const,
      targetPlan: "free" as const,
      changeMode: "periodEnd" as const,
      stripeSubscriptionIdSnapshot: "sub_free_generation_lock",
      stripeSubscriptionItemIdSnapshot: "si_free_generation_lock",
      sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      effectiveAt: NOW + 30 * 24 * 60 * 60_000,
    };
    const owner = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...freeIntent,
      kind: "scheduleFree",
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: owner.operationId,
      leaseToken: owner.leaseToken as string,
      status: "actionRequired",
      errorCode: "provider_action_required",
    });

    const sameOwner = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...freeIntent,
      kind: "scheduleFree",
    });
    expect(sameOwner).toMatchObject({
      operationId: owner.operationId,
      status: "actionRequired",
      created: false,
      conflict: false,
    });
    const cancel = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      ...freeIntent,
      kind: "cancelFreeSchedule",
      requestKey: "cancel-free-generation-owner",
    });
    expect(cancel).toMatchObject({ operationId: owner.operationId, created: false, conflict: true });
    const paid = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "schedulePaidPlanChange",
      requestKey: "paid-after-free-generation-owner",
      livemode: false,
      expectedBillingVersion: 1,
      providerGeneration: 1,
      sourcePlan: "business",
      targetPlan: "pro",
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: freeIntent.stripeSubscriptionIdSnapshot,
      stripeSubscriptionItemIdSnapshot: freeIntent.stripeSubscriptionItemIdSnapshot,
      sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
      targetStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
      effectiveAt: freeIntent.effectiveAt,
    });
    expect(paid).toMatchObject({ operationId: owner.operationId, created: false, conflict: true });
  });

  it("Business用の期限切れCheckout operationをsingle-flight対象から解放する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(
      async (ctx) => await seedOrganizationManagerShop(ctx, { subject: "stripe_business_expired_checkout" }),
    );
    const operation = await t.mutation(internal.organizationStripe.mutations.beginOperation, {
      organizationId: ids.organizationId,
      kind: "immediatePaidCheckout",
      requestKey: "business_expired_checkout",
      livemode: false,
      providerGeneration: 1,
      targetPlan: "business",
      changeMode: "checkout",
      targetStripePriceIdSnapshot: "price_business_expired",
    });
    await t.mutation(internal.organizationStripe.mutations.finishOperation, {
      operationId: operation.operationId,
      leaseToken: operation.leaseToken as string,
      status: "succeeded",
      stripeObjectId: "cs_business_expired",
    });

    await expect(
      t.mutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
        operationId: operation.operationId,
        stripeSessionId: "cs_business_expired",
      }),
    ).resolves.toEqual({ changed: true });
    await expect(t.run(async (ctx) => await ctx.db.get(operation.operationId))).resolves.toMatchObject({
      status: "cancelled",
      lastErrorCode: "checkout_session_expired",
    });
    await expect(
      t.mutation(internal.organizationStripe.mutations.releaseExpiredCheckoutOperation, {
        operationId: operation.operationId,
        stripeSessionId: "cs_business_expired",
      }),
    ).resolves.toEqual({ changed: true });
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
          tax_behavior: "inclusive",
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
          tax_behavior: "inclusive",
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

  it("Trial継続取消は未認証ならoperation・scheduler・provider通信を開始しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "unauthenticated");
    const before = await trialContinuationBoundaryState(t, ids.organizationId);

    await expect(
      t.action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId: "trial-cancel-unauthenticated",
      }),
    ).rejects.toThrowError("Unauthenticated");

    expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
    expect(before.operations).toEqual([]);
    expect(before.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("Trial継続取消はreadOnly管理者ならoperation・scheduler・provider通信を開始しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "read_only");
    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly", updatedAt: NOW }));
    const before = await trialContinuationBoundaryState(t, ids.organizationId);

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId: "trial-cancel-read-only",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

    expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
    expect(before.operations).toEqual([]);
    expect(before.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("Trial継続取消は他organizationのshop IDをNot foundで拒否して副作用を開始しない", async () => {
    const t = convexTest(schema, modules);
    const target = await seedTrialContinuationCancellation(t, "other_org_target");
    await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "stripe_trial_cancel_other_org_actor",
          plan: "pro",
        }),
    );
    const before = await trialContinuationBoundaryState(t, target.organizationId);

    await expect(
      t
        .withIdentity({ subject: "stripe_trial_cancel_other_org_actor" })
        .action(api.organizationStripe.actions.cancelTrialContinuation, {
          shopId: target.shopId,
          requestId: "trial-cancel-other-org",
        }),
    ).rejects.toThrowError("Not found");

    expect(await trialContinuationBoundaryState(t, target.organizationId)).toEqual(before);
    expect(before.operations).toEqual([]);
    expect(before.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it.each(["active.pro", "trial.unselected"] as const)(
    "Trial継続取消は対象外stateの%sなら副作用を開始しない",
    async (stateKind) => {
      const t = convexTest(schema, modules);
      const ids = await seedTrialContinuationCancellation(t, `state_${stateKind.replace(".", "_")}`);
      await t.run(async (ctx) => {
        const billing = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique();
        if (!billing) throw new Error("billing missing");
        await ctx.db.patch(billing._id, {
          state:
            stateKind === "active.pro"
              ? { kind: "active", plan: "pro" }
              : { kind: "trial", trialEndsAt: ids.trialEndsAt },
          updatedAt: NOW,
        });
      });
      const before = await trialContinuationBoundaryState(t, ids.organizationId);

      await expect(
        t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
          shopId: ids.shopId,
          requestId: `trial-cancel-${stateKind.replace(".", "-")}`,
        }),
      ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

      expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
      expect(before.operations).toEqual([]);
      expect(before.scheduled).toEqual([]);
      expect(providerFetchMock).not.toHaveBeenCalled();
    },
  );

  it("Trial継続取消は同一requestIdの処理中operationを再利用せずprovider通信を重複しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "request_replay");
    const requestId = "trial-cancel-request-replay";
    await seedTrialContinuationOperation(t, ids, { requestId, providerGeneration: 1 });
    const before = await trialContinuationBoundaryState(t, ids.organizationId);

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "request_already_used" });

    expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
    expect(before.operations).toHaveLength(1);
    expect(before.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("Trial継続取消の異なるrequestId同時開始は一つのoperationとidempotency keyを共有する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "concurrent_generation_single_flight");
    const requestIds = ["trial-cancel-concurrent-first", "trial-cancel-concurrent-second"] as const;
    const results = await Promise.all(
      requestIds.map(
        async (requestKey) =>
          await t.mutation(internal.organizationStripe.mutations.beginOperation, {
            organizationId: ids.organizationId,
            kind: "cancelSubscription",
            requestKey,
            livemode: false,
            expectedBillingVersion: 2,
            providerGeneration: 1,
            recoveryPurpose: "trialContinuationCancellation",
          }),
      ),
    );

    const created = results.filter((result) => result.created);
    const blocked = results.filter((result) => !result.created);
    expect(created).toHaveLength(1);
    expect(blocked).toEqual([
      expect.objectContaining({
        operationId: created[0].operationId,
        stripeIdempotencyKey: created[0].stripeIdempotencyKey,
        conflict: true,
      }),
    ]);

    const state = await trialContinuationBoundaryState(t, ids.organizationId);
    expect(state.operations).toHaveLength(1);
    const owner = state.operations[0];
    expect(requestIds).toContain(owner.requestKey);
    expect(owner).toMatchObject({
      _id: created[0].operationId,
      stripeIdempotencyKey: `shiftori:test:cancelSubscription:${ids.organizationId}:${owner.requestKey}`,
      providerGeneration: 1,
      recoveryPurpose: "trialContinuationCancellation",
      status: "processing",
    });
    expect(state.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it.each(["queued", "processing", "retrying", "actionRequired"] as const)(
    "Trial継続取消は異なるrequestIdでも同一provider世代の%s operationと単一実行に収束する",
    async (status) => {
      const t = convexTest(schema, modules);
      const ids = await seedTrialContinuationCancellation(t, `generation_single_flight_${status}`);
      const firstRequestId = `trial-cancel-generation-first-${status}`;
      await seedTrialContinuationOperation(t, ids, {
        requestId: firstRequestId,
        providerGeneration: 1,
        status,
      });
      const before = await trialContinuationBoundaryState(t, ids.organizationId);

      await expect(
        t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
          shopId: ids.shopId,
          requestId: `trial-cancel-generation-second-${status}`,
        }),
      ).resolves.toEqual({ status: "unavailable", reason: "in_progress" });

      expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
      expect(before.operations).toHaveLength(1);
      expect(before.operations[0]).toMatchObject({
        requestKey: firstRequestId,
        stripeIdempotencyKey: `shiftori:test:cancelSubscription:${ids.organizationId}:${firstRequestId}`,
        providerGeneration: 1,
        recoveryPurpose: "trialContinuationCancellation",
        status,
      });
      expect(before.scheduled).toEqual([]);
      expect(providerFetchMock).not.toHaveBeenCalled();
    },
  );

  it("Trial継続取消は同一requestIdの不変intentが競合したらin_progressで拒否する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "request_conflict");
    const requestId = "trial-cancel-request-conflict";
    await seedTrialContinuationOperation(t, ids, { requestId, providerGeneration: 2 });
    const before = await trialContinuationBoundaryState(t, ids.organizationId);

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "in_progress" });

    expect(await trialContinuationBoundaryState(t, ids.organizationId)).toEqual(before);
    expect(before.operations).toHaveLength(1);
    expect(before.scheduled).toEqual([]);
    expect(providerFetchMock).not.toHaveBeenCalled();
  });

  it("Trial継続取消のpublic Actionはscopeとidempotency keyを固定してlocal stateへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "public_success");
    const requestId = "trial-cancel-public-success";
    const providerCalls: Array<{ resource: string; args: unknown[] }> = [];
    providerFetchMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      providerCalls.push({ resource, args });
      if (resource === "subscriptions.retrieve") {
        return providerResponse(trialContinuationProviderSubscription(ids, "trialing"));
      }
      if (resource === "subscriptions.cancel") {
        return providerResponse(trialContinuationProviderSubscription(ids, "canceled"));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId,
      }),
    ).resolves.toEqual({ status: "accepted" });

    const state = await trialContinuationBoundaryState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "trial", trialEndsAt: ids.trialEndsAt });
    expect(state.subscription).toMatchObject({
      stripeSubscriptionId: ids.stripeSubscriptionId,
      status: "canceled",
      terminalAt: NOW,
    });
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "cancelSubscription",
      requestKey: requestId,
      recoveryPurpose: "trialContinuationCancellation",
      providerGeneration: 1,
      stripeObjectId: ids.stripeSubscriptionId,
      status: "succeeded",
      attemptCount: 1,
    });
    expect(state.scheduled).toEqual([
      {
        name: "organizationBilling/mutations:processDeadline",
        args: [
          {
            organizationId: ids.organizationId,
            expectedVersion: 3,
            expectedDeadlineAt: ids.trialEndsAt,
          },
        ],
      },
    ]);
    expect(providerCalls).toEqual([
      {
        resource: "subscriptions.retrieve",
        args: [ids.stripeSubscriptionId, { expand: ["latest_invoice"] }],
      },
      {
        resource: "subscriptions.cancel",
        args: [
          ids.stripeSubscriptionId,
          null,
          {
            idempotencyKey: `shiftori:test:cancelSubscription:${ids.organizationId}:${requestId}`,
          },
        ],
      },
    ]);
  });

  it("Business Trial継続取消もBusiness Priceを照合してlocal stateへ収束する", async () => {
    configurationMock.mockReturnValue(READY_BUSINESS_TEST_CONFIGURATION);
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "public_business", "business");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(trialContinuationProviderSubscription(ids, "trialing"));
      }
      if (resource === "subscriptions.cancel") {
        return providerResponse(trialContinuationProviderSubscription(ids, "canceled"));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId: "trial-cancel-public-business",
      }),
    ).resolves.toEqual({ status: "accepted" });

    const state = await trialContinuationBoundaryState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "trial", trialEndsAt: ids.trialEndsAt });
    expect(state.subscription).toMatchObject({
      stripePriceId: BUSINESS_PRICE_ID,
      plan: "business",
      status: "canceled",
      terminalAt: NOW,
    });
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({ status: "succeeded", providerGeneration: 1 });
    expect(state.scheduled).toEqual([
      {
        name: "organizationBilling/mutations:processDeadline",
        args: [
          {
            organizationId: ids.organizationId,
            expectedVersion: 3,
            expectedDeadlineAt: ids.trialEndsAt,
          },
        ],
      },
    ]);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
  });

  it("Trial継続取消のpublic Actionは初回請求が支払済みならSubscriptionを解約しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "public_paid_race");
    vi.setSystemTime(ids.trialEndsAt);
    const providerCalls: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerCalls.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          ...trialContinuationProviderSubscription(ids, "trialing"),
          status: "active",
          latest_invoice: {
            id: "in_trial_cancel_public_paid_race",
            customer: ids.stripeCustomerId,
            livemode: false,
            status: "paid",
            amount_remaining: 0,
            parent: {
              type: "subscription_details",
              subscription_details: { subscription: ids.stripeSubscriptionId },
            },
          },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId: "trial-cancel-public-paid-race",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });

    const state = await trialContinuationBoundaryState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.subscription).toMatchObject({ status: "active" });
    expect(state.subscription?.terminalAt).toBeUndefined();
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      status: "succeeded",
      lastErrorCode: "trial_continuation_already_paid",
    });
    expect(state.scheduled.map((job) => job.name)).toEqual([
      "organizationStripe/actions:reconcileInitialPaymentPending",
      "organizationBilling/actions:enqueueBillingNotification",
    ]);
    expect(state.scheduled).not.toContainEqual(
      expect.objectContaining({ name: "organizationStripe/actions:reconcileTrialContinuationCancellation" }),
    );
    expect(providerCalls).toEqual(["subscriptions.retrieve"]);
  });

  it("Trial継続取消はprovider取消後のlocal保存失敗を同じoperationのrecoveryへ予約する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedTrialContinuationCancellation(t, "public_recovery");
    const requestId = "trial-cancel-public-recovery";
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(trialContinuationProviderSubscription(ids, "trialing"));
      }
      if (resource === "subscriptions.cancel") {
        const canceled = trialContinuationProviderSubscription(ids, "canceled");
        return providerResponse({ ...canceled, items: { data: [] } });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.withIdentity({ subject: ids.subject }).action(api.organizationStripe.actions.cancelTrialContinuation, {
        shopId: ids.shopId,
        requestId,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "configuration_pending" });

    const state = await trialContinuationBoundaryState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "trial",
      trialEndsAt: ids.trialEndsAt,
      selectedPaidPlan: "pro",
    });
    expect(state.subscription).not.toBeNull();
    expect(state.subscription).toMatchObject({ status: "trialing" });
    expect(state.subscription).not.toHaveProperty("terminalAt");
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0]).toMatchObject({
      kind: "cancelSubscription",
      requestKey: requestId,
      recoveryPurpose: "trialContinuationCancellation",
      providerGeneration: 1,
      status: "retrying",
      attemptCount: 1,
      nextRunAt: NOW + 30_000,
      lastErrorCode: "stripe_processing_error",
    });
    expect(state.scheduled).toEqual([
      {
        name: "organizationStripe/actions:reconcileTrialContinuationCancellation",
        args: [
          {
            organizationId: ids.organizationId,
            expectedBillingVersion: 2,
            requestId,
          },
        ],
      },
    ]);
    expect(providerFetchMock).toHaveBeenCalledTimes(2);
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

  it("Business Trial取消の回復時に初回請求が支払済みならactive.businessを維持して解約しない", async () => {
    const t = convexTest(schema, modules);
    const trialEndsAt = NOW;
    const ids = await seedPaidPlanStripeContext(t, {
      subject: "stripe_business_trial_cancel_already_paid",
      plan: "business",
      billingState: { kind: "trial", trialEndsAt, selectedPaidPlan: "business" },
    });
    const operationId = await t.run(async (ctx) => {
      const subscription = await ctx.db
        .query("organizationStripeSubscriptions")
        .withIndex("by_organizationId_and_providerGeneration", (q) =>
          q.eq("organizationId", ids.organizationId).eq("providerGeneration", 1),
        )
        .unique();
      if (!subscription) throw new Error("subscription missing");
      await ctx.db.patch(subscription._id, { trialEndsAt, status: "trialing" });
      return await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "cancelSubscription",
        requestKey: "business-trial-cancel-already-paid-request",
        stripeIdempotencyKey: `shiftori:test:cancelSubscription:${ids.organizationId}:business-paid`,
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        recoveryPurpose: "trialContinuationCancellation",
        stripeObjectId: ids.stripeSubscriptionId,
        status: "retrying",
        attemptCount: 1,
        nextRunAt: NOW,
        expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const providerCalls: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerCalls.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          ...paidPlanSubscriptionFixture(ids, { plan: "business", invoiceStatus: "paid" }),
          trial_end: Math.floor(trialEndsAt / 1000),
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileTrialContinuationCancellation, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "business-trial-cancel-already-paid-request",
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
      operation: await ctx.db.get(operationId),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(result.subscription).toMatchObject({
      status: "active",
      plan: "business",
      stripePriceId: BUSINESS_PRICE_ID,
    });
    expect(result.subscription?.terminalAt).toBeUndefined();
    expect(result.operation).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      lastErrorCode: "trial_continuation_already_paid",
    });
    expect(providerCalls).toEqual(["subscriptions.retrieve"]);
  });

  it("解約予約はmarkerをoperationへ保存し、取消で有料プランへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidPlanStripeContext(t, { subject: "stripe_service_stop", plan: "pro" });
    let cancelAtPeriodEnd = false;
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      const subscription = {
        ...paidPlanSubscriptionFixture(ids, { plan: "pro", invoiceStatus: "paid" }),
        cancel_at_period_end: cancelAtPeriodEnd,
      };
      if (resource === "subscriptions.retrieve") return providerResponse(subscription);
      if (resource === "subscriptions.update") {
        cancelAtPeriodEnd = !cancelAtPeriodEnd;
        return providerResponse({ ...subscription, cancel_at_period_end: cancelAtPeriodEnd });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "stripe_service_stop" });

    await expect(
      actor.action(api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd, {
        shopId: ids.shopId,
        requestId: "service-stop-schedule",
      }),
    ).resolves.toEqual({ status: "accepted" });
    let state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({
      kind: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "free",
      effectiveAt: ids.periodEndsAt,
      restrictAtPeriodEnd: true,
    });
    expect(state.operations.find((operation) => operation.kind === "scheduleFree")).toMatchObject({
      status: "succeeded",
      restrictAtPeriodEnd: true,
    });

    await expect(
      actor.action(api.organizationStripe.actions.cancelScheduledPlanChange, {
        shopId: ids.shopId,
        requestId: "service-stop-cancel",
      }),
    ).resolves.toEqual({ status: "accepted" });
    state = await paidPlanStripeState(t, ids.organizationId);
    expect(state.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(state.operations.find((operation) => operation.kind === "cancelFreeSchedule")).toMatchObject({
      status: "succeeded",
      restrictAtPeriodEnd: true,
    });
  });

  it("解約予約は未認証・readOnly・別organizationから開始できない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      await seedOrganizationManagerShop(ctx, { subject: "stripe_service_stop_other", plan: "pro" });
      return await seedOrganizationManagerShop(ctx, { subject: "stripe_service_stop_target", plan: "pro" });
    });

    await expect(
      t.action(api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd, {
        shopId: ids.shopId,
        requestId: "service-stop-unauthenticated",
      }),
    ).rejects.toThrow();
    await expect(
      t
        .withIdentity({ subject: "stripe_service_stop_other" })
        .action(api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd, {
          shopId: ids.shopId,
          requestId: "service-stop-other-organization",
        }),
    ).rejects.toThrow();
    await t.run(async (ctx) => await ctx.db.patch(ids.memberId, { status: "readOnly", updatedAt: NOW }));
    await expect(
      t
        .withIdentity({ subject: "stripe_service_stop_target" })
        .action(api.organizationStripe.actions.scheduleServiceStopAtPeriodEnd, {
          shopId: ids.shopId,
          requestId: "service-stop-read-only",
        }),
    ).resolves.toEqual({ status: "unavailable", reason: "not_allowed" });
    expect(providerFetchMock).not.toHaveBeenCalled();
    await expectNoStripeSideEffects(t);
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

  it.each([
    {
      operationKind: "scheduleFree",
      cancelAtPeriodEndSnapshot: false,
      providerCancelAtPeriodEnd: true,
      expectedState: (periodEndsAt: number) => ({
        kind: "scheduledChange" as const,
        currentPlan: "business" as const,
        targetPlan: "free" as const,
        effectiveAt: periodEndsAt,
      }),
    },
    {
      operationKind: "cancelFreeSchedule",
      cancelAtPeriodEndSnapshot: true,
      providerCancelAtPeriodEnd: false,
      expectedState: () => ({ kind: "active" as const, plan: "business" as const }),
    },
  ] as const)(
    "Business→Freeの$operationKind回復はprovider確認後もBusinessを維持する",
    async ({ operationKind, cancelAtPeriodEndSnapshot, providerCancelAtPeriodEnd, expectedState }) => {
      const t = convexTest(schema, modules);
      const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
      const ids = await seedCancelAtPeriodEndRecoveryContext(t, {
        subject: `stripe_business_${operationKind}_recovery`,
        operationKind,
        cancelAtPeriodEndSnapshot,
        periodEndsAt,
        currentPlan: "business",
      });
      providerFetchMock.mockImplementation(async (input) => {
        const resource = String(input).split("/").pop() ?? "";
        if (resource === "subscriptions.retrieve") {
          return providerResponse(
            cancelAtPeriodEndSubscription(ids, {
              cancelAtPeriodEnd: providerCancelAtPeriodEnd,
              periodEndsAt,
            }),
          );
        }
        throw new Error(`Unexpected Stripe provider call: ${resource}`);
      });

      await t.action(internal.organizationStripe.actions.reconcileCancelAtPeriodEndChange, {
        organizationId: ids.organizationId,
        expectedBillingVersion: 2,
        requestId:
          operationKind === "scheduleFree"
            ? "schedule-free-provider-succeeded"
            : "cancel-free-schedule-provider-succeeded",
        operationKind,
      });

      const result = await cancelAtPeriodEndRecoveryState(t, ids.organizationId, ids.operationId);
      expect(result.billing?.state).toEqual(expectedState(periodEndsAt));
      expect(result.subscription).toMatchObject({
        plan: "business",
        stripePriceId: BUSINESS_PRICE_ID,
        cancelAtPeriodEnd: providerCancelAtPeriodEnd,
      });
      expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
    },
  );

  it("解約予約の再試行でもmarkerと同じStripe idempotency keyを保持する", async () => {
    const t = convexTest(schema, modules);
    const periodEndsAt = NOW + 30 * 24 * 60 * 60_000;
    const ids = await seedCancelAtPeriodEndRecoveryContext(t, {
      subject: "stripe_schedule_free_idempotent_retry",
      operationKind: "scheduleFree",
      cancelAtPeriodEndSnapshot: false,
      periodEndsAt,
      restrictAtPeriodEnd: true,
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
    expect(result.billing?.state).toMatchObject({ restrictAtPeriodEnd: true });
    expect(result.operation).toMatchObject({ restrictAtPeriodEnd: true });
    expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
  });

  it("期間末FreeはStripeがactiveで取消解除済みならProへ戻し、Free化しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_free_cancelled");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids, "active", false));
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

  it("Business→Free期限時にStripeの取消解除を確認したらBusinessへ復帰する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_business_cancelled", "business");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids, "active", false));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-business-cancelled-request",
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
    expect(result.billing?.state).toEqual({ kind: "active", plan: "business" });
    expect(result.subscription).toMatchObject({
      plan: "business",
      stripePriceId: BUSINESS_PRICE_ID,
      status: "active",
      cancelAtPeriodEnd: false,
    });
  });

  it("期間末FreeはStripeのterminal Subscription確認後にだけ確定する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_free_confirmed");
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids, "canceled", true));
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

  it("解約予約はproviderの期間変更後もmarkerを保持し、取消確定時にrestrictedへ移す", async () => {
    const t = convexTest(schema, modules);
    const rescheduledEndsAt = NOW + 24 * 60 * 60_000;
    const ids = await seedScheduledFreeStripeContext(t, "stripe_scheduled_restriction_rescheduled", "pro", {
      restrictAtPeriodEnd: true,
    });
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids, "active", true, rescheduledEndsAt));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 2,
      requestId: "scheduled-restriction-rescheduled-request",
    });

    const rescheduled = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
    );
    expect(rescheduled).toMatchObject({
      version: 3,
      state: {
        kind: "scheduledChange",
        currentPlan: "pro",
        targetPlan: "free",
        effectiveAt: rescheduledEndsAt,
        restrictAtPeriodEnd: true,
      },
    });

    vi.setSystemTime(rescheduledEndsAt);
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(scheduledFreeSubscription(ids, "canceled", true, rescheduledEndsAt));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    await t.action(internal.organizationStripe.actions.reconcileScheduledFreeDeadline, {
      organizationId: ids.organizationId,
      expectedBillingVersion: 3,
      requestId: "scheduled-restriction-confirmed-request",
    });

    const confirmed = await t.run(
      async (ctx) =>
        await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
          .unique(),
    );
    expect(confirmed).toMatchObject({
      version: 4,
      state: { kind: "active", plan: "free" },
    });
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
    const billing = await t.run((ctx) =>
      ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
    );
    expect(billing).toMatchObject({ version: 3, state: { kind: "active", plan: "free" } });
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

  it("猶予終了処理の取消直前に支払いを確認した場合は元の有料プランへ復旧する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedExpiredGraceStripeContext(t, "stripe_grace_late_paid");
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "reconcileSubscription",
        requestKey: "grace-late-paid",
        stripeIdempotencyKey: "test:grace-late-paid:reconcile",
        livemode: false,
        expectedBillingVersion: 2,
        providerGeneration: 1,
        status: "succeeded",
        attemptCount: 1,
        stripeObjectId: "sub_grace",
        completedAt: NOW,
        expiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
    });
    const providerCalls: string[] = [];
    providerFetchMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      providerCalls.push(resource);
      if (resource === "subscriptions.retrieve") {
        return providerResponse({
          ...stripeSubscription("past_due"),
          status: "active",
          latest_invoice: { ...stripeInvoice("in_paid"), status: "paid", amount_remaining: 0 },
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

    await expect(
      t.action(internal.organizationStripe.actions.stopExpiredGraceCollection, {
        organizationId: ids.organizationId,
        expectedBillingVersion: 2,
        requestId: "grace-late-paid",
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      operations: await ctx.db
        .query("organizationStripeOperations")
        .withIndex("by_organizationId_and_status")
        .collect(),
    }));
    expect(result.billing).toMatchObject({ version: 3, state: { kind: "active", plan: "pro" } });
    expect(result.operations.map((operation) => [operation.kind, operation.status])).toEqual([
      ["reconcileSubscription", "succeeded"],
      ["cancelSubscription", "succeeded"],
    ]);
    expect(providerCalls).toEqual(["subscriptions.retrieve"]);
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

  it("Portal設定が危険ならSessionを作成せず、安全設定ではapp課金画面へ戻す", async () => {
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
      actor.action(api.organizationStripe.actions.openCustomerPortalForOrganization, {
        organizationId: ids.organizationId,
        requestId: "portal-safe-configuration",
      }),
    ).resolves.toEqual({ status: "redirect", url: "https://billing.stripe.test/session" });
    expect(portalCreateCalls).toHaveLength(1);
    const returnUrl = new URL(String((portalCreateCalls[0][0] as { return_url: string }).return_url));
    expect(`${returnUrl.origin}${returnUrl.pathname}`).toBe("https://app.example.test/manage/billing");
    expect(returnUrl.searchParams.get("org")).toBe(ids.organizationId);
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
          tax_behavior: "inclusive",
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

async function seedTrialContinuationCancellation(
  t: TestConvex<typeof schema>,
  suffix: string,
  selectedPaidPlan: "pro" | "business" = "pro",
) {
  return await t.run(async (ctx) => {
    const subject = `stripe_trial_cancel_${suffix}`;
    const seeded = await seedOrganizationManagerShop(ctx, { subject });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing missing");
    const trialEndsAt = NOW + 7 * 24 * 60 * 60_000;
    await ctx.db.patch(billing._id, {
      state: { kind: "trial", trialEndsAt, selectedPaidPlan },
      version: 2,
      updatedAt: NOW,
    });
    const stripeCustomerId = `cus_trial_cancel_${suffix}`;
    const stripeSubscriptionId = `sub_trial_cancel_${suffix}`;
    const stripeSubscriptionItemId = `si_trial_cancel_${suffix}`;
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
      stripeSubscriptionItemId,
      stripePriceId: selectedPaidPlan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId,
      plan: selectedPaidPlan,
      livemode: false,
      status: "trialing",
      providerGeneration: 1,
      trialEndsAt,
      currentPeriodStartsAt: NOW,
      currentPeriodEndsAt: trialEndsAt,
      billingCycleAnchor: trialEndsAt,
      cancelAtPeriodEnd: false,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      subject,
      trialEndsAt,
      stripePriceId: selectedPaidPlan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionItemId,
    };
  });
}

async function seedTrialContinuationOperation(
  t: TestConvex<typeof schema>,
  ids: Awaited<ReturnType<typeof seedTrialContinuationCancellation>>,
  args: {
    requestId: string;
    providerGeneration: number;
    status?: "queued" | "processing" | "retrying" | "actionRequired";
  },
) {
  return await t.run(async (ctx) => {
    const status = args.status ?? "processing";
    return await ctx.db.insert("organizationStripeOperations", {
      organizationId: ids.organizationId,
      kind: "cancelSubscription",
      requestKey: args.requestId,
      stripeIdempotencyKey: `shiftori:test:cancelSubscription:${ids.organizationId}:${args.requestId}`,
      livemode: false,
      expectedBillingVersion: 2,
      providerGeneration: args.providerGeneration,
      recoveryPurpose: "trialContinuationCancellation",
      status,
      attemptCount: 1,
      ...(status === "processing"
        ? {
            leaseToken: `trial-cancel-${args.providerGeneration}-lease`,
            leaseExpiresAt: NOW + 60_000,
          }
        : {}),
      ...(status === "retrying" ? { nextRunAt: NOW + 30_000 } : {}),
      ...(status === "actionRequired" ? { lastErrorCode: "attempt_limit_exceeded", completedAt: NOW } : {}),
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

async function trialContinuationBoundaryState(t: TestConvex<typeof schema>, organizationId: Id<"organizations">) {
  return await t.run(async (ctx) => ({
    billing: await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    customer: await ctx.db
      .query("organizationStripeCustomers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    subscription: await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) =>
        q.eq("organizationId", organizationId).eq("providerGeneration", 1),
      )
      .unique(),
    operations: await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
      .collect(),
    scheduled: (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => ({
      name: job.name,
      args: job.args,
    })),
  }));
}

function trialContinuationProviderSubscription(
  ids: Awaited<ReturnType<typeof seedTrialContinuationCancellation>>,
  status: "trialing" | "canceled",
) {
  const stripePriceId = ids.stripePriceId;
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: stripePriceId,
    },
    trial_end: Math.floor(ids.trialEndsAt / 1000),
    cancel_at_period_end: false,
    latest_invoice: null,
    billing_cycle_anchor: Math.floor(ids.trialEndsAt / 1000),
    items: {
      data: [
        {
          id: ids.stripeSubscriptionItemId,
          current_period_start: Math.floor(NOW / 1000),
          current_period_end: Math.floor(ids.trialEndsAt / 1000),
          price: {
            id: stripePriceId,
            active: true,
            livemode: false,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
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

async function seedScheduledFreeStripeContext(
  t: TestConvex<typeof schema>,
  subject: string,
  currentPlan: "pro" | "business" = "pro",
  options: { restrictAtPeriodEnd?: true } = {},
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: currentPlan });
    const stripeCustomerId = `cus_scheduled_free_${currentPlan}`;
    const stripeSubscriptionId = `sub_scheduled_free_${currentPlan}`;
    const stripeSubscriptionItemId = `si_scheduled_free_${currentPlan}`;
    const stripePriceId = currentPlan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId;
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing state was not seeded");
    await ctx.db.patch(billing._id, {
      state: {
        kind: "scheduledChange",
        currentPlan,
        targetPlan: "free",
        effectiveAt: NOW,
        ...(options.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
      },
      version: 2,
      updatedAt: NOW,
    });
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
      stripeSubscriptionItemId,
      stripePriceId,
      plan: currentPlan,
      livemode: false,
      status: "active",
      providerGeneration: 1,
      currentPeriodEndsAt: NOW,
      cancelAtPeriodEnd: true,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      currentPlan,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionItemId,
      stripePriceId,
    };
  });
}

async function seedPaidPlanStripeContext(
  t: TestConvex<typeof schema>,
  args: {
    subject: string;
    plan: "pro" | "business";
    billingState?: Doc<"organizationBillingStates">["state"];
    scheduleId?: string;
  },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject: args.subject, plan: args.plan });
    if (args.billingState) {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing state was not seeded");
      await ctx.db.patch(billing._id, { state: args.billingState, version: 2, updatedAt: NOW });
    }
    const stripeCustomerId = `cus_${args.subject}`;
    const stripeSubscriptionId = `sub_${args.subject}`;
    const stripeSubscriptionItemId = `si_${args.subject}`;
    const stripeSubscriptionScheduleId = args.scheduleId ?? "sub_sched_business_to_pro";
    const periodStartsAt = NOW - 10 * 24 * 60 * 60_000;
    const periodEndsAt = NOW + 20 * 24 * 60 * 60_000;
    const billingCycleAnchor = periodStartsAt;
    const stripePriceId = args.plan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId;
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
      stripeSubscriptionItemId,
      stripePriceId,
      plan: args.plan,
      livemode: false,
      status: "active",
      providerGeneration: 1,
      currentPeriodStartsAt: periodStartsAt,
      currentPeriodEndsAt: periodEndsAt,
      billingCycleAnchor,
      ...(args.scheduleId ? { stripeSubscriptionScheduleId: args.scheduleId } : {}),
      cancelAtPeriodEnd: false,
      latestInvoiceId: `in_${args.subject}`,
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return {
      ...seeded,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionItemId,
      stripeSubscriptionScheduleId,
      periodStartsAt,
      periodEndsAt,
      billingCycleAnchor,
    };
  });
}

async function seedStripeWebhookReceipt(
  t: TestConvex<typeof schema>,
  args: {
    stripeEventId: string;
    type: "invoice.paid" | "customer.subscription.updated";
    objectId: string;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stripeWebhookEvents", {
      stripeEventId: args.stripeEventId,
      type: args.type,
      apiVersion: STRIPE_WEBHOOK_API_VERSION,
      livemode: false,
      objectId: args.objectId,
      eventCreatedAt: NOW,
      status: "received",
      attemptCount: 0,
      receivedAt: NOW,
      expiresAt: NOW + STRIPE_WEBHOOK_EVENT_RETENTION_MS,
      updatedAt: NOW,
    });
  });
}

async function seedSucceededBusinessToProScheduleOperation(
  t: TestConvex<typeof schema>,
  ids: Awaited<ReturnType<typeof seedPaidPlanStripeContext>>,
  effectiveAt: number,
  targetStripePriceId = READY_TEST_CONFIGURATION.proPriceId,
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "schedulePaidPlanChange",
        requestKey: `scheduled-source-${String(ids.organizationId).slice(-16)}`,
        stripeIdempotencyKey: `test:schedule:${ids.organizationId}`,
        livemode: false,
        expectedBillingVersion: 1,
        providerGeneration: 1,
        sourcePlan: "business",
        targetPlan: "pro",
        changeMode: "periodEnd",
        stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
        stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
        sourceStripePriceIdSnapshot: BUSINESS_PRICE_ID,
        targetStripePriceIdSnapshot: targetStripePriceId,
        effectiveAt,
        stripeObjectId: ids.stripeSubscriptionScheduleId,
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + 30 * 24 * 60 * 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      }),
  );
}

async function seedSucceededPaidPlanPreview(
  t: TestConvex<typeof schema>,
  ids: Awaited<ReturnType<typeof seedPaidPlanStripeContext>>,
  requestKey: string,
  prorationDate = Math.floor(NOW / 1000),
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("organizationStripeOperations", {
        organizationId: ids.organizationId,
        kind: "previewPaidPlanChange",
        requestKey,
        stripeIdempotencyKey: `test:preview:${ids.organizationId}:${requestKey}`,
        livemode: false,
        expectedBillingVersion: 1,
        providerGeneration: 1,
        sourcePlan: "pro",
        targetPlan: "business",
        changeMode: "immediate",
        stripeSubscriptionIdSnapshot: ids.stripeSubscriptionId,
        stripeSubscriptionItemIdSnapshot: ids.stripeSubscriptionItemId,
        sourceStripePriceIdSnapshot: READY_TEST_CONFIGURATION.proPriceId,
        targetStripePriceIdSnapshot: BUSINESS_PRICE_ID,
        prorationDate,
        effectiveAt: NOW,
        stripeObjectId: `in_preview_${requestKey}`,
        status: "succeeded",
        attemptCount: 1,
        completedAt: NOW,
        expiresAt: NOW + 30 * 24 * 60 * 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      }),
  );
}

async function seedCurrentSubscriptionPriceContext(
  t: TestConvex<typeof schema>,
  args: {
    subject: string;
    priceId?: string;
    subscriptionPlan?: "pro" | "business";
    subscriptionStatus?: Doc<"organizationStripeSubscriptions">["status"];
    subscriptionLivemode?: boolean;
    terminalAt?: number;
    billingState?: (ids: {
      personId: Id<"organizationPeople">;
      shopId: Id<"shops">;
    }) => Doc<"organizationBillingStates">["state"];
  },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, { subject: args.subject, plan: "pro" });
    if (args.billingState) {
      const billing = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billing) throw new Error("billing state was not seeded");
      await ctx.db.patch(billing._id, {
        state: args.billingState({ personId: seeded.personId, shopId: seeded.shopId }),
        version: billing.version + 1,
        updatedAt: NOW,
      });
    }
    await ctx.db.insert("organizationStripeSubscriptions", {
      organizationId: seeded.organizationId,
      stripeCustomerId: `cus_${args.subject}`,
      stripeSubscriptionId: `sub_${args.subject}`,
      stripeSubscriptionItemId: `si_${args.subject}`,
      stripePriceId: args.priceId ?? READY_TEST_CONFIGURATION.proPriceId,
      plan: args.subscriptionPlan ?? "pro",
      livemode: args.subscriptionLivemode ?? false,
      status: args.subscriptionStatus ?? "active",
      providerGeneration: 1,
      currentPeriodStartsAt: NOW,
      currentPeriodEndsAt: NOW + 30 * 24 * 60 * 60_000,
      cancelAtPeriodEnd: false,
      ...(args.terminalAt !== undefined ? { terminalAt: args.terminalAt } : {}),
      syncedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    return seeded;
  });
}

function priceFixtureFor(
  priceId: string,
  recurring: { interval: "day" | "week" | "month" | "year"; interval_count: number } = {
    interval: "month",
    interval_count: 1,
  },
) {
  return {
    id: priceId,
    active: true,
    livemode: false,
    currency: "jpy",
    unit_amount: priceId === BUSINESS_PRICE_ID ? 2980 : 1480,
    tax_behavior: "inclusive",
    recurring,
  };
}

function paidPlanSubscriptionFixture(
  ids: Awaited<ReturnType<typeof seedPaidPlanStripeContext>>,
  args: {
    plan: "pro" | "business";
    invoiceStatus: "paid" | "open";
    subscriptionStatus?: "active" | "past_due";
    pendingUpdate?: boolean;
    scheduleId?: string;
    subscriptionPriceId?: string;
    invoiceEffectiveAt?: number;
    invoicePriceId?: string;
    invoiceBillingReason?: string;
    priceRecurring?: { interval: "day" | "week" | "month" | "year"; interval_count: number };
  },
) {
  const priceId =
    args.subscriptionPriceId ?? (args.plan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId);
  const invoiceId = `in_${ids.stripeSubscriptionId}_${args.invoiceStatus}`;
  const invoiceEffectiveAt = args.invoiceEffectiveAt ?? NOW;
  const invoicePriceId = args.invoicePriceId ?? priceId;
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status: args.subscriptionStatus ?? "active",
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: priceId,
    },
    billing_cycle_anchor: Math.floor(ids.billingCycleAnchor / 1000),
    trial_end: null,
    cancel_at_period_end: false,
    schedule: args.scheduleId ?? null,
    ...(args.pendingUpdate ? { pending_update: { expires_at: Math.floor((NOW + 60_000) / 1000) } } : {}),
    latest_invoice: {
      id: invoiceId,
      customer: ids.stripeCustomerId,
      livemode: false,
      status: args.invoiceStatus,
      currency: "jpy",
      amount_paid: args.invoiceStatus === "paid" ? (args.plan === "business" ? 2_980 : 1_480) : 0,
      amount_remaining: args.invoiceStatus === "paid" ? 0 : 1500,
      created: Math.floor(NOW / 1000),
      billing_reason: args.invoiceBillingReason ?? "subscription_cycle",
      period_start: Math.floor(invoiceEffectiveAt / 1000),
      period_end: Math.floor((invoiceEffectiveAt + 30 * 24 * 60 * 60_000) / 1000),
      status_transitions: { finalized_at: Math.floor(NOW / 1000) },
      parent: { subscription_details: { subscription: ids.stripeSubscriptionId } },
      lines: {
        has_more: false,
        data: [
          {
            pricing: { price_details: { price: invoicePriceId } },
            period: {
              start: Math.floor(invoiceEffectiveAt / 1000),
              end: Math.floor((invoiceEffectiveAt + 30 * 24 * 60 * 60_000) / 1000),
            },
          },
        ],
      },
    },
    items: {
      data: [
        {
          id: ids.stripeSubscriptionItemId,
          quantity: 1,
          current_period_start: Math.floor(ids.periodStartsAt / 1000),
          current_period_end: Math.floor(ids.periodEndsAt / 1000),
          price: priceFixtureFor(priceId, args.priceRecurring),
        },
      ],
    },
  };
}

function subscriptionScheduleFixture(
  ids: Awaited<ReturnType<typeof seedPaidPlanStripeContext>>,
  args: {
    status: "not_started" | "active" | "released";
    phases?: unknown[];
    operationId?: Id<"organizationStripeOperations"> | string;
    targetStripePriceId?: string;
  },
) {
  return {
    id: ids.stripeSubscriptionScheduleId,
    customer: ids.stripeCustomerId,
    subscription: args.status === "released" ? null : ids.stripeSubscriptionId,
    released_subscription: args.status === "released" ? ids.stripeSubscriptionId : null,
    livemode: false,
    status: args.status,
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      ...(args.operationId ? { shiftori_operation_id: String(args.operationId) } : {}),
      shiftori_provider_generation: "1",
      shiftori_price_id: args.targetStripePriceId ?? READY_TEST_CONFIGURATION.proPriceId,
    },
    current_phase: { start_date: Math.floor(ids.periodStartsAt / 1000) },
    phases: args.phases ?? [],
  };
}

async function seedAdditionalOrganizationStaff(
  t: TestConvex<typeof schema>,
  ids: { organizationId: Id<"organizations">; shopId: Id<"shops"> },
  count: number,
) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      const email = `stripe-over-limit-${index}@example.com`;
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: ids.organizationId,
        name: `超過スタッフ${index + 1}`,
        email,
        emailNormalized: email,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("staffs", {
        organizationId: ids.organizationId,
        organizationPersonId: personId,
        shopId: ids.shopId,
        name: `超過スタッフ${index + 1}`,
        email,
        emailNormalized: email,
        isDeleted: false,
      });
    }
  });
}

async function paidPlanStripeState(t: TestConvex<typeof schema>, organizationId: Id<"organizations">) {
  return await t.run(async (ctx) => ({
    billing: await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    subscription: await ctx.db
      .query("organizationStripeSubscriptions")
      .withIndex("by_organizationId_and_providerGeneration", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .first(),
    operations: await ctx.db
      .query("organizationStripeOperations")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId))
      .collect(),
  }));
}

async function seedCancelAtPeriodEndRecoveryContext(
  t: TestConvex<typeof schema>,
  args: {
    subject: string;
    operationKind: "scheduleFree" | "cancelFreeSchedule";
    cancelAtPeriodEndSnapshot: boolean;
    periodEndsAt: number;
    currentPlan?: "pro" | "business";
    restrictAtPeriodEnd?: true;
  },
) {
  return await t.run(async (ctx) => {
    const currentPlan = args.currentPlan ?? "pro";
    const stripePriceId = currentPlan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId;
    const seeded = await seedOrganizationManagerShop(ctx, { subject: args.subject, plan: currentPlan });
    const billing = await ctx.db
      .query("organizationBillingStates")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
      .unique();
    if (!billing) throw new Error("billing state was not seeded");
    await ctx.db.patch(billing._id, {
      state:
        args.operationKind === "scheduleFree"
          ? { kind: "active", plan: currentPlan }
          : {
              kind: "scheduledChange",
              currentPlan,
              targetPlan: "free",
              effectiveAt: args.periodEndsAt,
              ...(args.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
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
      stripePriceId,
      plan: currentPlan,
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
      sourcePlan: currentPlan,
      targetPlan: "free",
      ...(args.restrictAtPeriodEnd === true ? { restrictAtPeriodEnd: true as const } : {}),
      changeMode: "periodEnd",
      stripeSubscriptionIdSnapshot: stripeSubscriptionId,
      stripeSubscriptionItemIdSnapshot: `si_${suffix}`,
      sourceStripePriceIdSnapshot: stripePriceId,
      effectiveAt: args.periodEndsAt,
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
      stripePriceId,
      currentPlan,
    };
  });
}

function cancelAtPeriodEndSubscription(
  ids: {
    organizationId: Id<"organizations">;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    stripeSubscriptionItemId: string;
    stripePriceId: string;
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
      shiftori_price_id: ids.stripePriceId,
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
            id: ids.stripePriceId,
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
  ids: Awaited<ReturnType<typeof seedScheduledFreeStripeContext>>,
  status: "active" | "canceled",
  cancelAtPeriodEnd: boolean,
  periodEndsAt = NOW,
) {
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: ids.stripePriceId,
    },
    trial_end: null,
    cancel_at_period_end: cancelAtPeriodEnd,
    latest_invoice: null,
    items: {
      data: [
        {
          id: ids.stripeSubscriptionItemId,
          current_period_end: Math.floor(periodEndsAt / 1000),
          price: {
            id: ids.stripePriceId,
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
  args: {
    suffix: string;
    trialEndsAt: number;
    source: "unbound" | "mapped";
    targetPlan?: "pro" | "business";
  },
) {
  return await t.run(async (ctx) => {
    const targetPlan = args.targetPlan ?? "pro";
    const stripePriceId = targetPlan === "business" ? BUSINESS_PRICE_ID : READY_TEST_CONFIGURATION.proPriceId;
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
      targetPlan,
      changeMode: "checkout",
      stripePriceIdSnapshot: stripePriceId,
      targetStripePriceIdSnapshot: stripePriceId,
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
      targetPlan,
      changeMode: "checkout",
      stripePriceIdSnapshot: stripePriceId,
      targetStripePriceIdSnapshot: stripePriceId,
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
        stripePriceId,
        plan: targetPlan,
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
      targetPlan,
      stripePriceId,
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
      shiftori_price_id: ids.stripePriceId,
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
            id: ids.stripePriceId,
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
          shiftori_price_id: ids.stripePriceId,
        },
      });
    }
    if (resource === "prices.retrieve") {
      return providerResponse({
        id: ids.stripePriceId,
        active: false,
        livemode: false,
        currency: "jpy",
        unit_amount: 1480,
        tax_behavior: "inclusive",
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
