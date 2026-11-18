import type { FunctionReference } from "convex/server";
import { makeFunctionReference } from "convex/server";
import type { z } from "zod";
import type { ActionCtx } from "../_generated/server";
import { httpAction } from "../_generated/server";
import { getAppUrl, getStaffRegistrationAllowedOrigins, getStaffRegistrationTrustedIpHeader } from "../_lib/config";
import { readBoundedJsonBody } from "../_lib/httpBody";
import { verifyTurnstile } from "../_lib/turnstile";
import { generateUUID } from "../_lib/uuid";
import { normalizeEmail } from "../_lib/validation";
import { STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES } from "../constants";
import {
  confirmStaffRegistrationCodeSchema,
  resendStaffRegistrationCodeSchema,
  submitStaffRegistrationSchema,
} from "./schemas";
import {
  digestVerificationCode,
  digestVerificationHandle,
  generateVerificationCode,
  hashStaffRegistrationRateLimitKey,
  staffRegistrationEmailRateLimitKey,
} from "./verificationCode";

const TURNSTILE_ACTION = "staff_registration";
const RESPONSE_ACCEPTED = { status: "accepted" as const };
const RESPONSE_CODE_SENT = "code_sent" as const;

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

type VerificationDelivery = { to: string; shopName: string; idempotencyKey: string } | null;
type CodeSentResult = {
  status: "sent";
  resendAvailableAt: number;
  codeExpiresAt: number;
  delivery: VerificationDelivery;
};
type CooldownResult = { status: "cooldown"; resendAvailableAt: number };
type StartVerificationResult = CodeSentResult | CooldownResult | { status: "unavailable" };
type ConfirmVerificationResult = { status: "verified" | "code_mismatch" | "code_unusable" | "unavailable" };
type ResendVerificationResult =
  | CodeSentResult
  | CooldownResult
  | { status: "unavailable" }
  | { status: "verification_unusable" }
  | { status: "send_limit" };

type StartVerificationArgs = {
  token: string;
  name: string;
  email: string;
  acceptedLegal: boolean;
  handleDigest: string;
  codeDigest: string;
};

const startVerificationRef = makeFunctionReference<"mutation", StartVerificationArgs, StartVerificationResult>(
  "staffRegistration/emailVerification:start",
) as unknown as FunctionReference<"mutation", "internal", StartVerificationArgs, StartVerificationResult>;

type ConfirmVerificationArgs = { token: string; handleDigest: string; codeDigest: string };

const confirmVerificationRef = makeFunctionReference<"mutation", ConfirmVerificationArgs, ConfirmVerificationResult>(
  "staffRegistration/emailVerification:confirm",
) as unknown as FunctionReference<"mutation", "internal", ConfirmVerificationArgs, ConfirmVerificationResult>;

type ResendVerificationArgs = { token: string; handleDigest: string; codeDigest: string };

const resendVerificationRef = makeFunctionReference<"mutation", ResendVerificationArgs, ResendVerificationResult>(
  "staffRegistration/emailVerification:resend",
) as unknown as FunctionReference<"mutation", "internal", ResendVerificationArgs, ResendVerificationResult>;

const releaseFailedSendRef = makeFunctionReference<"mutation", { handleDigest: string }, null>(
  "staffRegistration/emailVerification:releaseFailedSend",
) as unknown as FunctionReference<"mutation", "internal", { handleDigest: string }, null>;

type SendVerificationCodeEmailArgs = { to: string; shopName: string; code: string; idempotencyKey: string };
type SendVerificationCodeEmailResult = { status: "sent" | "delivery_failed" };

const sendVerificationCodeEmailRef = makeFunctionReference<
  "action",
  SendVerificationCodeEmailArgs,
  SendVerificationCodeEmailResult
>("staffRegistration/actions:sendVerificationCodeEmail") as unknown as FunctionReference<
  "action",
  "internal",
  SendVerificationCodeEmailArgs,
  SendVerificationCodeEmailResult
>;

const checkVerificationIngressRateLimitRef = makeFunctionReference<
  "mutation",
  { ipKey?: string },
  { allowed: boolean }
>("staffRegistration/emailVerification:checkIngressRateLimit") as unknown as FunctionReference<
  "mutation",
  "internal",
  { ipKey?: string },
  { allowed: boolean }
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

type JsonInput<T> = { ok: true; origin: string; input: T } | { ok: false; response: Response };

