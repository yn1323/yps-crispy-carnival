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
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Secret Keyが未設定または不明な形式なら設定不備として扱う", () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_example");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_example");

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
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_example");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_example");

    expect(getStripeBillingConfiguration()).toEqual({
      status: "ready",
      livemode,
      secretKey,
      webhookSecret: "whsec_example",
      proPriceId: "price_example",
      portalConfigurationId: "bpc_example",
    });
  });

  it("Business Priceが未設定でもPro購入とPortalに必要な設定をreadyで返す", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_without_business_price");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_without_business_price");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro_only");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_pro_only");

    expect(getStripeBillingConfiguration()).toEqual({
      status: "ready",
      livemode: false,
      secretKey: "sk_test_without_business_price",
      webhookSecret: "whsec_without_business_price",
      proPriceId: "price_pro_only",
      portalConfigurationId: "bpc_pro_only",
    });
  });

  it("planごとにserver-side allowlistのPrice IDだけを選択する", () => {
    const configuredPrices = {
      proPriceId: "price_pro_allowlisted",
      businessPriceId: "price_business_allowlisted",
    };

    expect(getConfiguredStripePriceId(configuredPrices, "pro")).toBe("price_pro_allowlisted");
    expect(getConfiguredStripePriceId(configuredPrices, "business")).toBe("price_business_allowlisted");
    expect(getConfiguredStripePriceId({ proPriceId: configuredPrices.proPriceId }, "business")).toBeUndefined();
  });

  it("Proと同じBusiness Priceは別プランのallowlistとして公開しない", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_duplicate_price");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_duplicate_price");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_duplicate");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_duplicate");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_duplicate_price");

    const configuration = getStripeBillingConfiguration();
    expect(configuration).toMatchObject({ status: "ready", proPriceId: "price_duplicate" });
    expect(configuration).not.toHaveProperty("businessPriceId");
  });

  it("既存契約のWebhookと安全処理用secretをlivemode付きで取得できる", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_example");
    vi.stubEnv("STRIPE_BUSINESS_PRICE_ID", "price_business_example");

    expect(getStripeSafetyConfiguration()).toEqual({
      secretKey: "sk_test_example",
      webhookSecret: "whsec_example",
      livemode: false,
      proPriceId: "price_example",
      businessPriceId: "price_business_example",
    });
  });

  it("provider安全処理はWebhook secret欠落時もsecret keyだけで継続できる", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_provider_safety");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(getStripeSafetyConfiguration()).toBeNull();
    expect(getStripeProviderSafetyConfiguration()).toEqual({
      secretKey: "sk_test_provider_safety",
      livemode: false,
    });
  });
});
