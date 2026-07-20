import Stripe from "stripe";
import { internal } from "../_generated/api";
import { httpAction } from "../_generated/server";
import { readBoundedJsonBody } from "../_lib/httpBody";
import { STRIPE_WEBHOOK_BODY_MAX_BYTES, STRIPE_WEBHOOK_SIGNATURE_MAX_LENGTH } from "../constants";
import { getStripeBillingMode, getStripeSafetyConfiguration, STRIPE_WEBHOOK_API_VERSION } from "./config";
import { isSupportedStripeWebhookEventType, type StripeWebhookEventType } from "./validators";

const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const STRIPE_PROVIDER_ID_MAX_LENGTH = 255;
const STRIPE_API_VERSION_MAX_LENGTH = 64;

type NormalizedStripeWebhookEvent = {
  stripeEventId: string;
  type: StripeWebhookEventType;
  apiVersion?: string;
  livemode: boolean;
  objectId: string;
  objectCustomerId?: string;
  eventCreatedAt: number;
};

/**
 * Stripe Webhook受信エンドポイント（V8ランタイム）。
 * raw bodyの署名検証が完了するまで、JSONの解釈とDB更新を行わない。
 */
export const webhookHandler = httpAction(async (ctx, request) => {
  const safetyConfiguration = getStripeSafetyConfiguration();
  if (!safetyConfiguration) {
    console.error("Stripe webhook configuration is missing");
    return new Response("Server misconfigured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature || signature.length > STRIPE_WEBHOOK_SIGNATURE_MAX_LENGTH) {
    return invalidWebhookResponse();
  }

  const bodyResult = await readBoundedJsonBody(request, STRIPE_WEBHOOK_BODY_MAX_BYTES);
  if (!bodyResult.ok) return bodyErrorResponse(bodyResult.error);

  const stripe = new Stripe(safetyConfiguration.secretKey, {
    apiVersion: STRIPE_WEBHOOK_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      bodyResult.rawBody,
      signature,
      safetyConfiguration.webhookSecret,
      STRIPE_WEBHOOK_TOLERANCE_SECONDS,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return invalidWebhookResponse();
  }

  const normalized = normalizeSupportedEvent(event);
  if (normalized.kind === "unsupported") return okResponse();
  if (normalized.kind === "invalid") return new Response("Invalid webhook payload", { status: 400 });

  const billingMode = getStripeBillingMode();
  const expectedLivemode =
    billingMode === "off" ? safetyConfiguration.secretKey.startsWith("sk_live_") : billingMode === "live";
  await ctx.runMutation(internal.organizationStripe.mutations.receiveWebhookEvent, {
    ...normalized.event,
    expectedLivemode,
  });

  return okResponse();
});

function normalizeSupportedEvent(
  value: unknown,
): { kind: "unsupported" } | { kind: "invalid" } | { kind: "supported"; event: NormalizedStripeWebhookEvent } {
  if (!isRecord(value) || typeof value.type !== "string") return { kind: "invalid" };
  if (!isSupportedStripeWebhookEventType(value.type)) return { kind: "unsupported" };

  if (
    !isBoundedString(value.id, STRIPE_PROVIDER_ID_MAX_LENGTH) ||
    !value.id.startsWith("evt_") ||
    typeof value.livemode !== "boolean" ||
    !Number.isSafeInteger(value.created) ||
    (value.created as number) < 0 ||
    (value.created as number) > Math.floor(Number.MAX_SAFE_INTEGER / 1000) ||
    !isRecord(value.data) ||
    !isRecord(value.data.object) ||
    !isBoundedString(value.data.object.id, STRIPE_PROVIDER_ID_MAX_LENGTH)
  ) {
    return { kind: "invalid" };
  }

  const apiVersion = value.api_version;
  if (apiVersion !== null && apiVersion !== undefined && !isBoundedString(apiVersion, STRIPE_API_VERSION_MAX_LENGTH)) {
    return { kind: "invalid" };
  }

  return {
    kind: "supported",
    event: {
      stripeEventId: value.id,
      type: value.type,
      ...(typeof apiVersion === "string" ? { apiVersion } : {}),
      livemode: value.livemode,
      objectId: value.data.object.id,
      ...(stripeObjectIdHint(value.data.object.customer)
        ? { objectCustomerId: stripeObjectIdHint(value.data.object.customer) }
        : {}),
      eventCreatedAt: (value.created as number) * 1000,
    },
  };
}

function stripeObjectIdHint(value: unknown) {
  if (isBoundedString(value, STRIPE_PROVIDER_ID_MAX_LENGTH) && value.startsWith("cus_")) return value;
  if (isRecord(value) && isBoundedString(value.id, STRIPE_PROVIDER_ID_MAX_LENGTH) && value.id.startsWith("cus_"))
    return value.id;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function invalidWebhookResponse() {
  return new Response("Invalid webhook", { status: 400 });
}

function okResponse() {
  return new Response("OK", { status: 200 });
}

function bodyErrorResponse(error: "unsupported_media_type" | "body_too_large" | "invalid_body") {
  if (error === "unsupported_media_type") return new Response("Unsupported media type", { status: 415 });
  if (error === "body_too_large") return new Response("Request body too large", { status: 413 });
  return new Response("Invalid request body", { status: 400 });
}