/** Origin、content type、body上限、schemaを、状態を読む前に検証する。 */
async function readJsonInput<T>(request: Request, schema: z.ZodType<T>): Promise<JsonInput<T>> {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return { ok: false, response: forbiddenOriginResponse() };
  const body = await readBoundedJsonBody(request, STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES);
  if (!body.ok && body.error === "unsupported_media_type") {
    return { ok: false, response: jsonResponse(origin, { error: "JSON形式で送信してください" }, { status: 415 }) };
  }
  if (!body.ok && body.error === "body_too_large") {
    return { ok: false, response: jsonResponse(origin, { error: "送信内容が大きすぎます。" }, { status: 413 }) };
  }
  if (!body.ok) {
    return { ok: false, response: jsonResponse(origin, { error: "送信内容を確認してください。" }, { status: 400 }) };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(body.rawBody) as unknown;
  } catch {
    return { ok: false, response: jsonResponse(origin, { error: "送信内容を確認してください。" }, { status: 400 }) };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        origin,
        { error: parsed.error.issues[0]?.message ?? "送信内容を確認してください。" },
        { status: 400 },
      ),
    };
  }
  return { ok: true, origin, input: parsed.data };
}

async function trustedClientIpKey(request: Request): Promise<{ ipKey?: string }> {
  const ip = trustedClientIp(request);
  return ip ? { ipKey: await hashStaffRegistrationRateLimitKey("ip", ip) } : {};
}

function rateLimitedResponse(origin: string) {
  return jsonResponse(
    origin,
    { error: "申請回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" },
    { status: 429 },
  );
}

function linkUnavailableResponse(origin: string) {
  return jsonResponse(origin, { error: "登録リンクの有効期限が切れています。" }, { status: 400 });
}

/** 端末の時計のずれに左右されないよう、絶対時刻ではなく残り時間を返す。 */
function remainingMs(until: number): number {
  return Math.max(0, until - Date.now());
}

function cooldownResponse(origin: string, resendAvailableAt: number) {
  return jsonResponse(
    origin,
    {
      error: "確認コードは1分に1回まで送れます。\n少し時間をおいて、もう一度お試しください。",
      code: "cooldown",
      resendAfterMs: remainingMs(resendAvailableAt),
    },
    { status: 429 },
  );
}

function sendFailedResponse(origin: string) {
  return jsonResponse(
    origin,
    { error: "確認コードを送れませんでした。\n少し時間をおいて、もう一度お試しください。" },
    { status: 503 },
  );
}

/**
 * 確認コードのメールを送る。送れなかった場合は、届いていないコードのために次の送信を待たせないよう状態を戻す。
 * 配信停止の宛先には送らず、公開応答は送れた場合と同じにする。
 */
async function deliverVerificationCode(
  ctx: ActionCtx,
  input: { delivery: VerificationDelivery; code: string; handleDigest: string },
): Promise<boolean> {
  if (!input.delivery) return true;
  let delivered = false;
  try {
    const result = await ctx.runAction(sendVerificationCodeEmailRef, { ...input.delivery, code: input.code });
    delivered = result.status === "sent";
  } catch {
    delivered = false;
  }
  if (delivered) return true;
  console.error("Staff registration verification email failed", {
    errorCode: "staff_registration_verification_email_failed",
  });
  await ctx.runMutation(releaseFailedSendRef, { handleDigest: input.handleDigest });
  return false;
}

function codeSentResponse(origin: string, result: CodeSentResult, extra: { verificationToken?: string } = {}) {
  return jsonResponse(origin, {
    status: RESPONSE_CODE_SENT,
    ...extra,
    resendAfterMs: remainingMs(result.resendAvailableAt),
    codeTtlMs: remainingMs(result.codeExpiresAt),
  });
}

