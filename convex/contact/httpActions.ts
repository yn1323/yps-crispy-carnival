import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { getAppUrl, getContactAllowedOrigins, getTurnstileSecretKey } from "../_lib/config";
import { CONTACT_HTTP_BODY_MAX_BYTES } from "../constants";
import { type ContactDeliveryInput, type SubmitContactInput, submitContactSchema } from "./schemas";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 8_000;
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";

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

async function hashRateLimitKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function clientIp(request: Request): string | undefined {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
}

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function verifyTurnstile(input: SubmitContactInput, origin: string): Promise<boolean> {
  const secret = getTurnstileSecretKey();
  if (!secret) throw new Error("turnstile_not_configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", input.turnstileToken);
    body.set("idempotency_key", input.requestId);
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!response.ok) return false;
    const result = (await response.json()) as TurnstileResponse;
    if (result.success !== true) {
      console.warn("Contact Turnstile validation failed", { errorCodes: result["error-codes"] ?? [] });
      return false;
    }

    // Cloudflareのalways-passテストキーはhostnameにexample.comを返すため、localhostからの開発時だけ照合を省略する。
    const isLocalTest =
      secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET && isLocalOrigin(getAppUrl()) && isLocalOrigin(origin);
    if (!isLocalTest && result.action && result.action !== "contact") return false;
    if (!isLocalTest && result.hostname) {
      const hostnames = new Set([...allowedOrigins()].map((origin) => new URL(origin).hostname));
      if (!hostnames.has(result.hostname)) return false;
    }
    return true;
  } finally {
    clearTimeout(timeoutId);
  }
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
      { error: parsed.error.issues[0]?.message ?? "送信内容を確認してください" },
      { status: 400 },
    );
  }
  const input = parsed.data;

  try {
    if (!(await verifyTurnstile(input, origin))) {
      return jsonResponse(origin, { error: "セキュリティ確認をやり直してください" }, { status: 400 });
    }
  } catch {
    return jsonResponse(origin, { error: "セキュリティ確認を完了できませんでした" }, { status: 503 });
  }

  const emailKey = await hashRateLimitKey(input.email.trim().toLowerCase());
  const ip = clientIp(request);
  const ipKey = ip ? await hashRateLimitKey(ip) : undefined;
  const rateLimitResult = await ctx.runMutation(checkSubmissionRateLimitRef, { emailKey, ipKey });
  if (!rateLimitResult.allowed) {
    return jsonResponse(
      origin,
      { error: "送信回数が多くなっています。少し時間をおいてお試しください" },
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
    return jsonResponse(origin, { error: "問い合わせを送信できませんでした" }, { status: 503 });
  }
  if (delivery.status === "delivery_failed") {
    return jsonResponse(
      origin,
      { error: "問い合わせを送信できませんでした。少し時間をおいてお試しください" },
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
