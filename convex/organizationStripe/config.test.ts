import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getStripeBillingConfiguration,
  getStripeBillingMode,
  getStripeProviderSafetyConfiguration,
  getStripeSafetyConfiguration,
} from "./config";

describe("organizationStripe/config", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_BILLING_MODE", "");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未設定と不明値はoffとして新規課金を停止する", () => {
    expect(getStripeBillingMode()).toBe("off");
    vi.stubEnv("STRIPE_BILLING_MODE", "unexpected");
    expect(getStripeBillingConfiguration()).toEqual({ status: "off", mode: "off" });
  });

  it("testとliveのsecret keyを取り違えた設定をreadyにしない", () => {
    vi.stubEnv("STRIPE_BILLING_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_example");
    vi.stubEnv("STRIPE_PORTAL_CONFIGURATION_ID", "bpc_example");

    expect(getStripeBillingConfiguration()).toEqual({
      status: "misconfigured",
      mode: "live",
      missing: ["STRIPE_SECRET_KEY"],
    });
  });

  it("offでも既存契約のWebhookと安全処理用secretを取得できる", () => {
    vi.stubEnv("STRIPE_BILLING_MODE", "off");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_example");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_example");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_example");

    expect(getStripeSafetyConfiguration()).toEqual({
      secretKey: "sk_test_example",
      webhookSecret: "whsec_example",
      proPriceId: "price_example",
    });
    expect(getStripeBillingConfiguration()).toEqual({ status: "off", mode: "off" });
  });

  it("provider安全処理はWebhook secret欠落時もsecret keyだけで継続できる", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_provider_safety");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");

    expect(getStripeSafetyConfiguration()).toBeNull();
    expect(getStripeProviderSafetyConfiguration()).toEqual({ secretKey: "sk_test_provider_safety" });
  });
});
