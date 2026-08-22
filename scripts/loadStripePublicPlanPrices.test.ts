import { describe, expect, it, vi } from "vitest";
import {
  loadStripePublicPlanPrices,
  type RetrievedStripePrice,
  StripePublicPriceLoadError,
  type StripePublicPriceLoadErrorCode,
} from "./loadStripePublicPlanPrices";

const testEnvironment = {
  STRIPE_PRICE_READ_KEY: "rk_test_public_prices_secret_value",
  STRIPE_PRO_PRICE_ID: "price_pro_private_identifier",
  STRIPE_BUSINESS_PRICE_ID: "price_business_private_identifier",
} as const;

function stripePrice(overrides: Partial<RetrievedStripePrice> = {}): RetrievedStripePrice {
  return {
    id: testEnvironment.STRIPE_PRO_PRICE_ID,
    active: true,
    livemode: false,
    type: "recurring",
    currency: "jpy",
    unit_amount: 3_000,
    billing_scheme: "per_unit",
    transform_quantity: null,
    tax_behavior: "inclusive",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    ...overrides,
  };
}

function retrieveValidPrices() {
  return vi.fn(async (priceId: string) =>
    priceId === testEnvironment.STRIPE_PRO_PRICE_ID
      ? stripePrice()
      : stripePrice({ id: testEnvironment.STRIPE_BUSINESS_PRICE_ID, unit_amount: 6_000 }),
  );
}

const invalidPriceCases = [
  ["price_id_mismatch", { id: "price_unexpected" }],
  ["livemode_mismatch", { livemode: true }],
  ["inactive_price", { active: false }],
  ["invalid_recurring_price", { type: "one_time", recurring: null }],
  ["unsupported_billing_model", { billing_scheme: "tiered" }],
  ["unsupported_billing_model", { transform_quantity: { divide_by: 10, round: "up" } }],
  ["unsupported_billing_model", { recurring: { interval: "month", interval_count: 1, usage_type: "metered" } }],
  ["invalid_unit_amount", { unit_amount: null }],
  ["invalid_unit_amount", { unit_amount: 0 }],
  ["invalid_unit_amount", { unit_amount: Number.MAX_SAFE_INTEGER + 1 }],
  ["invalid_currency", { currency: "" }],
  ["unspecified_tax_behavior", { tax_behavior: "unspecified" }],
  ["invalid_recurring_price", { recurring: { interval: "quarter", interval_count: 1, usage_type: "licensed" } }],
  ["invalid_recurring_price", { recurring: { interval: "month", interval_count: 0, usage_type: "licensed" } }],
] satisfies ReadonlyArray<readonly [StripePublicPriceLoadErrorCode, Partial<RetrievedStripePrice>]>;

async function expectLoadError(
  code: StripePublicPriceLoadErrorCode,
  options: {
    env?: Record<string, string | undefined>;
    retrievePrice?: (priceId: string) => Promise<RetrievedStripePrice>;
    environment?: "develop" | "production";
  } = {},
) {
  const promise = loadStripePublicPlanPrices({
    environment: options.environment ?? "develop",
    env: options.env ?? testEnvironment,
    retrievePrice: options.retrievePrice ?? retrieveValidPrices(),
  });
  await expect(promise).rejects.toMatchObject({ name: "StripePublicPriceLoadError", code });
}