/** 入力を確認待ちとして受け付け、確認コードを送る。申請はコードの照合後に作る。 */
export const start = httpAction(async (ctx, request) => {
  const json = await readJsonInput(request, submitStaffRegistrationSchema);
  if (!json.ok) return json.response;
  const { origin, input } = json;

  const ingressRateLimit = await ctx.runMutation(checkSubmissionIngressRateLimitRef, await trustedClientIpKey(request));
  if (!ingressRateLimit.allowed) return rateLimitedResponse(origin);

  try {
    const verified = await verifyTurnstile({
      token: input.turnstileToken,
      expectedAction: TURNSTILE_ACTION,
      origin,
      allowedOrigins: allowedOrigins(),
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

  const normalizedEmail = normalizeEmail(input.email);
  const rateLimitResult = await ctx.runMutation(checkSubmissionRateLimitRef, {
    token: input.token,
    emailKey: await staffRegistrationEmailRateLimitKey(input.token, normalizedEmail),
    linkKey: await hashStaffRegistrationRateLimitKey("link", input.token),
  });
  if (rateLimitResult.status === "rate_limited") return rateLimitedResponse(origin);
  if (rateLimitResult.status === "unavailable") return linkUnavailableResponse(origin);

  // 引換tokenは送信したブラウザだけに返し、確認コードは本人のメールだけに送る。DBにはどちらもdigestだけを渡す。
  const verificationToken = generateUUID();
  const code = generateVerificationCode();
  const handleDigest = await digestVerificationHandle(verificationToken);
  let result: StartVerificationResult;
  try {
    result = await ctx.runMutation(startVerificationRef, {
      token: input.token,
      name: input.name,
      email: normalizedEmail,
      acceptedLegal: input.acceptedLegal,
      handleDigest,
      codeDigest: await digestVerificationCode(handleDigest, code),
    });
  } catch {
    console.error("Staff registration verification start failed", {
      errorCode: "staff_registration_verification_start_failed",
    });
    return sendFailedResponse(origin);
  }
  if (result.status === "unavailable") return linkUnavailableResponse(origin);
  if (result.status === "cooldown") return cooldownResponse(origin, result.resendAvailableAt);
  if (!(await deliverVerificationCode(ctx, { delivery: result.delivery, code, handleDigest }))) {
    return sendFailedResponse(origin);
  }
  return codeSentResponse(origin, result, { verificationToken });
});

/** 確認コードを照合し、合えば参加申請を受け付ける。 */
export const confirm = httpAction(async (ctx, request) => {
  const json = await readJsonInput(request, confirmStaffRegistrationCodeSchema);
  if (!json.ok) return json.response;
  const { origin, input } = json;

  const ingressRateLimit = await ctx.runMutation(
    checkVerificationIngressRateLimitRef,
    await trustedClientIpKey(request),
  );
  if (!ingressRateLimit.allowed) return rateLimitedResponse(origin);

  const handleDigest = await digestVerificationHandle(input.verificationToken);
  let result: ConfirmVerificationResult;
  try {
    result = await ctx.runMutation(confirmVerificationRef, {
      token: input.token,
      handleDigest,
      codeDigest: await digestVerificationCode(handleDigest, input.code),
    });
  } catch {
    console.error("Staff registration verification confirm failed", {
      errorCode: "staff_registration_verification_confirm_failed",
    });
    return jsonResponse(origin, { error: "スタッフ登録を申請できませんでした。" }, { status: 503 });
  }

  if (result.status === "unavailable") return linkUnavailableResponse(origin);
  if (result.status === "code_mismatch") {
    return jsonResponse(
      origin,
      { error: "確認コードが違います。\nメールに届いた6桁の数字を確認してください。", code: "code_mismatch" },
      { status: 400 },
    );
  }
  if (result.status === "code_unusable") {
    return jsonResponse(
      origin,
      { error: "この確認コードは使えなくなりました。\n確認コードを再送してください。", code: "code_unusable" },
      { status: 400 },
    );
  }
  return jsonResponse(origin, RESPONSE_ACCEPTED);
});

/** 同じ宛先へ確認コードを送り直す。Turnstileは使わず、引換tokenと送信間隔・送信数の上限で抑える。 */
export const resend = httpAction(async (ctx, request) => {
  const json = await readJsonInput(request, resendStaffRegistrationCodeSchema);
  if (!json.ok) return json.response;
  const { origin, input } = json;

  const ingressRateLimit = await ctx.runMutation(
    checkVerificationIngressRateLimitRef,
    await trustedClientIpKey(request),
  );
  if (!ingressRateLimit.allowed) return rateLimitedResponse(origin);

  const code = generateVerificationCode();
  const handleDigest = await digestVerificationHandle(input.verificationToken);
  let result: ResendVerificationResult;
  try {
    result = await ctx.runMutation(resendVerificationRef, {
      token: input.token,
      handleDigest,
      codeDigest: await digestVerificationCode(handleDigest, code),
    });
  } catch {
    console.error("Staff registration verification resend failed", {
      errorCode: "staff_registration_verification_resend_failed",
    });
    return sendFailedResponse(origin);
  }

  if (result.status === "unavailable") return linkUnavailableResponse(origin);
  if (result.status === "cooldown") return cooldownResponse(origin, result.resendAvailableAt);
  if (result.status === "send_limit") {
    return jsonResponse(
      origin,
      { error: "確認コードを送れる回数の上限に達しました。\n入力からやり直してください。", code: "send_limit" },
      { status: 429 },
    );
  }
  if (result.status === "verification_unusable") {
    return jsonResponse(
      origin,
      { error: "確認コードを再送できなくなりました。\n入力からやり直してください。", code: "verification_unusable" },
      { status: 400 },
    );
  }
  if (!(await deliverVerificationCode(ctx, { delivery: result.delivery, code, handleDigest }))) {
    return sendFailedResponse(origin);
  }
  return codeSentResponse(origin, result);
});

export const options = httpAction(async (_ctx, request) => {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(origin)) return forbiddenOriginResponse();
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
});
