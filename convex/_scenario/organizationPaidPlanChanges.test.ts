import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getTestOrganizationId, seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { STRIPE_WEBHOOK_API_VERSION, type StripeBillingConfiguration } from "../organizationStripe/config";
import type { StripeWebhookEventType } from "../organizationStripe/validators";

const stripeConfigurationMock = vi.hoisted(() => vi.fn<() => StripeBillingConfiguration>());
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

vi.mock("../organizationStripe/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../organizationStripe/config")>();
  return { ...actual, getStripeBillingConfiguration: stripeConfigurationMock };
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
        retrieve: async (...args: unknown[]) => await providerRequest("checkout.sessions.retrieve", args),
        create: async (...args: unknown[]) => await providerRequest("checkout.sessions.create", args),
      },
    };
    customers = {
      retrieve: async (...args: unknown[]) => await providerRequest("customers.retrieve", args),
      create: async (...args: unknown[]) => await providerRequest("customers.create", args),
      update: async (...args: unknown[]) => await providerRequest("customers.update", args),
    };
    subscriptions = {
      list: async (...args: unknown[]) => await providerRequest("subscriptions.list", args),
      retrieve: async (...args: unknown[]) => await providerRequest("subscriptions.retrieve", args),
      update: async (...args: unknown[]) => await providerRequest("subscriptions.update", args),
      cancel: async (...args: unknown[]) => await providerRequest("subscriptions.cancel", args),
      create: async (...args: unknown[]) => await providerRequest("subscriptions.create", args),
    };
    events = { retrieve: async (...args: unknown[]) => await providerRequest("events.retrieve", args) };
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
    setupIntents = { retrieve: async (...args: unknown[]) => await providerRequest("setupIntents.retrieve", args) };
    paymentMethods = {
      retrieve: async (...args: unknown[]) => await providerRequest("paymentMethods.retrieve", args),
    };
  }
  return { default: MockStripe };
});

const SCENARIO_NOW = Date.parse("2026-12-10T10:00:00+09:00");
const STANDARD_PRICE_ID = "price_scenario_standard";
const PRO_PRICE_ID = "price_scenario_pro";
const READY_STRIPE_CONFIGURATION = {
  status: "ready",
  livemode: false,
  secretKey: "sk_test_scenario",
  webhookSecret: "whsec_scenario",
  standardPriceId: STANDARD_PRICE_ID,
  proPriceId: PRO_PRICE_ID,
  portalConfigurationId: "bpc_scenario",
} satisfies StripeBillingConfiguration;
const FREE_PAID_CHECKOUT_CASES = [
  { targetPlan: "standard", peopleMax: 25, duplicateWebhook: false },
  { targetPlan: "pro", peopleMax: 50, duplicateWebhook: true },
] as const;
const stripeProviderMock = vi.fn<typeof globalThis.fetch>(async () => {
  throw new Error("Unexpected Stripe provider call");
});

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
    excludedFromShift: false,
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
    name,
    submissionPattern: { kind: "dateOnly" },
    regularClosedDays: [],
    isDeleted: false,
  });
}

async function seedTrialPro(ctx: MutationCtx, subject: string, trialEndsAt: number) {
  const seeded = await seedOrganizationManagerShop(ctx, { subject, plan: "standard" });
  const billingState = await ctx.db
    .query("organizationBillingStates")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
    .unique();
  if (!billingState) throw new Error("billing state not found");
  await ctx.db.patch(billingState._id, {
    state: { kind: "trial", trialEndsAt, selectedPaidPlan: "pro" },
    updatedAt: Date.now(),
  });
  return { ...seeded, billingStateId: billingState._id };
}

async function seedComplimentaryAtLimits(ctx: MutationCtx, subject: string) {
  const seeded = await seedOrganizationManagerShop(ctx, {
    subject,

    complimentary: true,
  });

  for (let index = 1; index <= 4; index += 1) {
    await addManager(ctx, seeded.organizationId, `${subject}_manager_${index}`);
    await addShop(ctx, seeded.organizationId, `${subject} 第${index + 1}店舗`);
  }
  const staffPeople = [];
  for (let index = 1; index <= 45; index += 1) {
    staffPeople.push(await addStaffPerson(ctx, seeded.organizationId, seeded.shopId, `${subject}_staff_${index}`));
  }
  return { ...seeded, staffPeople };
}

type PaidStripeContext = Awaited<ReturnType<typeof seedPaidStripeContext>>;

async function seedPaidStripeContext(
  t: TestConvex<typeof schema>,
  args: { subject: string; plan: "standard" | "pro"; periodEndsAt?: number },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject: args.subject,

      plan: args.plan,
    });
    const stripeCustomerId = `cus_${args.subject}`;
    const stripeSubscriptionId = `sub_${args.subject}`;
    const stripeSubscriptionItemId = `si_${args.subject}`;
    const stripeSubscriptionScheduleId = `sub_sched_${args.subject}`;
    const periodStartsAt = SCENARIO_NOW - 10 * 24 * 60 * 60_000;
    const periodEndsAt = args.periodEndsAt ?? SCENARIO_NOW + 20 * 24 * 60 * 60_000;
    const stripePriceId = priceIdForPlan(args.plan);
    await ctx.db.insert("organizationStripeCustomers", {
      organizationId: seeded.organizationId,
      stripeCustomerId,
      livemode: false,
      createdAt: SCENARIO_NOW,
      updatedAt: SCENARIO_NOW,
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
      billingCycleAnchor: periodStartsAt,
      cancelAtPeriodEnd: false,
      latestInvoiceId: `in_${args.subject}`,
      syncedAt: SCENARIO_NOW,
      createdAt: SCENARIO_NOW,
      updatedAt: SCENARIO_NOW,
    });
    return {
      ...seeded,
      stripeCustomerId,
      stripeSubscriptionId,
      stripeSubscriptionItemId,
      stripeSubscriptionScheduleId,
      periodStartsAt,
      periodEndsAt,
      billingCycleAnchor: periodStartsAt,
    };
  });
}

function priceIdForPlan(plan: "standard" | "pro") {
  return plan === "pro" ? PRO_PRICE_ID : STANDARD_PRICE_ID;
}

type TestBillingCadence = {
  interval: "day" | "week" | "month" | "year";
  interval_count: number;
};

function priceFixture(
  plan: "standard" | "pro",
  recurring: TestBillingCadence = { interval: "month", interval_count: 1 },
) {
  const id = priceIdForPlan(plan);
  return {
    id,
    active: true,
    livemode: false,
    currency: "jpy",
    unit_amount: plan === "pro" ? 2_980 : 1_480,
    tax_behavior: "inclusive",
    recurring,
  };
}

