import { env } from "../_generated/server";

export const STRIPE_API_VERSION = "2026-06-24.dahlia";
export const STRIPE_WEBHOOK_API_VERSION = "2026-04-22.dahlia";

export type StripeBillingConfiguration =
  | { status: "misconfigured"; missing: readonly StripeConfigurationKey[] }
  | {
      status: "ready";
      livemode: boolean;
      secretKey: string;
      webhookSecret: string;
      standardPriceId: string;
      proPriceId: string;
      portalConfigurationId: string;
    };

type StripeConfigurationKey =
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "STRIPE_STANDARD_PRICE_ID"
  | "STRIPE_PRO_PRICE_ID"
  | "STRIPE_PORTAL_CONFIGURATION_ID";

/** ユーザー起点のStripe操作に必要な設定。Sandbox/liveはSecret Keyから判定する。 */
export function getStripeBillingConfiguration(): StripeBillingConfiguration {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const { standardPriceId, proPriceId } = getConfiguredPriceIds();
  const portalConfigurationId = (env.STRIPE_PORTAL_CONFIGURATION_ID ?? "").trim();
  const livemode = stripeLivemodeFromSecretKey(secretKey);
  const missing: StripeConfigurationKey[] = [];
  if (livemode === null) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecret.startsWith("whsec_")) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!standardPriceId.startsWith("price_")) missing.push("STRIPE_STANDARD_PRICE_ID");
  if (!proPriceId.startsWith("price_") || proPriceId === standardPriceId) {
    missing.push("STRIPE_PRO_PRICE_ID");
  }
  if (!portalConfigurationId.startsWith("bpc_")) missing.push("STRIPE_PORTAL_CONFIGURATION_ID");
  if (missing.length > 0 || livemode === null) return { status: "misconfigured", missing };

  return {
    status: "ready",
    livemode,
    secretKey,
    webhookSecret,
    standardPriceId,
    proPriceId,
    portalConfigurationId,
  };
}

/**
 * Webhook受信と既存契約の安全処理用。
 * 新規販売を止める場合もsecretを残し、対象Priceをアーカイブする。
 */
export function getStripeSafetyConfiguration(): {
  secretKey: string;
  webhookSecret: string;
  livemode: boolean;
  standardPriceId?: string;
  proPriceId?: string;
} | null {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? "").trim();
  const { standardPriceId, proPriceId } = getConfiguredPriceIds();
  const livemode = stripeLivemodeFromSecretKey(secretKey);
  if (livemode === null || !webhookSecret.startsWith("whsec_")) {
    return null;
  }
  return {
    secretKey,
    webhookSecret,
    livemode,
    ...(hasDistinctPriceIds(standardPriceId, proPriceId) ? { standardPriceId, proPriceId } : {}),
  };
}

/** 既存契約の安全収束用。Webhook secretや新規販売設定が欠けてもprovider停止処理は継続する。 */
export function getStripeProviderSafetyConfiguration(): {
  secretKey: string;
  livemode: boolean;
  standardPriceId?: string;
  proPriceId?: string;
} | null {
  const secretKey = (env.STRIPE_SECRET_KEY ?? "").trim();
  const { standardPriceId, proPriceId } = getConfiguredPriceIds();
  const livemode = stripeLivemodeFromSecretKey(secretKey);
  if (livemode === null) return null;
  return {
    secretKey,
    livemode,
    ...(hasDistinctPriceIds(standardPriceId, proPriceId) ? { standardPriceId, proPriceId } : {}),
  };
}

export type StripePaidPlan = "standard" | "pro";

/** Price ID is selected only from the server-side allowlist. */
export function getConfiguredStripePriceId(
  configuration: { standardPriceId?: string; proPriceId?: string },
  plan: StripePaidPlan,
) {
  return plan === "standard" ? configuration.standardPriceId : configuration.proPriceId;
}

function getConfiguredPriceIds(): {
  standardPriceId: string;
  proPriceId: string;
} {
  return {
    standardPriceId: (env.STRIPE_STANDARD_PRICE_ID ?? "").trim(),
    proPriceId: (env.STRIPE_PRO_PRICE_ID ?? "").trim(),
  };
}

function hasDistinctPriceIds(standardPriceId: string, proPriceId: string): boolean {
  return standardPriceId.startsWith("price_") && proPriceId.startsWith("price_") && standardPriceId !== proPriceId;
}

function stripeLivemodeFromSecretKey(secretKey: string): boolean | null {
  if (secretKey.startsWith("sk_test_")) return false;
  if (secretKey.startsWith("sk_live_")) return true;
  return null;
}
