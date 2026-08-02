import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import { httpAction } from "../_generated/server";
import { getAppUrl, getStaffRegistrationAllowedOrigins, getStaffRegistrationTrustedIpHeader } from "../_lib/config";
import { readBoundedJsonBody } from "../_lib/httpBody";
import { verifyTurnstile } from "../_lib/turnstile";
import { STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES } from "../constants";
import { submitStaffRegistrationSchema } from "./schemas";

const TURNSTILE_ACTION = "staff_registration";
const RESPONSE_ACCEPTED = { status: "accepted" as const };

const checkSubmissionIngressRateLimitRef = makeFunctionReference<"mutation", { ipKey?: string }, { allowed: boolean }>(
  "staffRegistration/mutations:checkSubmissionIngressRateLimit",
) as unknown as FunctionReference<"mutation", "internal", { ipKey?: string }, { allowed: boolean }>;

const checkSubmissionRateLimitRef = makeFunctionReference<
  "mutation",
  { token: string; emailKey: string; linkKey: string },
  { status: "allowed" | "rate_limited" | "unavailable" }
>("staffRegistration/mutations:checkSubmissionRateLimit") as unknown as FunctionReference<
  "mutation",
  "internal",
  { token: string; emailKey: string; linkKey: string },
  { status: "allowed" | "rate_limited" | "unavailable" }
>;

const submitRegistrationRequestRef = makeFunctionReference<
  "mutation",
  { token: string; name: string; email: string; acceptedLegal: boolean },
  { status: "accepted" | "unavailable" }
>("staffRegistration/mutations:submitRegistrationRequestFromHttp") as unknown as FunctionReference<
  "mutation",
  "internal",
  { token: string; name: string; email: string; acceptedLegal: boolean },
  { status: "accepted" | "unavailable" }
>;

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const appUrl = getAppUrl();
  const configured = [appUrl, ...getStaffRegistrationAllowedOrigins()];
  if (isLocalOrigin(appUrl)) configured.push("http://localhost:3000", "http://127.0.0.1:3000");

  for (const value of configured) {
    try {
      origins.add(new URL(value).origin);
    } catch {
      // 不正なenv値を許可Originへ昇格させない。
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

function forbiddenOriginResponse() {
  return new Response(null, {
    status: 403,
    headers: { "cache-control": "no-store", vary: "Origin" },
  });
}

async function hashRateLimitKey(namespace: "email" | "link" | "ip", value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${namespace}:${value}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function trustedClientIp(request: Request): string | undefined {
  const header = getStaffRegistrationTrustedIpHeader();
  if (!header) return undefined;
  const value = request.headers.get(header)?.trim();
  if (!value || value.length > 64 || !isIpAddress(value)) return undefined;
  return value;
}

function isIpAddress(value: string): boolean {
  if (/^\d+(?:\.\d+){3}$/.test(value)) {
    return value.split(".").every((part) => Number(part) >= 0 && Number(part) <= 255);
  }
  if (!value.includes(":") || !/^[0-9a-f:.]+$/i.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 0;
  } catch {
    return false;
  }
}

export const submit = httpAction(async (ctx, request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return forbiddenOriginResponse();
  const body = await readBoundedJsonBody(request, STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES);
  if (!body.ok && body.error === "unsupported_media_type") {
    return jsonResponse(origin, { error: "JSON形式で送信してください" }, { status: 415 });
  }
  if (!body.ok && body.error === "body_too_large") {
    return jsonResponse(origin, { error: "送信内容が大きすぎます。" }, { status: 413 });
  }
  if (!body.ok) return jsonResponse(origin, { error: "送信内容を確認してください。" }, { status: 400 });

  let raw: unknown;
  try {
    raw = JSON.parse(body.rawBody) as unknown;
  } catch {
    return jsonResponse(origin, { error: "送信内容を確認してください。" }, { status: 400 });
  }

  const parsed = submitStaffRegistrationSchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      origin,
      { error: parsed.error.issues[0]?.message ?? "送信内容を確認してください。" },
      { status: 400 },
    );
  }
  const input = parsed.data;
  const origins = allowedOrigins();
  const ip = trustedClientIp(request);
  const ingressRateLimit = await ctx.runMutation(checkSubmissionIngressRateLimitRef, {
    ...(ip ? { ipKey: await hashRateLimitKey("ip", ip) } : {}),
  });
  if (!ingressRateLimit.allowed) {
    return jsonResponse(
      origin,
      { error: "申請回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" },
      { status: 429 },
    );
  }

  try {
    const verified = await verifyTurnstile({
      token: input.turnstileToken,
      expectedAction: TURNSTILE_ACTION,
      origin,
      allowedOrigins: origins,
    });
    if (!verified) {
      return jsonResponse(origin, { error: "セキュリティ確認をやり直してください。" }, { status: 400 });
    }
  } catch {
    return jsonResponse(
      origin,
      { error: "セキュリティ確認を完了できませんでした。\nもう一度お試しください。" },
      { status: 503 },
    );
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const rateLimitResult = await ctx.runMutation(checkSubmissionRateLimitRef, {
    token: input.token,
    emailKey: await hashRateLimitKey("email", `${input.token}:${normalizedEmail}`),
    linkKey: await hashRateLimitKey("link", input.token),
  });
  if (rateLimitResult.status === "rate_limited") {
    return jsonResponse(
      origin,
      { error: "申請回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" },
      { status: 429 },
    );
  }
  if (rateLimitResult.status === "unavailable") {
    return jsonResponse(origin, { error: "登録リンクの有効期限が切れています。" }, { status: 400 });
  }

  try {
    const result = await ctx.runMutation(submitRegistrationRequestRef, {
      token: input.token,
      name: input.name,
      email: normalizedEmail,
      acceptedLegal: input.acceptedLegal,
    });
    if (result.status === "unavailable") {
      return jsonResponse(origin, { error: "登録リンクの有効期限が切れています。" }, { status: 400 });
    }
  } catch {
    console.error("Staff registration submission failed", { errorCode: "staff_registration_submit_failed" });
    return jsonResponse(origin, { error: "スタッフ登録を申請できませんでした。" }, { status: 503 });
  }

  return jsonResponse(origin, RESPONSE_ACCEPTED);
});

export const options = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return forbiddenOriginResponse();
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
});