describe("loadStripePublicPlanPrices", () => {
  it("2プランを一度ずつ取得し、公開項目だけのカタログを完全一致で返す", async () => {
    const retrievePrice = retrieveValidPrices();

    const catalog = await loadStripePublicPlanPrices({
      environment: "develop",
      env: testEnvironment,
      retrievePrice,
    });

    expect(retrievePrice).toHaveBeenCalledTimes(2);
    expect(retrievePrice).toHaveBeenNthCalledWith(1, testEnvironment.STRIPE_PRO_PRICE_ID);
    expect(retrievePrice).toHaveBeenNthCalledWith(2, testEnvironment.STRIPE_BUSINESS_PRICE_ID);
    expect(catalog).toEqual({
      pro: {
        currency: "jpy",
        unitAmount: 3_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
      business: {
        currency: "jpy",
        unitAmount: 6_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
    });
    expect(Object.keys(catalog.pro)).toEqual(["currency", "unitAmount", "interval", "intervalCount", "taxBehavior"]);

    const serialized = JSON.stringify(catalog);
    expect(serialized).not.toContain(testEnvironment.STRIPE_PRICE_READ_KEY);
    expect(serialized).not.toContain(testEnvironment.STRIPE_PRO_PRICE_ID);
    expect(serialized).not.toContain(testEnvironment.STRIPE_BUSINESS_PRICE_ID);
  });

  it("環境に対応するrestricted keyだけを受け付ける", async () => {
    await expectLoadError("invalid_restricted_key", {
      env: { ...testEnvironment, STRIPE_PRICE_READ_KEY: "sk_test_not_restricted" },
    });
    await expectLoadError("invalid_restricted_key", {
      environment: "production",
      env: { ...testEnvironment, STRIPE_PRICE_READ_KEY: "rk_test_wrong_mode" },
    });
    await expect(
      loadStripePublicPlanPrices({
        environment: "production",
        env: { ...testEnvironment, STRIPE_PRICE_READ_KEY: "rk_live_public_prices_secret_value" },
        retrievePrice: async (priceId) =>
          stripePrice({
            id: priceId,
            livemode: true,
            unit_amount: priceId === testEnvironment.STRIPE_PRO_PRICE_ID ? 3_000 : 6_000,
          }),
      }),
    ).resolves.toMatchObject({ pro: { unitAmount: 3_000 }, business: { unitAmount: 6_000 } });
  });

  it("欠落設定、不正ID、ProとBusinessの同一IDを取得前に拒否する", async () => {
    const retrievePrice = retrieveValidPrices();

    await expectLoadError("missing_configuration", {
      env: { ...testEnvironment, STRIPE_PRICE_READ_KEY: "" },
      retrievePrice,
    });
    await expectLoadError("invalid_price_id", {
      env: { ...testEnvironment, STRIPE_PRO_PRICE_ID: "prod_pro" },
      retrievePrice,
    });
    await expectLoadError("duplicate_price_id", {
      env: { ...testEnvironment, STRIPE_BUSINESS_PRICE_ID: testEnvironment.STRIPE_PRO_PRICE_ID },
      retrievePrice,
    });
    expect(retrievePrice).not.toHaveBeenCalled();
  });

  it("provider失敗を秘密値を含まない安定したエラーへ変換する", async () => {
    let caught: unknown;
    try {
      await loadStripePublicPlanPrices({
        environment: "develop",
        env: testEnvironment,
        retrievePrice: async () => {
          throw new Error(`provider response included ${testEnvironment.STRIPE_PRICE_READ_KEY}`);
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StripePublicPriceLoadError);
    expect(caught).toMatchObject({ code: "retrieve_failed", plan: "pro" });
    expect(String(caught)).not.toContain(testEnvironment.STRIPE_PRICE_READ_KEY);
    expect(String(caught)).not.toContain(testEnvironment.STRIPE_PRO_PRICE_ID);
  });

  it.each(invalidPriceCases)("%sを拒否する", async (code, override) => {
    await expectLoadError(code, {
      retrievePrice: async (priceId) =>
        priceId === testEnvironment.STRIPE_PRO_PRICE_ID
          ? stripePrice(override)
          : stripePrice({ id: testEnvironment.STRIPE_BUSINESS_PRICE_ID, unit_amount: 6_000 }),
    });
  });

  it("ProとBusinessの通貨不一致を拒否する", async () => {
    await expectLoadError("catalog_currency_mismatch", {
      retrievePrice: async (priceId) =>
        priceId === testEnvironment.STRIPE_PRO_PRICE_ID
          ? stripePrice()
          : stripePrice({ id: testEnvironment.STRIPE_BUSINESS_PRICE_ID, currency: "usd", unit_amount: 6_000 }),
    });
  });

  it("ProとBusinessの請求周期不一致を拒否する", async () => {
    await expectLoadError("catalog_cadence_mismatch", {
      retrievePrice: async (priceId) =>
        priceId === testEnvironment.STRIPE_PRO_PRICE_ID
          ? stripePrice()
          : stripePrice({
              id: testEnvironment.STRIPE_BUSINESS_PRICE_ID,
              unit_amount: 6_000,
              recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
            }),
    });
  });

  it("Developでは検証用の同じ短周期を受け入れる", async () => {
    const catalog = await loadStripePublicPlanPrices({
      environment: "develop",
      env: testEnvironment,
      retrievePrice: async (priceId) =>
        stripePrice({
          id: priceId,
          unit_amount: priceId === testEnvironment.STRIPE_PRO_PRICE_ID ? 3_000 : 6_000,
          recurring: { interval: "day", interval_count: 2, usage_type: "licensed" },
        }),
    });

    expect(catalog).toMatchObject({
      pro: { interval: "day", intervalCount: 2 },
      business: { interval: "day", intervalCount: 2 },
    });
  });

  it("Productionでは両プランが同じ周期でも月1回以外を拒否する", async () => {
    await expectLoadError("unsupported_billing_cadence", {
      environment: "production",
      env: { ...testEnvironment, STRIPE_PRICE_READ_KEY: "rk_live_public_prices_secret_value" },
      retrievePrice: async (priceId) =>
        stripePrice({
          id: priceId,
          livemode: true,
          unit_amount: priceId === testEnvironment.STRIPE_PRO_PRICE_ID ? 3_000 : 6_000,
          recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
        }),
    });
  });
});
