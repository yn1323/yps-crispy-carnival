import { env } from "../_generated/server";

export const STRIPE_WEBHOOK_API_VERSION = "2026-04-22.dahlia";

export type StripeBillingMode = "off" | "test" | "live";

export type StripeBillingConfiguration =
  | { status: "off"; mode: "off" }
  | { status: "misconfigured"; mode: "test" | "live"; missing: readonly StripeConfigurationKey[] }
  | {
      status: "ready";
      mode: "test" | "live";
      secretKey: string;
      webhookSecret: string;
      proPriceId: string;
      portalConfigurationId: string;
    };

type StripeConfigurationKey =
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_PRO_PRICE_ID"
  | "STRIPE_PORTAL_CONFIGURATION_ID";

export function getStripeBillingMode(): StripeBillingMode {
  const value = (env.STRIPE_BILLING_MODE ?? "").trim().toLowerCase();
  if (value === "test" || value === "live") return value;
  return "off";
}

/** ユーザー起点の新規Stripe操作に必要な設定。offではsecretを読まずに停止する。 */
export function getStripeBillingConfiguration(): StripeBillingConfiguration {
  const mode = getStripeBillingMode();
  if (mode === "off") return { status: "off", mode };

  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const proPriceId = (env.STRIPE_PRO_PRICE_ID ?? "").trim();
  const portalConfigurationId = (env.STRIPE_PORTAL_CONFIGURATION_ID ?? "").trim();
  const missing: StripeConfigurationKey[] = [];
  if (!isSecretKeyForMode(secretKey, mode)) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecret.startsWith("whsec_")) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!proPriceId.startsWith("price_")) missing.push("STRIPE_PRO_PRICE_ID");
  if (!portalConfigurationId.startsWith("bpc_")) missing.push("STRIPE_PORTAL_CONFIGURATION_ID");
  if (missing.length > 0) return { status: "misconfigured", mode, missing };

  return {
    status: "ready",
    mode,
    secretKey,
    webhookSecret,
    proPriceId,
    portalConfigurationId,
  };
}

/** UI/API へ secret を渡さず、課金操作を提供できるかだけを公開する。 */
export function isStripeBillingAvailable(): boolean {
  return getStripeBillingConfiguration().status === "ready";
}

/**
 * Webhook受信と既存契約の安全処理はbilling modeがoffでも止めない。
 * 既存契約がある環境では、modeをoffにしてもsecretを残す必要がある。
 */
export function getStripeSafetyConfiguration(): {
  secretKey: string;
  webhookSecret: string;
  proPriceId?: string;
} | null {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const proPriceId = (env.STRIPE_PRO_PRICE_ID ?? "").trim();
  if (!/^sk_(test|live)_/.test(secretKey) || !webhookSecret.startsWith("whsec_")) {
    return null;
  }
  return {
    secretKey,
    webhookSecret,
    ...(proPriceId.startsWith("price_") ? { proPriceId } : {}),
  };
}

/** 既存契約の安全収束用。Webhook secretや新規販売設定が欠けてもprovider停止処理は継続する。 */
export function getStripeProviderSafetyConfiguration(): { secretKey: string; proPriceId?: string } | null {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const proPriceId = (env.STRIPE_PRO_PRICE_ID ?? "").trim();
  if (!/^sk_(test|live)_/.test(secretKey)) return null;
  return { secretKey, ...(proPriceId.startsWith("price_") ? { proPriceId } : {}) };
}

function isSecretKeyForMode(secretKey: string, mode: "test" | "live") {
  return secretKey.startsWith(mode === "test" ? "sk_test_" : "sk_live_");
}