function subscriptionFixture(
  ids: Pick<
    PaidStripeContext,
    | "organizationId"
    | "stripeCustomerId"
    | "stripeSubscriptionId"
    | "stripeSubscriptionItemId"
    | "periodStartsAt"
    | "periodEndsAt"
    | "billingCycleAnchor"
  >,
  args: {
    plan: "standard" | "pro";
    status?: "incomplete" | "active" | "past_due" | "canceled";
    invoiceStatus?: "paid" | "open" | "void";
    operationId?: Id<"organizationStripeOperations">;
    pendingUpdate?: boolean;
    cancelAtPeriodEnd?: boolean;
    scheduleId?: string;
    periodStartsAt?: number;
    periodEndsAt?: number;
    invoiceEffectiveAt?: number;
    priceRecurring?: TestBillingCadence;
  },
) {
  const status = args.status ?? "active";
  const invoiceStatus = args.invoiceStatus ?? "paid";
  const priceId = priceIdForPlan(args.plan);
  const invoiceId = `in_${ids.stripeSubscriptionId}_${args.plan}_${invoiceStatus}`;
  const periodStartsAt = args.periodStartsAt ?? ids.periodStartsAt;
  const periodEndsAt = args.periodEndsAt ?? ids.periodEndsAt;
  const invoiceEffectiveAt = args.invoiceEffectiveAt ?? SCENARIO_NOW;
  return {
    id: ids.stripeSubscriptionId,
    customer: ids.stripeCustomerId,
    livemode: false,
    status,
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: priceId,
      ...(args.operationId ? { shiftori_operation_id: String(args.operationId) } : {}),
    },
    billing_cycle_anchor: Math.floor(ids.billingCycleAnchor / 1000),
    trial_end: null,
    cancel_at_period_end: args.cancelAtPeriodEnd ?? false,
    schedule: args.scheduleId ?? null,
    pending_update: args.pendingUpdate ? { expires_at: Math.floor((SCENARIO_NOW + 60_000) / 1000) } : null,
    ...(status === "canceled"
      ? { canceled_at: Math.floor(periodEndsAt / 1000), ended_at: Math.floor(periodEndsAt / 1000) }
      : {}),
    latest_invoice: {
      id: invoiceId,
      customer: ids.stripeCustomerId,
      livemode: false,
      status: invoiceStatus,
      currency: "jpy",
      amount_paid: invoiceStatus === "paid" ? (args.plan === "pro" ? 2_980 : 1_480) : 0,
      amount_remaining: invoiceStatus === "open" ? 1_500 : 0,
      created: Math.floor(SCENARIO_NOW / 1000),
      billing_reason: "subscription_cycle",
      period_start: Math.floor(invoiceEffectiveAt / 1000),
      period_end: Math.floor((invoiceEffectiveAt + 30 * 24 * 60 * 60_000) / 1000),
      status_transitions: { finalized_at: Math.floor(SCENARIO_NOW / 1000) },
      parent: { subscription_details: { subscription: ids.stripeSubscriptionId } },
      lines: {
        has_more: false,
        data: [
          {
            pricing: { price_details: { price: priceId } },
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
          current_period_start: Math.floor(periodStartsAt / 1000),
          current_period_end: Math.floor(periodEndsAt / 1000),
          price: priceFixture(args.plan, args.priceRecurring),
        },
      ],
    },
  };
}

function checkoutSessionFixture(
  ids: {
    organizationId: Id<"organizations">;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  },
  operationId: Id<"organizationStripeOperations">,
  args: { sessionId: string; plan: "standard" | "pro" },
) {
  return {
    id: args.sessionId,
    url: `https://checkout.stripe.test/${args.sessionId}`,
    customer: ids.stripeCustomerId,
    subscription: ids.stripeSubscriptionId,
    livemode: false,
    mode: "subscription",
    status: "complete",
    client_reference_id: String(ids.organizationId),
    metadata: {
      shiftori_organization_id: String(ids.organizationId),
      shiftori_operation_id: String(operationId),
      shiftori_provider_generation: "1",
      shiftori_price_id: priceIdForPlan(args.plan),
    },
  };
}

function scheduleFixture(
  ids: PaidStripeContext,
  args: {
    status: "not_started" | "active" | "released";
    phases?: unknown[];
    operationId?: Id<"organizationStripeOperations"> | string;
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
      shiftori_price_id: STANDARD_PRICE_ID,
    },
    current_phase: { start_date: Math.floor(ids.periodStartsAt / 1000) },
    phases: args.phases ?? [],
  };
}

async function getBillingSnapshot(t: TestConvex<typeof schema>, organizationId: Id<"organizations">) {
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
    receipts: await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .collect(),
  }));
}

async function receiveWebhook(
  t: TestConvex<typeof schema>,
  args: {
    stripeEventId: string;
    type: StripeWebhookEventType;
    objectId: string;
    objectCustomerId: string;
    eventCreatedAt: number;
  },
) {
  return await t.mutation(internal.organizationStripe.mutations.receiveWebhookEvent, {
    ...args,
    apiVersion: STRIPE_WEBHOOK_API_VERSION,
    livemode: false,
    expectedLivemode: false,
  });
}

async function finishZeroDelayJobs(t: TestConvex<typeof schema>) {
  await vi.advanceTimersByTimeAsync(1);
  await t.finishInProgressScheduledFunctions();
}

function providerResponse(value: unknown) {
  return value as Response;
}

