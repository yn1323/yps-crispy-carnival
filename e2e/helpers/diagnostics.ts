const EMAIL_PATTERN = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const CLERK_IDENTIFIER_PATTERN = /\b(?:client|dvb|email_address|idn|ins|sess|user)_[A-Za-z0-9_-]{8,}\b/g;
const URL_QUERY_PATTERN = /((?:https?:\/\/[^\s"'<>]+|\/[A-Za-z0-9_./-]+))\?[^\s"'<>]*/g;
const QUOTED_SENSITIVE_FIELD_PATTERN =
  /(["'](?:authorization|token|secret|session|credential)["']\s*[:=]\s*)["'][^"'\\]*(?:\\.[^"'\\]*)*["']/gi;
const AUTHORIZATION_PATTERN = /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const TOKEN_FIELD_PATTERN = /\b(token|secret|session|credential)\s*[:=]\s*[^\s,;]+/gi;
const MAX_MESSAGE_INPUT_LENGTH = 10_000;
const MAX_MESSAGE_LENGTH = 500;

export type E2EFailureCategory =
  | "auth"
  | "browser-runtime"
  | "capability-deadline"
  | "date-time"
  | "external-environment"
  | "occ"
  | "product-regression"
  | "seed-reset"
  | "selector-state"
  | "unknown"
  | "workflow-concurrency";

export function sanitizeDiagnosticMessage(message: string) {
  return message
    .slice(0, MAX_MESSAGE_INPUT_LENGTH)
    .replace(URL_QUERY_PATTERN, "$1?[redacted]")
    .replace(EMAIL_PATTERN, "[email-redacted]")
    .replace(JWT_PATTERN, "[jwt-redacted]")
    .replace(CLERK_IDENTIFIER_PATTERN, "[clerk-id-redacted]")
    .replace(QUOTED_SENSITIVE_FIELD_PATTERN, '$1"[redacted]"')
    .replace(AUTHORIZATION_PATTERN, "authorization=[redacted]")
    .replace(TOKEN_FIELD_PATTERN, "$1=[redacted]")
    .slice(0, MAX_MESSAGE_LENGTH);
}

export function installSafeClerkTestingConsole() {
  const originalWarn = console.warn;
  const safeWarn = (...values: unknown[]) => {
    const isClerkTestingMessage = values.some(
      (value) => typeof value === "string" && value.includes("[Clerk Testing]"),
    );
    if (!isClerkTestingMessage) {
      originalWarn(...values);
      return;
    }
    originalWarn(
      ...values.map((value) => sanitizeDiagnosticMessage(value instanceof Error ? value.message : String(value))),
    );
  };
  console.warn = safeWarn;
  return () => {
    if (console.warn === safeWarn) console.warn = originalWarn;
  };
}

export function getSafePathname(rawUrl: string) {
  try {
    return new URL(rawUrl).pathname;
  } catch {
    return "invalid-url";
  }
}

export function classifyE2EFailure(message: string): E2EFailureCategory {
  const normalized = message.toLowerCase();
  if (/optimisticconcurrency|\bocc\b/.test(normalized)) return "occ";
  if (/cancelled run|concurrency group|preview.*sha/.test(normalized)) return "workflow-concurrency";
  if (/clerk|sign.?in|auth|login/.test(normalized)) return "auth";
  if (/capability|magic.?link|poll deadline/.test(normalized)) return "capability-deadline";
  if (/seed|reset/.test(normalized)) return "seed-reset";
  if (/timezone|date|deadline|jst/.test(normalized)) return "date-time";
  if (/locator|expect\(|waiting for|timeout.*visible|strict mode/.test(normalized)) return "selector-state";
  if (/page crashed|browser has been closed|pageerror/.test(normalized)) return "browser-runtime";
  if (/convex command failed|econn|dns|service unavailable|deployment/.test(normalized)) return "external-environment";
  if (/assert|expected|received/.test(normalized)) return "product-regression";
  return "unknown";
}
