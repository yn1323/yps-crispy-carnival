import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { getAppUrl, getContactAllowedOrigins } from "../_lib/config";
import { sha256Hex } from "../_lib/sha256";
import { verifyTurnstile } from "../_lib/turnstile";
import { normalizeEmail } from "../_lib/validation";
import { CONTACT_HTTP_BODY_MAX_BYTES } from "../constants";
import { type ContactDeliveryInput, submitContactSchema } from "./schemas";

const checkTurnstileRateLimitRef = makeFunctionReference<"mutation", Record<string, never>, { allowed: boolean }>(
  "contact/mutations:checkTurnstileRateLimit",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, { allowed: boolean }>;

const checkSubmissionRateLimitRef = makeFunctionReference<
  "mutation",
  { emailKey: string; ipKey?: string },
  { allowed: boolean }
>("contact/mutations:checkSubmissionRateLimit") as unknown as FunctionReference<
  "mutation",
  "internal",
  { emailKey: string; ipKey?: string },
  { allowed: boolean }
>;

type ContactDeliveryResult = { status: "accepted" } | { status: "delivery_failed" } | { status: "not_configured" };

const deliverContactRef = makeFunctionReference<"action", { input: ContactDeliveryInput }, ContactDeliveryResult>(
  "contact/actions:deliver",
) as unknown as FunctionReference<"action", "internal", { input: ContactDeliveryInput }, ContactDeliveryResult>;

function allowedOrigins(): Set<string> {
  const origins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  for (const value of [getAppUrl(), ...getContactAllowedOrigins()]) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // 不正なenv値を許可Originとして扱わない。
    }
  }
  return origins;
}

function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && allowedOrigins().has(origin);
}

function corsHeaders(origin: string) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function jsonResponse(origin: string, body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...corsHeaders(origin),
      ...init.headers,
    },
  });
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > CONTACT_HTTP_BODY_MAX_BYTES) throw new Error("body_too_large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > CONTACT_HTTP_BODY_MAX_BYTES) throw new Error("body_too_large");
  return JSON.parse(text) as unknown;
}

function clientIp(request: Request): string | undefined {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

export const submit = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return new Response("Forbidden", { status: 403 });

  let raw: unknown;
  try {
    raw = await readJson(request);
  } catch {
    return jsonResponse(origin, { error: "送信内容を確認してください" }, { status: 400 });
  }
  const parsed = submitContactSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      origin,
      { error: parsed.error.issues[0]?.message ?? "送信内容を確認してください。" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const turnstileRateLimit = await ctx.runMutation(checkTurnstileRateLimitRef, {});
  if (!turnstileRateLimit.allowed) {
    return jsonResponse(
      origin,
      { error: "送信回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" },
      { status: 429 },
    );
  }

  try {
    if (
      !(await verifyTurnstile({
        token: input.turnstileToken,
        expectedAction: "contact",
        origin,
        allowedOrigins: allowedOrigins(),
      }))
    ) {
      return jsonResponse(origin, { error: "セキュリティ確認をやり直してください。" }, { status: 400 });
    }
  } catch {
    return jsonResponse(
      origin,
      { error: "セキュリティ確認を完了できませんでした。\nもう一度お試しください。" },
      { status: 503 },
    );
  }

  const emailKey = await sha256Hex(normalizeEmail(input.email));
  const ip = clientIp(request);
  const ipKey = ip ? await sha256Hex(ip) : undefined;
  const rateLimitResult = await ctx.runMutation(checkSubmissionRateLimitRef, { emailKey, ipKey });
  if (!rateLimitResult.allowed) {
    return jsonResponse(
      origin,
      { error: "送信回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" },
      { status: 429 },
    );
  }

  const delivery = await ctx.runAction(deliverContactRef, {
    input: {
      type: input.type,
      name: input.name,
      email: input.email,
      organization: input.organization,
      message: input.message,
      requestId: input.requestId,
    },
  });
  if (delivery.status === "not_configured") {
    return jsonResponse(origin, { error: "問い合わせを送信できませんでした。" }, { status: 503 });
  }
  if (delivery.status === "delivery_failed") {
    return jsonResponse(
      origin,
      { error: "問い合わせを送信できませんでした。\n少し時間をおいて、もう一度お試しください。" },
      { status: 502 },
    );
  }
  return jsonResponse(origin, { status: "accepted" });
});

export const options = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
});
