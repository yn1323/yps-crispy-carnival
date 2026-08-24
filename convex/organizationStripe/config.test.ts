import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getConfiguredStripePriceId,
  getStripeBillingConfiguration,
  getStripeProviderSafetyConfiguration,
  getStripeSafetyConfiguration,
} from "./config";

describe("organizationStripe/config", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Secret Keyが未設定または不明な形式なら設定不備として扱う", () => {
    stubRequiredPriceConfiguration();

    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      missing: ["STRIPE_SECRET_KEY"],
    });
    vi.stubEnv("STRIPE_SECRET_KEY", "unexpected");
    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      missing: ["STRIPE_SECRET_KEY"],
    });
  });

  it.each([
    { secretKey: "sk_test_example", livemode: false },
    { secretKey: "sk_live_example", livemode: true },
  ])("Secret Keyからlivemodeを判定する: $secretKey", ({ secretKey, livemode }) => {
    vi.stubEnv("STRIPE_SECRET_KEY", secretKey);
    stubRequiredPriceConfiguration();

    expect(getStripeBillingConfiguration()).toEqual({
      status: "ready",
      livemode,
      secretKey,
      webhookSecret: "whsec_example",
      standardPriceId: "price_standard_example",
      proPriceId: "price_pro_example",
      portalConfigurationId: "bpc_example",
    });
  });

  it("StandardとProの明示keyをそのままcanonical allowlistとして使う", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_direct_prices");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_direct_prices");
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_direct_standard");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_direct_pro");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_direct_prices");

    expect(getStripeBillingConfiguration()).toMatchObject({
      status: "ready",
      standardPriceId: "price_direct_standard",
      proPriceId: "price_direct_pro",
    });
    expect(getStripeSafetyConfiguration()).toMatchObject({
      standardPriceId: "price_direct_standard",
      proPriceId: "price_direct_pro",
    });
    expect(getStripeProviderSafetyConfiguration()).toMatchObject({
      standardPriceId: "price_direct_standard",
      proPriceId: "price_direct_pro",
    });
  });

  it("StandardとProの欠損または重複をfail closedにする", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_invalid_catalog");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_invalid_catalog");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_only");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_invalid_catalog");

    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      missing: ["STRIPE_STANDARD_PRICE_ID"],
    });

    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_standard_only");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      missing: ["STRIPE_PRO_PRICE_ID"],
    });
    expect(getStripeSafetyConfiguration()).toEqual({
      secretKey: "sk_test_invalid_catalog",
      webhookSecret: "whsec_invalid_catalog",
      livemode: false,
    });
    expect(getStripeProviderSafetyConfiguration()).toEqual({
      secretKey: "sk_test_invalid_catalog",
      livemode: false,
    });

    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_standard_only");
    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      missing: ["STRIPE_PRO_PRICE_ID"],
    });
  });

  it("planごとにserver-side allowlistのPrice IDだけを選択する", () => {
    const configuredPrices = {
      standardPriceId: "price_standard_allowlisted",
      proPriceId: "price_pro_allowlisted",
    };

    expect(getConfiguredStripePriceId(configuredPrices, "standard")).toBe("price_standard_allowlisted");
    expect(getConfiguredStripePriceId(configuredPrices, "pro")).toBe("price_pro_allowlisted");
    expect(getConfiguredStripePriceId({ proPriceId: configuredPrices.proPriceId }, "standard")).toBeUndefined();
  });

  it("既存契約のWebhookと安全処理用secretをcanonical Price対応付きで取得できる", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_standard_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_example");

    expect(getStripeSafetyConfiguration()).toEqual({
      secretKey: "sk_test_example",
      webhookSecret: "whsec_example",
      livemode: false,
      standardPriceId: "price_standard_example",
      proPriceId: "price_pro_example",
    });
  });

  it("provider安全処理はWebhook secret欠損時もsecret keyだけで継続できる", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_provider_safety");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(getStripeSafetyConfiguration()).toBeNull();
    expect(getStripeProviderSafetyConfiguration()).toEqual({
      secretKey: "sk_test_provider_safety",
      livemode: false,
    });
  });
});

function stubRequiredPriceConfiguration() {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
  vi.stubEnv("STRIPE_STANDARD_PRICE_ID", "price_standard_example");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_example");
  vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_example");
}