function installProToStandardProvider(
  ids: PaidStripeContext,
  options: { failFirstScheduleCreate?: boolean; priceRecurring?: TestBillingCadence } = {},
) {
  let mode: "pro" | "standardPaid" = "pro";
  let scheduled = false;
  let released = false;
  let scheduledMetadata: Record<string, string> | undefined;
  let scheduledPhases: unknown[] = [];
  let scheduleCreateAttempts = 0;
  const scheduleCreateCalls: unknown[][] = [];
  let scheduleReleaseAttempts = 0;

  const currentSubscription = () => {
    if (mode === "pro") {
      return subscriptionFixture(ids, {
        plan: "pro",
        ...(options.priceRecurring ? { priceRecurring: options.priceRecurring } : {}),
        ...(scheduled && !released ? { scheduleId: ids.stripeSubscriptionScheduleId } : {}),
      });
    }
    return subscriptionFixture(ids, {
      plan: "standard",
      status: "active",
      invoiceStatus: "paid",
      ...(scheduled && !released ? { scheduleId: ids.stripeSubscriptionScheduleId } : {}),
      periodStartsAt: ids.periodEndsAt,
      periodEndsAt: ids.periodEndsAt + 30 * 24 * 60 * 60_000,
      invoiceEffectiveAt: ids.periodEndsAt,
      ...(options.priceRecurring ? { priceRecurring: options.priceRecurring } : {}),
    });
  };

  stripeProviderMock.mockImplementation(async (input, init) => {
    const resource = String(input).split("/").pop() ?? "";
    const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
    if (resource === "prices.retrieve") return providerResponse(priceFixture("standard", options.priceRecurring));
    if (resource === "subscriptions.retrieve") return providerResponse(currentSubscription());
    if (resource === "invoices.retrieve") return providerResponse(currentSubscription().latest_invoice);
    if (resource === "subscriptionSchedules.create") {
      scheduleCreateAttempts += 1;
      scheduleCreateCalls.push(args);
      if (options.failFirstScheduleCreate && scheduleCreateAttempts === 1) {
        throw new MockStripeError(400);
      }
      return providerResponse({
        ...scheduleFixture(ids, { status: "not_started" }),
        metadata: {},
      });
    }
    if (resource === "subscriptionSchedules.update") {
      scheduledMetadata = (args[1] as { metadata: Record<string, string> }).metadata;
      scheduledPhases = (args[1] as { phases: unknown[] }).phases;
      scheduled = true;
      return providerResponse({
        ...scheduleFixture(ids, { status: "active", phases: scheduledPhases }),
        metadata: scheduledMetadata,
      });
    }
    if (resource === "subscriptionSchedules.retrieve") {
      return providerResponse({
        ...scheduleFixture(ids, { status: released ? "released" : "active", phases: scheduledPhases }),
        metadata: scheduledMetadata,
      });
    }
    if (resource === "subscriptionSchedules.release") {
      scheduleReleaseAttempts += 1;
      released = true;
      return providerResponse({
        ...scheduleFixture(ids, { status: "released", phases: scheduledPhases }),
        metadata: scheduledMetadata,
      });
    }
    if (resource === "events.retrieve") {
      const eventId = String(args[0]);
      return providerResponse({
        id: eventId,
        type: "invoice.paid",
        livemode: false,
        api_version: STRIPE_WEBHOOK_API_VERSION,
        created: Math.floor(Date.now() / 1000),
        data: { object: { id: currentSubscription().latest_invoice.id } },
      });
    }
    throw new Error(`Unexpected Stripe provider call: ${resource}`);
  });

  return {
    setMode(next: "pro" | "standardPaid") {
      mode = next;
    },
    get scheduleCreateAttempts() {
      return scheduleCreateAttempts;
    },
    get scheduleCreateCalls() {
      return scheduleCreateCalls;
    },
    get scheduleReleaseAttempts() {
      return scheduleReleaseAttempts;
    },
    get scheduledPhases() {
      return scheduledPhases;
    },
  };
}

