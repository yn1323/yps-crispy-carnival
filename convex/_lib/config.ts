import { env } from "../_generated/server";

export function getAppUrl(): string {
  return process.env.APP_URL ?? "https://shiftori.app";
}

export const APP_URL = getAppUrl();
export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@shiftori.app";

export function getContactRecipientEmail(): string {
  return (process.env.CONTACT_RECIPIENT_EMAIL ?? "").trim();
}

export function getContactSlackWebhookUrl(): string {
  return (process.env.SLACK_CONTACT_WEBHOOK_URL ?? "").trim();
}

export function getTurnstileSecretKey(): string {
  return (process.env.TURNSTILE_SECRET_KEY ?? "").trim();
}

export function getContactAllowedOrigins(): string[] {
  return (process.env.CONTACT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getStaffRegistrationAllowedOrigins(): string[] {
  return (process.env.STAFF_REGISTRATION_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getStaffRegistrationTrustedIpHeader(): "cf-connecting-ip" | null {
  return process.env.STAFF_REGISTRATION_TRUSTED_IP_HEADER?.trim().toLowerCase() === "cf-connecting-ip"
    ? "cf-connecting-ip"
    : null;
}

export type DebugNotificationDeliveryMode = "live" | "dry-run" | "force-failure";

export function isDebugModeEnabled(): boolean {
  const rawDebugMode = env.DEBUG_MODE?.trim() ?? "";
  if (!rawDebugMode || rawDebugMode === "false") return false;
  if (rawDebugMode === "true") return true;
  throw new Error("DEBUG_MODE must be either true or false");
}

function normalizeDeploymentUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function getDebugNotificationDeliveryMode(): DebugNotificationDeliveryMode {
  const debugModeEnabled = isDebugModeEnabled();
  const rawDeliveryMode = env.DEBUG_NOTIFICATION_DELIVERY_MODE?.trim() ?? "";
  if (!rawDeliveryMode) return "live";
  if (!debugModeEnabled) {
    throw new Error("DEBUG_NOTIFICATION_DELIVERY_MODE requires DEBUG_MODE=true");
  }
  if (rawDeliveryMode !== "dry-run" && rawDeliveryMode !== "force-failure") {
    throw new Error("DEBUG_NOTIFICATION_DELIVERY_MODE must be dry-run or force-failure");
  }
  return rawDeliveryMode;
}

export function getPromotionComplimentaryProCode(): string | undefined {
  const value = env.PROMOTION_COMPLIMENTARY_PRO_CODE?.trim().toUpperCase();
  return value || undefined;
}

export type DevelopmentSeedConfiguration = {
  enabled: boolean;
  currentDeploymentUrl: string;
  primaryAuthTokenIdentifier: string;
};

function normalizeClerkIssuer(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? "");
    if (url.protocol !== "https:" || (url.pathname !== "/" && url.pathname !== "")) return null;
    if (url.search || url.hash || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function assertDevelopmentSeedPrimaryAuthTokenIdentifier(value: string): string {
  const expectedIssuer = normalizeClerkIssuer(env.CLERK_JWT_ISSUER_DOMAIN);
  if (!expectedIssuer) {
    throw new Error("Development seed Clerk issuer is not configured");
  }

  const parts = value.split("|");
  if (parts.length !== 2) {
    throw new Error("Development seed primary auth token identifier is invalid");
  }
  const [rawIssuer, subject] = parts;
  const issuer = normalizeClerkIssuer(rawIssuer);
  if (!issuer || rawIssuer !== issuer || !/^user_[A-Za-z0-9]+$/.test(subject)) {
    throw new Error("Development seed primary auth token identifier is invalid");
  }
  if (issuer !== expectedIssuer) {
    throw new Error("Development seed primary auth token identifier issuer does not match");
  }
  return value;
}

/**
 * 全tableを置換する開発用seedのserver-side gate。
 * internal functionも誤ったdeploymentから実行され得るため、各entrypointで毎回再確認する。
 */
export function getDevelopmentSeedConfiguration(): DevelopmentSeedConfiguration {
  return {
    enabled: isDebugModeEnabled(),
    currentDeploymentUrl: normalizeDeploymentUrl(env.CONVEX_CLOUD_URL),
    primaryAuthTokenIdentifier: (env.DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER ?? "").trim(),
  };
}

export function assertDevelopmentSeedEnabled(): DevelopmentSeedConfiguration {
  const configuration = getDevelopmentSeedConfiguration();
  if (!configuration.enabled) {
    throw new Error("Development seed is disabled");
  }
  if (!configuration.primaryAuthTokenIdentifier) {
    throw new Error("Development seed primary auth token identifier is not configured");
  }
  return {
    ...configuration,
    primaryAuthTokenIdentifier: assertDevelopmentSeedPrimaryAuthTokenIdentifier(
      configuration.primaryAuthTokenIdentifier,
    ),
  };
}

/**
 * DEBUG_MODEで明示的に有効化した、開発用Trial期間だけを返す。
 */
export function getDebugTrialDurationDays(): number | undefined {
  const debugModeEnabled = isDebugModeEnabled();
  const rawDurationDays = env.DEBUG_TRIAL_DURATION_DAYS?.trim();
  if (!rawDurationDays) {
    return undefined;
  }
  if (!debugModeEnabled) {
    throw new Error("DEBUG_TRIAL_DURATION_DAYS requires DEBUG_MODE=true");
  }

  const durationDays = Number(rawDurationDays);
  if (!/^[1-9]\d*$/.test(rawDurationDays) || !Number.isSafeInteger(durationDays) || durationDays > 30) {
    throw new RangeError("DEBUG_TRIAL_DURATION_DAYS must be an integer between 1 and 30");
  }

  return durationDays;
}

export function getOrganizationInvitationSigningSecret(): string {
  const secret = (process.env.ORGANIZATION_INVITATION_SIGNING_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new Error("ORGANIZATION_INVITATION_SIGNING_SECRET is not configured");
  }
  return secret;
}
