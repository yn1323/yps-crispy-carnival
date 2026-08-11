import { stripVTControlCharacters } from "node:util";

const EMAIL_PATTERN = /[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const CLERK_IDENTIFIER_PATTERN = /\b(?:client|dvb|email_address|idn|ins|sess|user)_[A-Za-z0-9_-]{8,}\b/g;
const URL_QUERY_PATTERN = /((?:https?:\/\/[^\s"'<>]+|\/[A-Za-z0-9_./-]+))\?[^\s"'<>]*/g;
const QUOTED_SENSITIVE_FIELD_PATTERN =
  /(["'](?:authorization|token|secret|session|credential)["']\s*[:=]\s*)["'][^"'\\]*(?:\\.[^"'\\]*)*["']/gi;
const AUTHORIZATION_PATTERN = /\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi;
const TOKEN_FIELD_PATTERN = /\b(token|secret|session|credential)\s*[:=]\s*[^\s,;]+/gi;
const SECRET_ENV_IDENTIFIER_PATTERN =
  /\b(?:ANTHROPIC_API_KEY|CLERK_SECRET_KEY|CLOUDFLARE_API_TOKEN|CONVEX_DEPLOY_KEY|CONVEX_MANAGEMENT_TOKEN|HOSTING_PAGES_TOKEN|LINE_CHANNEL_ACCESS_TOKEN|LINE_CHANNEL_SECRET|ORGANIZATION_INVITATION_SIGNING_SECRET|REG_SUIT_CLIENT_ID|REPORT_PUBLISHER_HOSTING_PAGES_TOKEN|RESEND_API_KEY|SLACK_WEBHOOK_URL|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\b/g;
const MAX_MESSAGE_LENGTH = 500;
const MAX_ARTIFACT_ERROR_FIELD_LENGTH = 20_000;

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

function redactSensitiveText(message: string) {
  // Playwrightのmatcherは値の途中にもANSI装飾を挿入するため、pattern照合より先に除去する。
  let redacted = stripVTControlCharacters(message)
    .replace(URL_QUERY_PATTERN, "$1?[redacted]")
    .replace(EMAIL_PATTERN, "[email-redacted]")
    .replace(JWT_PATTERN, "[jwt-redacted]")
    .replace(CLERK_IDENTIFIER_PATTERN, "[clerk-id-redacted]")
    .replace(QUOTED_SENSITIVE_FIELD_PATTERN, '$1"[redacted]"')
    .replace(AUTHORIZATION_PATTERN, "authorization=[redacted]")
    .replace(TOKEN_FIELD_PATTERN, "$1=[redacted]")
    .replace(SECRET_ENV_IDENTIFIER_PATTERN, "[secret-env-redacted]");
  const configuredValues = [
    process.env.E2E_CLERK_PASSWORD,
    ...(process.env.E2E_CLERK_USERS ?? "").split(",").map((value) => value.trim()),
  ].filter((value): value is string => typeof value === "string" && value.length >= 8);
  for (const value of configuredValues) redacted = redacted.replaceAll(value, "[configured-value-redacted]");
  return redacted;
}

export function sanitizeDiagnosticMessage(message: string) {
  return redactSensitiveText(message).slice(0, MAX_MESSAGE_LENGTH);
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

type MutableE2EArtifactError = {
  cause?: MutableE2EArtifactError;
  errorContext?: string;
  message?: string;
  snippet?: string;
  stack?: string;
  value?: string;
};

export function sanitizeE2EArtifactErrors(errors: ReadonlyArray<MutableE2EArtifactError>) {
  const sanitizeField = (value: string | undefined) =>
    value === undefined ? undefined : redactSensitiveText(value).slice(0, MAX_ARTIFACT_ERROR_FIELD_LENGTH);
  const sanitizeError = (error: MutableE2EArtifactError) => {
    Reflect.deleteProperty(error, "errorContext");
    error.message = sanitizeField(error.message);
    error.snippet = sanitizeField(error.snippet);
    error.stack = sanitizeField(error.stack);
    error.value = sanitizeField(error.value);
    if (error.cause) sanitizeError(error.cause);
  };

  for (const error of errors) sanitizeError(error);
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
  if (
    /page crashed|browser has been closed|pageerror|browser runtime signals|console-error|same-origin-5xx/.test(
      normalized,
    )
  ) {
    return "browser-runtime";
  }
  if (/convex command failed|econn|dns|service unavailable|deployment/.test(normalized)) return "external-environment";
  if (/assert|expected|received/.test(normalized)) return "product-regression";
  return "unknown";
}