describe("有料プラン変更シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(SCENARIO_NOW);
    stripeConfigurationMock.mockReset();
    stripeConfigurationMock.mockReturnValue(READY_STRIPE_CONFIGURATION);
    stripeProviderMock.mockReset();
    stripeProviderMock.mockImplementation(async () => {
      throw new Error("Unexpected Stripe provider call");
    });
    vi.stubGlobal("fetch", stripeProviderMock);
    vi.stubEnv("STRIPE_SECRET_KEY", READY_STRIPE_CONFIGURATION.secretKey);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", READY_STRIPE_CONFIGURATION.webhookSecret);
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", STANDARD_PRICE_ID);
    vi.stubEnv("STRIPE_PRO_PRICE_ID", PRO_PRICE_ID);
    vi.stubEnv("APP_URL", "https://app.example.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(FREE_PAID_CHECKOUT_CASES)(
    "Freeから$targetPlanを開始し、公開Checkoutと支払い確認後に$targetPlanへ収束する",
    async ({ targetPlan, peopleMax, duplicateWebhook }) => {
      const t = convexTest(schema, modules);
      const subject = `scenario_free_to_${targetPlan}`;
      const seeded = await t.run((ctx) => seedOrganizationManagerShop(ctx, { subject, plan: "free" }));
      const providerIds = {
        ...seeded,
        stripeCustomerId: `cus_${subject}`,
        stripeSubscriptionId: `sub_${subject}`,
        stripeSubscriptionItemId: `si_${subject}`,
        periodStartsAt: SCENARIO_NOW,
        periodEndsAt: SCENARIO_NOW + 30 * 24 * 60 * 60_000,
        billingCycleAnchor: SCENARIO_NOW,
      };
      const checkoutSessionId = `cs_${subject}`;
      const stripeEventId = `evt_${subject}_paid`;
      const invoiceId = `in_${providerIds.stripeSubscriptionId}_${targetPlan}_paid`;
      const requestedPriceIds: string[] = [];
      let operationId: Id<"organizationStripeOperations"> | undefined;
      stripeProviderMock.mockImplementation(async (input, init) => {
        const resource = String(input).split("/").pop() ?? "";
        const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
        if (resource === "prices.retrieve") {
          const priceId = String(args[0]);
          requestedPriceIds.push(priceId);
          return providerResponse(priceFixture(priceId === PRO_PRICE_ID ? "pro" : "standard"));
        }
        if (resource === "customers.create") {
          return providerResponse({ id: providerIds.stripeCustomerId, livemode: false });
        }
        if (resource === "checkout.sessions.create") {
          return providerResponse({
            id: checkoutSessionId,
            url: `https://checkout.stripe.test/free-to-${targetPlan}`,
            livemode: false,
          });
        }
        if (resource === "events.retrieve") {
          return providerResponse({
            id: stripeEventId,
            type: "invoice.paid",
            livemode: false,
            api_version: STRIPE_WEBHOOK_API_VERSION,
            created: Math.floor(SCENARIO_NOW / 1000),
            data: { object: { id: invoiceId } },
          });
        }
        if (resource === "invoices.retrieve") {
          return providerResponse(subscriptionFixture(providerIds, { plan: targetPlan, operationId }).latest_invoice);
        }
        if (resource === "subscriptions.retrieve") {
          return providerResponse(subscriptionFixture(providerIds, { plan: targetPlan, operationId }));
        }
        if (resource === "checkout.sessions.retrieve") {
          if (!operationId) throw new Error("checkout operation was not persisted");
          return providerResponse(
            checkoutSessionFixture(providerIds, operationId, { sessionId: checkoutSessionId, plan: targetPlan }),
          );
        }
        throw new Error(`Unexpected Stripe provider call: ${resource}`);
      });
      const actor = t.withIdentity({ subject });

      await expect(
        actor.action(api.organizationStripe.actions.startPaidCheckoutForOrganization, {
          organizationId: seeded.organizationId,

          targetPlan,
          requestId: `scenario-free-to-${targetPlan}-checkout`,
        }),
      ).resolves.toEqual({ status: "available", url: `https://checkout.stripe.test/free-to-${targetPlan}` });
      expect(requestedPriceIds).toEqual(targetPlan === "pro" ? [PRO_PRICE_ID, STANDARD_PRICE_ID] : [STANDARD_PRICE_ID]);
      const pendingSettings = await actor.query(api.organization.queries.getSettings, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
      });
      expect(pendingSettings?.billing).toMatchObject({
        state: "pendingActivation",
        currentPlan: "free",
        targetPlan,
        peopleUsage: { current: 1, max: 5, pendingInvitations: 0 },
      });
      operationId = await t.run(async (ctx) => {
        const operations = await ctx.db
          .query("organizationStripeOperations")
          .withIndex("by_organizationId_and_kind_and_status", (q) =>
            q.eq("organizationId", seeded.organizationId).eq("kind", "immediatePaidCheckout"),
          )
          .collect();
        expect(operations).toHaveLength(1);
        return operations[0]._id;
      });

      const receiptArgs = {
        stripeEventId,
        type: "invoice.paid" as const,
        objectId: invoiceId,
        objectCustomerId: providerIds.stripeCustomerId,
        eventCreatedAt: SCENARIO_NOW,
      };
      await expect(receiveWebhook(t, receiptArgs)).resolves.toEqual({ created: true, processable: true });
      if (duplicateWebhook) {
        await expect(receiveWebhook(t, receiptArgs)).resolves.toEqual({ created: false, processable: true });
      }
      await finishZeroDelayJobs(t);

      const activeSettings = await actor.query(api.organization.queries.getSettings, {
        expectedOrganizationId: await getTestOrganizationId(t, seeded.shopId),
        shopId: seeded.shopId,
      });
      expect(activeSettings?.billing).toMatchObject({
        state: targetPlan,
        currentPlan: targetPlan,
        peopleUsage: { current: 1, max: peopleMax, pendingInvitations: 0 },
        shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
        managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
      });
      const snapshot = await getBillingSnapshot(t, seeded.organizationId);
      expect(snapshot.billing?.state).toEqual({ kind: "active", plan: targetPlan });
      expect(snapshot.subscription).toMatchObject({
        stripeSubscriptionId: providerIds.stripeSubscriptionId,
        stripePriceId: priceIdForPlan(targetPlan),
        plan: targetPlan,
        providerGeneration: 1,
      });
      expect(snapshot.receipts).toHaveLength(1);
      expect(snapshot.receipts[0]).toMatchObject({ stripeEventId, status: "processed", attemptCount: 1 });
    },
  );

  it("StandardからProはpending中のPrice rotation後もpaidで収束し、古い失敗Eventでは戻らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "scenario_standard_to_pro", plan: "standard" });
    const paidEventId = "evt_scenario_standard_to_pro_paid";
    const staleFailedEventId = "evt_scenario_standard_to_pro_stale_failed";
    const proSubscription = () => subscriptionFixture(ids, { plan: "pro" });
    const proInvoiceId = `in_${ids.stripeSubscriptionId}_pro_paid`;
    let providerPhase: "change" | "paid" = "change";
    stripeProviderMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixture("pro"));
      if (resource === "invoices.createPreview") {
        return providerResponse({
          id: "in_preview_standard_to_pro",
          livemode: false,
          currency: "jpy",
          amount_due: 1_500,
        });
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          providerPhase === "change" ? subscriptionFixture(ids, { plan: "standard" }) : proSubscription(),
        );
      }
      if (resource === "subscriptions.update") {
        return providerResponse(
          subscriptionFixture(ids, { plan: "standard", invoiceStatus: "open", pendingUpdate: true }),
        );
      }
      if (resource === "events.retrieve") {
        const eventId = String(args[0]);
        const isPaid = eventId === paidEventId;
        return providerResponse({
          id: eventId,
          type: isPaid ? "invoice.paid" : "invoice.payment_failed",
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor((isPaid ? SCENARIO_NOW : SCENARIO_NOW - 60_000) / 1000),
          data: { object: { id: proInvoiceId } },
        });
      }
      if (resource === "invoices.retrieve") return providerResponse(proSubscription().latest_invoice);
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "scenario_standard_to_pro" });
    const requestId = "scenario-standard-to-pro-change";

    const preview = await actor.action(api.organizationStripe.actions.previewPaidPlanChangeForOrganization, {
      organizationId: ids.organizationId,

      targetPlan: "pro",
      requestId,
    });
    expect(preview).toMatchObject({ status: "available", amountDue: 1_500, currency: "jpy" });
    if (preview.status !== "available") throw new Error("paid plan preview unavailable");

    await expect(
      actor.action(api.organizationStripe.actions.changePaidPlanNowForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "pro",
        requestId,
        prorationDate: preview.prorationDate,
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pendingActivation",
      currentPlan: "standard",
      targetPlan: "pro",
      peopleUsage: { current: 1, max: 25, pendingInvitations: 0 },
    });

    stripeConfigurationMock.mockReturnValue({
      ...READY_STRIPE_CONFIGURATION,
      proPriceId: "price_scenario_pro_after_pending_rotation",
    });
    providerPhase = "paid";
    await receiveWebhook(t, {
      stripeEventId: paidEventId,
      type: "invoice.paid",
      objectId: proInvoiceId,
      objectCustomerId: ids.stripeCustomerId,
      eventCreatedAt: SCENARIO_NOW,
    });
    await finishZeroDelayJobs(t);
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
    });

    await receiveWebhook(t, {
      stripeEventId: staleFailedEventId,
      type: "invoice.payment_failed",
      objectId: proInvoiceId,
      objectCustomerId: ids.stripeCustomerId,
      eventCreatedAt: SCENARIO_NOW - 60_000,
    });
    await finishZeroDelayJobs(t);
    const result = await t.run(async (ctx) => ({
      billing: await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique(),
      receipts: await Promise.all(
        [paidEventId, staleFailedEventId].map((eventId) =>
          ctx.db
            .query("stripeWebhookEvents")
            .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", eventId))
            .unique(),
        ),
      ),
    }));
    expect(result.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(result.receipts.map((receipt) => [receipt?.stripeEventId, receipt?.status])).toEqual([
      [paidEventId, "processed"],
      [staleFailedEventId, "processed"],
    ]);
  });

  it("Standardの解約は公開Actionで期間末に予約し、deadline jobとprovider解約確認後にFreeになる", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, {
      subject: "scenario_standard_to_free",
      plan: "standard",
      periodEndsAt: SCENARIO_NOW + 2 * 24 * 60 * 60_000,
    });
    let atDeadline = false;
    stripeProviderMock.mockImplementation(async (input) => {
      const resource = String(input).split("/").pop() ?? "";
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          subscriptionFixture(ids, {
            plan: "standard",
            status: atDeadline ? "canceled" : "active",
            cancelAtPeriodEnd: atDeadline,
          }),
        );
      }
      if (resource === "subscriptions.update") {
        return providerResponse(subscriptionFixture(ids, { plan: "standard", cancelAtPeriodEnd: true }));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "scenario_standard_to_free" });

    await expect(
      actor.action(api.organizationStripe.actions.scheduleServiceStopAtPeriodEndForOrganization, {
        organizationId: ids.organizationId,
        requestId: "scenario-standard-service-stop-schedule",
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "scheduledChange",
      currentPlan: "standard",
      targetPlan: "free",
      restrictAtPeriodEnd: true,
    });

    atDeadline = true;
    await vi.advanceTimersByTimeAsync(ids.periodEndsAt - SCENARIO_NOW);
    await t.finishInProgressScheduledFunctions();
    await finishZeroDelayJobs(t);

    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "free",
      currentPlan: "free",
      peopleUsage: { current: 1, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 2, pendingInvitations: 0 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
    });
    const snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.billing?.state).toEqual({ kind: "active", plan: "free" });
    expect(snapshot.subscription).toMatchObject({ status: "canceled" });
    expect(snapshot.subscription?.terminalAt).toBeGreaterThanOrEqual(ids.periodEndsAt);
    expect(
      snapshot.operations
        .map((operation) => [operation.kind, operation.status, operation.restrictAtPeriodEnd] as const)
        .sort(),
    ).toEqual([
      ["reconcileSubscription", "succeeded", undefined],
      ["scheduleFree", "succeeded", true],
    ]);
  });

  it("ProからStandardは公開ActionでStripe Scheduleを作り、期間末jobがproviderのStandard支払いを確認して確定する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, {
      subject: "scenario_pro_to_standard",
      plan: "pro",
      periodEndsAt: SCENARIO_NOW + 2 * 24 * 60 * 60_000,
    });
    let atDeadline = false;
    let scheduledMetadata: Record<string, string> | undefined;
    let scheduledPhases: unknown[] = [];
    stripeProviderMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixture("standard"));
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          atDeadline
            ? subscriptionFixture(ids, {
                plan: "standard",
                periodStartsAt: ids.periodEndsAt,
                periodEndsAt: ids.periodEndsAt + 30 * 24 * 60 * 60_000,
                invoiceEffectiveAt: ids.periodEndsAt,
              })
            : subscriptionFixture(ids, { plan: "pro" }),
        );
      }
      if (resource === "invoices.retrieve") {
        return providerResponse(
          subscriptionFixture(ids, {
            plan: "standard",
            periodStartsAt: ids.periodEndsAt,
            periodEndsAt: ids.periodEndsAt + 30 * 24 * 60 * 60_000,
            invoiceEffectiveAt: ids.periodEndsAt,
          }).latest_invoice,
        );
      }
      if (resource === "subscriptionSchedules.create") {
        return providerResponse({
          ...scheduleFixture(ids, { status: "not_started" }),
          metadata: {},
        });
      }
      if (resource === "subscriptionSchedules.update") {
        scheduledMetadata = (args[1] as { metadata: Record<string, string> }).metadata;
        scheduledPhases = (args[1] as { phases: unknown[] }).phases;
        return providerResponse({
          ...scheduleFixture(ids, { status: "active", phases: scheduledPhases }),
          metadata: scheduledMetadata,
        });
      }
      if (resource === "subscriptionSchedules.retrieve") {
        return providerResponse({
          ...scheduleFixture(ids, { status: "active", phases: scheduledPhases }),
          metadata: scheduledMetadata,
        });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "scenario_pro_to_standard" });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChangeForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "standard",
        requestId: "scenario-pro-to-standard-schedule",
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "standard",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
    });

    atDeadline = true;
    await vi.advanceTimersByTimeAsync(ids.periodEndsAt - SCENARIO_NOW);
    await t.finishInProgressScheduledFunctions();
    await finishZeroDelayJobs(t);

    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "standard",
      currentPlan: "standard",
      peopleUsage: { current: 1, max: 25, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });
    const snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.billing?.state).toEqual({ kind: "active", plan: "standard" });
    expect(snapshot.subscription).toMatchObject({ plan: "standard", stripePriceId: STANDARD_PRICE_ID });
    expect(snapshot.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(snapshot.operations.map((operation) => [operation.kind, operation.status]).sort()).toEqual([
      ["reconcileSubscription", "succeeded"],
      ["schedulePaidPlanChange", "succeeded"],
    ]);
  });

  it("TrialはPro相当で、初回支払い確認中はFreeとし、支払い成功後にProになる", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedTrialPro(ctx, "trial_pro_paid", SCENARIO_NOW));
    const actor = t.withIdentity({ subject: "trial_pro_paid" });

    const trialSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(trialSettings?.billing).toMatchObject({
      state: "trial",
      currentPlan: "trial",
      targetPlan: "pro",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.processDeadline, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        expectedDeadlineAt: SCENARIO_NOW,
      }),
    ).resolves.toEqual({ changed: true, stateKind: "initialPaymentPending" });

    const pendingSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(pendingSettings?.billing).toMatchObject({
      state: "initialPaymentPending",
      currentPlan: "free",
      targetPlan: "pro",
      peopleUsage: { current: 1, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 2, pendingInvitations: 0 },
    });

    await expect(
      t.mutation(internal.organizationBilling.mutations.applyTrialInitialInvoiceResult, {
        organizationId: ids.organizationId,
        expectedVersion: 1,
        trialEndsAt: SCENARIO_NOW,
        result: "paid",
        correlationId: "trial-pro-first-invoice-paid",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "pro" });

    const activeSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(activeSettings?.billing).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 5, pendingInvitations: 0 },
    });

    const billingState = await t.run((ctx) => ctx.db.get(ids.billingStateId));
    expect(billingState?.state).toEqual({ kind: "active", plan: "pro" });
  });

  it("TrialからProの初回支払い失敗は即時Free権限を適用し、Stripe終了後も後着の成功でProへ戻さない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "trial_pro_failed", plan: "pro" });
    const billingStateId = await t.run(async (ctx) => {
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: { kind: "trial", trialEndsAt: SCENARIO_NOW, selectedPaidPlan: "pro" },
        updatedAt: SCENARIO_NOW,
      });
      return billingState._id;
    });
    const actor = t.withIdentity({ subject: "trial_pro_failed" });
    const pastDueSubscription = subscriptionFixture(ids, {
      plan: "pro",
      status: "past_due",
      invoiceStatus: "open",
    });
    const openInvoice = { ...pastDueSubscription.latest_invoice, auto_advance: true };
    const draftInvoice = {
      ...openInvoice,
      id: `${openInvoice.id}_draft`,
      status: "draft",
      amount_remaining: 0,
    };
    const stoppedInvoiceIds: string[] = [];
    stripeProviderMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const providerArgs = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "subscriptions.retrieve") return providerResponse(pastDueSubscription);
      if (resource === "subscriptions.cancel") {
        return providerResponse({
          ...pastDueSubscription,
          status: "canceled",
          canceled_at: Math.floor(SCENARIO_NOW / 1000),
          ended_at: Math.floor(SCENARIO_NOW / 1000),
        });
      }
      if (resource === "invoices.list") {
        const status = (providerArgs[0] as { status?: string }).status;
        return providerResponse({ data: status === "open" ? [openInvoice] : [draftInvoice], has_more: false });
      }
      if (resource === "invoices.update") {
        const invoiceId = String(providerArgs[0]);
        const invoice = [openInvoice, draftInvoice].find((candidate) => candidate.id === invoiceId);
        if (!invoice) throw new Error(`Unexpected invoice update: ${invoiceId}`);
        stoppedInvoiceIds.push(invoiceId);
        return providerResponse({ ...invoice, auto_advance: false });
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });

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
        correlationId: "trial-pro-first-invoice-failed",
      }),
    ).resolves.toEqual({ changed: true, stateKind: "paymentTerminationPending" });

    const failedSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(failedSettings?.billing).toMatchObject({
      state: "free",
      currentPlan: "free",
      paymentFailure: { terminationPending: true },
      peopleUsage: { current: 1, max: 5, pendingInvitations: 0 },
      shopUsage: { current: 1, max: 1, pendingInvitations: 0 },
      managerUsage: { current: 1, max: 2, pendingInvitations: 0 },
    });
    const failedState = await t.run((ctx) => ctx.db.get(billingStateId));
    expect(failedState).toMatchObject({
      state: {
        kind: "paymentTerminationPending",
        previousPlan: "trial",
        startedAt: SCENARIO_NOW,
      },
      lastPlanChange: {
        reason: "paymentFailed",
        previousPlan: "trial",
        occurredAt: SCENARIO_NOW,
      },
      version: 3,
    });

    await finishZeroDelayJobs(t);

    const completedSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(completedSettings?.billing).toMatchObject({
      state: "free",
      currentPlan: "free",
      paymentFailure: { terminationPending: false },
    });
    const completedSnapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(completedSnapshot.billing).toMatchObject({
      state: { kind: "active", plan: "free" },
      lastPlanChange: { reason: "paymentFailed", previousPlan: "trial", occurredAt: SCENARIO_NOW },
      version: 4,
    });
    expect(completedSnapshot.subscription).toMatchObject({ status: "canceled", terminalAt: expect.any(Number) });
    expect(completedSnapshot.operations.map((operation) => [operation.kind, operation.status])).toEqual([
      ["cancelSubscription", "succeeded"],
      ["stopInvoiceCollection", "succeeded"],
    ]);
    expect(stoppedInvoiceIds.sort()).toEqual([draftInvoice.id, openInvoice.id].sort());

    await expect(
      t.mutation(internal.organizationBilling.mutations.setStateFromVerifiedBilling, {
        organizationId: ids.organizationId,
        expectedVersion: 3,
        state: { kind: "active", plan: "pro" },
        correlationId: "trial-pro-late-paid",
      }),
    ).resolves.toEqual({ changed: false });
    expect(await t.run((ctx) => ctx.db.get(billingStateId))).toEqual(completedSnapshot.billing);
  });

  it("StandardからProのprovider一時失敗は同じoperationを30秒後に再開し、同じ冪等キーでProへ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "standard_pro_provider_retry", plan: "standard" });
    const updateIdempotencyKeys: string[] = [];
    let updateAttempts = 0;
    stripeProviderMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixture("pro"));
      if (resource === "invoices.createPreview") {
        return providerResponse({
          id: "in_preview_provider_retry",
          livemode: false,
          currency: "jpy",
          amount_due: 1_500,
        });
      }
      if (resource === "subscriptions.retrieve")
        return providerResponse(subscriptionFixture(ids, { plan: "standard" }));
      if (resource === "subscriptions.update") {
        updateAttempts += 1;
        updateIdempotencyKeys.push((args[2] as { idempotencyKey: string }).idempotencyKey);
        if (updateAttempts === 1) throw new MockStripeError(500);
        return providerResponse(subscriptionFixture(ids, { plan: "pro" }));
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "standard_pro_provider_retry" });
    const requestId = "standard-pro-provider-retry";
    const preview = await actor.action(api.organizationStripe.actions.previewPaidPlanChangeForOrganization, {
      organizationId: ids.organizationId,

      targetPlan: "pro",
      requestId,
    });
    expect(preview).toMatchObject({ status: "available", amountDue: 1_500, currency: "jpy" });
    if (preview.status !== "available") throw new Error("paid plan preview unavailable");

    await expect(
      actor.action(api.organizationStripe.actions.changePaidPlanNowForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "pro",
        requestId,
        prorationDate: preview.prorationDate,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pendingActivation",
      currentPlan: "standard",
      targetPlan: "pro",
    });
    let snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.operations).toHaveLength(2);
    expect(snapshot.operations.find((operation) => operation.kind === "changePaidPlanNow")).toMatchObject({
      kind: "changePaidPlanNow",
      status: "retrying",
      attemptCount: 1,
      nextRunAt: SCENARIO_NOW + 30_000,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await t.finishInProgressScheduledFunctions();

    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
    });
    snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.subscription).toMatchObject({ plan: "pro", stripePriceId: PRO_PRICE_ID });
    expect(snapshot.operations.find((operation) => operation.kind === "changePaidPlanNow")).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
    });
    expect(updateIdempotencyKeys).toHaveLength(2);
    expect(new Set(updateIdempotencyKeys).size).toBe(1);
  });

  it("StandardからProの追加認証待ちはStandardを維持し、pending update期限切れreceipt処理後にactive Standardへ戻る", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "standard_pro_pending_expiry", plan: "standard" });
    const actionRequiredEventId = "evt_standard_pro_action_required";
    const expiredEventId = "evt_standard_pro_pending_expired";
    const openSubscription = () =>
      subscriptionFixture(ids, { plan: "standard", status: "incomplete", invoiceStatus: "open", pendingUpdate: true });
    let phase: "apply" | "actionRequired" | "expired" = "apply";
    stripeProviderMock.mockImplementation(async (input, init) => {
      const resource = String(input).split("/").pop() ?? "";
      const args = JSON.parse(String(init?.body ?? "[]")) as unknown[];
      if (resource === "prices.retrieve") return providerResponse(priceFixture("pro"));
      if (resource === "invoices.createPreview") {
        return providerResponse({
          id: "in_preview_pending_expiry",
          livemode: false,
          currency: "jpy",
          amount_due: 1_500,
        });
      }
      if (resource === "subscriptions.retrieve") {
        return providerResponse(
          phase === "actionRequired"
            ? openSubscription()
            : subscriptionFixture(ids, {
                plan: "standard",
                ...(phase === "expired" ? { invoiceStatus: "void" as const } : {}),
              }),
        );
      }
      if (resource === "subscriptions.update") return providerResponse(openSubscription());
      if (resource === "events.retrieve") {
        const eventId = String(args[0]);
        const type =
          eventId === expiredEventId
            ? "customer.subscription.pending_update_expired"
            : "invoice.payment_action_required";
        return providerResponse({
          id: eventId,
          type,
          livemode: false,
          api_version: STRIPE_WEBHOOK_API_VERSION,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: eventId === expiredEventId ? ids.stripeSubscriptionId : openSubscription().latest_invoice.id,
            },
          },
        });
      }
      if (resource === "invoices.retrieve") {
        return providerResponse(
          phase === "expired"
            ? subscriptionFixture(ids, { plan: "standard", invoiceStatus: "void" }).latest_invoice
            : openSubscription().latest_invoice,
        );
      }
      throw new Error(`Unexpected Stripe provider call: ${resource}`);
    });
    const actor = t.withIdentity({ subject: "standard_pro_pending_expiry" });
    const requestId = "standard-pro-pending-expiry";
    const preview = await actor.action(api.organizationStripe.actions.previewPaidPlanChangeForOrganization, {
      organizationId: ids.organizationId,

      targetPlan: "pro",
      requestId,
    });
    expect(preview).toMatchObject({ status: "available", amountDue: 1_500, currency: "jpy" });
    if (preview.status !== "available") throw new Error("paid plan preview unavailable");

    await expect(
      actor.action(api.organizationStripe.actions.changePaidPlanNowForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "pro",
        requestId,
        prorationDate: preview.prorationDate,
      }),
    ).resolves.toEqual({ status: "accepted" });

    phase = "actionRequired";
    await expect(
      receiveWebhook(t, {
        stripeEventId: actionRequiredEventId,
        type: "invoice.payment_action_required",
        objectId: openSubscription().latest_invoice.id,
        objectCustomerId: ids.stripeCustomerId,
        eventCreatedAt: SCENARIO_NOW,
      }),
    ).resolves.toEqual({ created: true, processable: true });
    await finishZeroDelayJobs(t);
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pendingActivation",
      currentPlan: "standard",
      targetPlan: "pro",
      peopleUsage: { current: 1, max: 25, pendingInvitations: 0 },
    });

    phase = "expired";
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(
      receiveWebhook(t, {
        stripeEventId: expiredEventId,
        type: "customer.subscription.pending_update_expired",
        objectId: ids.stripeSubscriptionId,
        objectCustomerId: ids.stripeCustomerId,
        eventCreatedAt: Math.floor(Date.now() / 1000) * 1000,
      }),
    ).resolves.toEqual({ created: true, processable: true });
    await finishZeroDelayJobs(t);

    const snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(
      snapshot.receipts
        .map((receipt) => ({
          stripeEventId: receipt.stripeEventId,
          status: receipt.status,
          attemptCount: receipt.attemptCount,
          lastErrorCode: receipt.lastErrorCode,
        }))
        .sort((left, right) => left.stripeEventId.localeCompare(right.stripeEventId)),
    ).toEqual(
      [
        {
          stripeEventId: actionRequiredEventId,
          status: "processed",
          attemptCount: 1,
          lastErrorCode: undefined,
        },
        {
          stripeEventId: expiredEventId,
          status: "processed",
          attemptCount: 1,
          lastErrorCode: undefined,
        },
      ].sort((left, right) => left.stripeEventId.localeCompare(right.stripeEventId)),
    );
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "standard",
      currentPlan: "standard",
      peopleUsage: { current: 1, max: 25, pendingInvitations: 0 },
    });
    expect(snapshot.billing?.state).toEqual({ kind: "active", plan: "standard" });
  });

  it("ProからStandardのSchedule作成がproviderに拒否されても30秒後に同じoperationから復旧する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "pro_standard_schedule_retry", plan: "pro" });
    const provider = installProToStandardProvider(ids, {
      failFirstScheduleCreate: true,
      priceRecurring: { interval: "day", interval_count: 2 },
    });
    const actor = t.withIdentity({ subject: "pro_standard_schedule_retry" });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChangeForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "standard",
        requestId: "pro-standard-schedule-provider-retry",
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "provider_unavailable" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pro",
      currentPlan: "pro",
    });
    let snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.operations).toHaveLength(1);
    expect(snapshot.operations[0]).toMatchObject({
      kind: "schedulePaidPlanChange",
      status: "retrying",
      nextRunAt: SCENARIO_NOW + 30_000,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    await t.finishInProgressScheduledFunctions();

    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "standard",
    });
    snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.subscription).toMatchObject({
      plan: "pro",
      stripeSubscriptionScheduleId: ids.stripeSubscriptionScheduleId,
    });
    expect(snapshot.operations[0]).toMatchObject({ status: "succeeded", attemptCount: 2 });
    expect(provider.scheduleCreateAttempts).toBe(2);
    expect(provider.scheduleCreateCalls).toEqual([
      [
        { from_subscription: ids.stripeSubscriptionId },
        {
          idempotencyKey: `shiftori:test:schedulePaidPlanChange:${ids.organizationId}:pro-standard-schedule-provider-retry:create`,
        },
      ],
      [
        { from_subscription: ids.stripeSubscriptionId },
        {
          idempotencyKey: `shiftori:test:schedulePaidPlanChange:${ids.organizationId}:pro-standard-schedule-provider-retry:create`,
        },
      ],
    ]);
    expect(provider.scheduledPhases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duration: { interval: "day", interval_count: 2 },
          items: [{ price: STANDARD_PRICE_ID, quantity: 1 }],
        }),
      ]),
    );
  });

  it("ProからStandardの公開Scheduleを公開取消Actionでreleaseし、Proを維持する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, { subject: "pro_standard_public_cancel", plan: "pro" });
    const provider = installProToStandardProvider(ids);
    const actor = t.withIdentity({ subject: "pro_standard_public_cancel" });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChangeForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "standard",
        requestId: "pro-standard-public-schedule",
      }),
    ).resolves.toEqual({ status: "accepted" });
    await expect(
      actor.action(api.organizationStripe.actions.cancelScheduledPlanChangeForOrganization, {
        organizationId: ids.organizationId,
        requestId: "pro-standard-public-cancel",
      }),
    ).resolves.toEqual({ status: "accepted" });

    await vi.advanceTimersByTimeAsync(ids.periodEndsAt - SCENARIO_NOW);
    await t.finishInProgressScheduledFunctions();
    await finishZeroDelayJobs(t);

    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      peopleUsage: { current: 1, max: 50, pendingInvitations: 0 },
    });
    const snapshot = await getBillingSnapshot(t, ids.organizationId);
    expect(snapshot.billing?.state).toEqual({ kind: "active", plan: "pro" });
    expect(snapshot.subscription).not.toHaveProperty("stripeSubscriptionScheduleId");
    expect(snapshot.operations.map((operation) => [operation.kind, operation.status]).sort()).toEqual([
      ["cancelScheduledPlanChange", "succeeded"],
      ["schedulePaidPlanChange", "succeeded"],
    ]);
    const deadlineJobs = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (job) =>
          job.name === "organizationBilling/mutations:processDeadline" &&
          job.args[0]?.organizationId === ids.organizationId &&
          job.args[0]?.expectedDeadlineAt === ids.periodEndsAt,
      ),
    );
    expect(deadlineJobs).toHaveLength(1);
    expect(deadlineJobs[0].state).toEqual({ kind: "success" });
    expect(provider.scheduleReleaseAttempts).toBe(1);
  });

  it("ProからStandardは期間末までProを維持し、26人ならStandard確定後に上限超過となり人物削除で自動解除する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedPaidStripeContext(t, {
      subject: "pro_standard_over_limit",
      plan: "pro",
      periodEndsAt: SCENARIO_NOW + 2 * 24 * 60 * 60_000,
    });
    const seeded = await t.run(async (ctx) => {
      const extraPeople = [];
      for (let index = 1; index <= 25; index += 1) {
        extraPeople.push(
          await addStaffPerson(ctx, ids.organizationId, ids.shopId, `pro_standard_over_limit_staff_${index}`),
        );
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", ids.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      return { billingStateId: billingState._id, removalTarget: extraPeople.at(-1) };
    });
    const removalTarget = seeded.removalTarget;
    if (!removalTarget) throw new Error("removal target not found");
    const provider = installProToStandardProvider(ids);
    const actor = t.withIdentity({ subject: "pro_standard_over_limit" });

    await expect(
      actor.action(api.organizationStripe.actions.schedulePaidPlanChangeForOrganization, {
        organizationId: ids.organizationId,

        targetPlan: "standard",
        requestId: "pro-standard-over-limit-schedule",
      }),
    ).resolves.toEqual({ status: "accepted" });
    expect(
      (
        await actor.query(api.organization.queries.getSettings, {
          expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
          shopId: ids.shopId,
        })
      )?.billing,
    ).toMatchObject({
      state: "scheduledChange",
      currentPlan: "pro",
      targetPlan: "standard",
      peopleUsage: { current: 26, max: 50, pendingInvitations: 0 },
    });

    provider.setMode("standardPaid");
    await vi.advanceTimersByTimeAsync(ids.periodEndsAt - SCENARIO_NOW);
    await t.finishInProgressScheduledFunctions();
    await finishZeroDelayJobs(t);

    const overLimitSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(overLimitSettings?.billing).toMatchObject({
      state: "standard",
      currentPlan: "standard",
      peopleUsage: { current: 26, max: 25, pendingInvitations: 0 },
      requiredReductions: { people: 1, shops: 0, managers: 0 },
      blockedReason: expect.stringContaining("上限"),
    });
    const overLimitState = await t.run((ctx) => ctx.db.get(seeded.billingStateId));
    expect(overLimitState?.state).toEqual({ kind: "active", plan: "standard" });
    await expect(
      actor.mutation(api.organization.mutations.updateOrganizationNameForOrganization, {
        organizationId: ids.organizationId,
        name: "上限超過中の更新",
        requestId: "pro-standard-over-limit-name",
      }),
    ).rejects.toMatchObject({ data: { code: "USAGE_LIMIT_EXCEEDED" } });

    await expect(
      actor.mutation(api.organization.mutations.removePersonFromOrganization, {
        expectedOrganizationId: ids.organizationId,
        shopId: ids.shopId,
        personId: removalTarget.personId,
        requestId: "pro-standard-remove-one-person",
      }),
    ).resolves.toEqual({ changed: true });
    await vi.advanceTimersByTimeAsync(1);
    await t.finishInProgressScheduledFunctions();

    const restoredSettings = await actor.query(api.organization.queries.getSettings, {
      expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
      shopId: ids.shopId,
    });
    expect(restoredSettings?.billing).toMatchObject({
      state: "standard",
      currentPlan: "standard",
      peopleUsage: { current: 25, max: 25, pendingInvitations: 0 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
    });
    expect(restoredSettings?.billing).not.toHaveProperty("blockedReason");
    const restored = await t.run(async (ctx) => ({
      billingState: await ctx.db.get(seeded.billingStateId),
      person: await ctx.db.get(removalTarget.personId),
      staff: await ctx.db.get(removalTarget.staffId),
    }));
    expect(restored.billingState?.state).toEqual({ kind: "active", plan: "standard" });
    expect(restored.person?.status).toBe("removed");
    expect(restored.staff?.isDeleted).toBe(true);
  });

  it("complimentary.proはPro上限を使い、Stripe行と課金通知を作らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) => seedComplimentaryAtLimits(ctx, "complimentary_pro"));

    const settings = await t
      .withIdentity({ subject: "complimentary_pro" })
      .query(api.organization.queries.getSettings, {
        expectedOrganizationId: await getTestOrganizationId(t, ids.shopId),
        shopId: ids.shopId,
      });
    expect(settings?.billing).toMatchObject({
      state: "pro",
      currentPlan: "pro",
      isComplimentary: true,
      peopleUsage: { current: 50, max: 50, pendingInvitations: 0 },
      shopUsage: { current: 5, max: 5, pendingInvitations: 0 },
      managerUsage: { current: 5, max: 5, pendingInvitations: 0 },
      requiredReductions: { people: 0, shops: 0, managers: 0 },
      canManagePlan: false,
      canUpdatePaymentMethod: false,
      canUpdateBillingEmail: false,
      canScheduleFree: false,
    });

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
