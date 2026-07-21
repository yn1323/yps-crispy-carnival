import { getAppUrl, getTurnstileSecretKey } from "./config";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 8_000;
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";

type TurnstileResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
};

function isLocalOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function verifyTurnstile(input: {
  token: string;
  expectedAction: string;
  origin: string;
  allowedOrigins: ReadonlySet<string>;
}): Promise<boolean> {
  const secret = getTurnstileSecretKey();
  if (!secret) throw new Error("turnstile_not_configured");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TURNSTILE_TIMEOUT_MS);
  try {
    const body = new FormData();
    body.set("secret", secret);
    body.set("response", input.token);
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!response.ok) return false;

    const result = (await response.json()) as TurnstileResponse;
    if (result.success !== true) return false;

    // 公式always-pass keyはexample.comを返すため、localhost同士の開発時だけaction/hostname照合を省略する。
    const isLocalTest =
      secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET && isLocalOrigin(getAppUrl()) && isLocalOrigin(input.origin);
    if (isLocalTest) return true;

    if (result.action !== input.expectedAction || !result.hostname) return false;
    const allowedHostnames = new Set([...input.allowedOrigins].map((origin) => new URL(origin).hostname));
    return allowedHostnames.has(result.hostname);
  } finally {
    clearTimeout(timeoutId);
  }
}
