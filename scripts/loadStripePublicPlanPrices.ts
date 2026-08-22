import Stripe from "stripe";
import {
  PUBLIC_PAID_PLANS,
  type PublicPaidPlan,
  type PublicPlanPrice,
  type PublicPlanPriceCatalog,
} from "../src/domains/publicPricing";

// 認証済み課金と同じStripe API契約を使うが、BuildロジックからConvex runtimeへは依存させない。
const STRIPE_API_VERSION = "2026-06-24.dahlia" satisfies Stripe.LatestApiVersion;

export type StripePublicPriceBuildEnvironment = "local" | "preview" | "develop" | "production";

type StripeBuildEnvironmentVariables = Readonly<Record<string, string | undefined>>;

export type RetrievedStripePrice = Readonly<{
  id: unknown;
  active: unknown;
  livemode: unknown;
  type: unknown;
  currency: unknown;
  unit_amount: unknown;
  billing_scheme: unknown;
  transform_quantity: unknown;
  tax_behavior: unknown;
  recurring: Readonly<{
    interval: unknown;
    interval_count: unknown;
    usage_type: unknown;
  }> | null;
}>;

export type RetrieveStripePrice = (priceId: string) => Promise<RetrievedStripePrice>;

export type StripePublicPriceLoadErrorCode =
  | "missing_configuration"
  | "invalid_secret_key"
  | "invalid_price_id"
  | "duplicate_price_id"
  | "retrieve_failed"
  | "price_id_mismatch"
  | "livemode_mismatch"
  | "inactive_price"
  | "invalid_recurring_price"
  | "unsupported_billing_model"
  | "invalid_unit_amount"
  | "invalid_currency"
  | "unspecified_tax_behavior"
  | "unsupported_billing_cadence"
  | "catalog_currency_mismatch"
  | "catalog_cadence_mismatch";

export class StripePublicPriceLoadError extends Error {
  readonly code: StripePublicPriceLoadErrorCode;
  readonly plan?: PublicPaidPlan;

  constructor(code: StripePublicPriceLoadErrorCode, plan?: PublicPaidPlan) {
    super(plan ? `Public Stripe price rejected (${plan}: ${code})` : `Public Stripe prices rejected (${code})`);
    this.name = "StripePublicPriceLoadError";
    this.code = code;
    this.plan = plan;
  }
}

export async function loadStripePublicPlanPrices(args: {
  environment: StripePublicPriceBuildEnvironment;
  env?: StripeBuildEnvironmentVariables;
  retrievePrice?: RetrieveStripePrice;
}): Promise<PublicPlanPriceCatalog> {
  // ViteのloadEnvはdebug時にresolved envを出力するため、Build secretはprocessから直接読む。
  const configuration = getBuildConfiguration(args.environment, args.env ?? process.env);
  const retrievePrice = args.retrievePrice ?? createStripePriceRetriever(configuration.secretKey);

  const [pro, business] = await Promise.all(
    PUBLIC_PAID_PLANS.map(async (plan) => {
      const priceId = plan === "pro" ? configuration.proPriceId : configuration.businessPriceId;
      let retrieved: RetrievedStripePrice;
      try {
        retrieved = await retrievePrice(priceId);
      } catch {
        throw new StripePublicPriceLoadError("retrieve_failed", plan);
      }
      return validatePublicPlanPrice(retrieved, {
        plan,
        expectedPriceId: priceId,
        expectedLivemode: configuration.livemode,
      });
    }),
  );

  if (pro.currency !== business.currency) {
    throw new StripePublicPriceLoadError("catalog_currency_mismatch");
  }
  if (pro.interval !== business.interval || pro.intervalCount !== business.intervalCount) {
    throw new StripePublicPriceLoadError("catalog_cadence_mismatch");
  }
  if (args.environment === "production" && (pro.interval !== "month" || pro.intervalCount !== 1)) {
    throw new StripePublicPriceLoadError("unsupported_billing_cadence");
  }

  return Object.freeze({ pro, business });
}

function getBuildConfiguration(
  environment: StripePublicPriceBuildEnvironment,
  env: StripeBuildEnvironmentVariables,
): {
  secretKey: string;
  proPriceId: string;
  businessPriceId: string;
  livemode: boolean;
} {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const proPriceId = env.STRIPE_PRO_PRICE_ID?.trim() ?? "";
  const businessPriceId = env.STRIPE_BUSINESS_PRICE_ID?.trim() ?? "";

  if (!secretKey || !proPriceId || !businessPriceId) {
    throw new StripePublicPriceLoadError("missing_configuration");
  }

  const livemode = environment === "production";
  const expectedKeyPrefix = livemode ? "sk_live_" : "sk_test_";
  if (!secretKey.startsWith(expectedKeyPrefix)) {
    throw new StripePublicPriceLoadError("invalid_secret_key");
  }
  if (!isPriceId(proPriceId) || !isPriceId(businessPriceId)) {
    throw new StripePublicPriceLoadError("invalid_price_id");
  }
  if (proPriceId === businessPriceId) {
    throw new StripePublicPriceLoadError("duplicate_price_id");
  }

  return { secretKey, proPriceId, businessPriceId, livemode };
}

function createStripePriceRetriever(secretKey: string): RetrieveStripePrice {
  const stripe = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
  return async (priceId) => await stripe.prices.retrieve(priceId);
}

function validatePublicPlanPrice(
  price: RetrievedStripePrice,
  expected: { plan: PublicPaidPlan; expectedPriceId: string; expectedLivemode: boolean },
): PublicPlanPrice {
  if (price.id !== expected.expectedPriceId) {
    throw new StripePublicPriceLoadError("price_id_mismatch", expected.plan);
  }
  if (price.livemode !== expected.expectedLivemode) {
    throw new StripePublicPriceLoadError("livemode_mismatch", expected.plan);
  }
  if (price.active !== true) {
    throw new StripePublicPriceLoadError("inactive_price", expected.plan);
  }
  if (
    price.type !== "recurring" ||
    !price.recurring ||
    !isBillingInterval(price.recurring.interval) ||
    !Number.isSafeInteger(price.recurring.interval_count) ||
    (price.recurring.interval_count as number) < 1
  ) {
    throw new StripePublicPriceLoadError("invalid_recurring_price", expected.plan);
  }
  if (
    price.billing_scheme !== "per_unit" ||
    price.transform_quantity !== null ||
    price.recurring.usage_type !== "licensed"
  ) {
    throw new StripePublicPriceLoadError("unsupported_billing_model", expected.plan);
  }
  if (!Number.isSafeInteger(price.unit_amount) || (price.unit_amount as number) <= 0) {
    throw new StripePublicPriceLoadError("invalid_unit_amount", expected.plan);
  }
  if (typeof price.currency !== "string" || !/^[a-z]{3}$/i.test(price.currency)) {
    throw new StripePublicPriceLoadError("invalid_currency", expected.plan);
  }
  if (price.tax_behavior !== "inclusive" && price.tax_behavior !== "exclusive") {
    throw new StripePublicPriceLoadError("unspecified_tax_behavior", expected.plan);
  }
  return Object.freeze({
    currency: price.currency.toLowerCase(),
    unitAmount: price.unit_amount as number,
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count as number,
    taxBehavior: price.tax_behavior,
  });
}

function isBillingInterval(value: unknown): value is PublicPlanPrice["interval"] {
  return value === "day" || value === "week" || value === "month" || value === "year";
}

function isPriceId(value: string): boolean {
  return value.startsWith("price_") && value.length > "price_".length;
}
