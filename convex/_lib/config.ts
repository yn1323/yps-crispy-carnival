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

export function isDebugNotifyFailEnabled(): boolean {
  return (process.env.DEBUG_NOTIFY_FAIL ?? "").trim().length > 0;
}

function normalizeDeploymentUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function getNotificationDeliveryMode(): string {
  return (process.env.NOTIFICATION_DELIVERY_MODE ?? "").trim().toLowerCase();
}

export type DevelopmentSeedConfiguration = {
  enabled: boolean;
  currentDeploymentUrl: string;
  targetDeploymentUrl: string;
  notificationDeliveryMode: string;
};

/**
 * 全tableを置換する開発用seedのserver-side gate。
 * internal functionも誤ったdeploymentから実行され得るため、各entrypointで毎回再確認する。
 */
export function getDevelopmentSeedConfiguration(): DevelopmentSeedConfiguration {
  return {
    enabled: process.env.DEVELOPMENT_SEED_ENABLED === "true",
    currentDeploymentUrl: normalizeDeploymentUrl(process.env.CONVEX_CLOUD_URL),
    targetDeploymentUrl: normalizeDeploymentUrl(process.env.DEVELOPMENT_SEED_DEPLOYMENT_URL),
    notificationDeliveryMode: getNotificationDeliveryMode(),
  };
}

export function assertDevelopmentSeedEnabled(): DevelopmentSeedConfiguration {
  const configuration = getDevelopmentSeedConfiguration();
  if (!configuration.enabled) {
    throw new Error("Development seed is disabled");
  }
  if (
    !configuration.currentDeploymentUrl ||
    !configuration.targetDeploymentUrl ||
    configuration.currentDeploymentUrl !== configuration.targetDeploymentUrl
  ) {
    throw new Error("Development seed deployment does not match");
  }
  if (configuration.notificationDeliveryMode !== "dry-run") {
    throw new Error("Development seed requires notification dry-run mode");
  }
  return configuration;
}

/**
 * 対象deploymentへ明示的に結び付けた、開発用Trial期間だけを返す。
 * URL不一致では日数を解釈せず、通常のTrial期間へ戻す。
 */
export function getDebugTrialDurationDays(): number | undefined {
  const currentDeploymentUrl = normalizeDeploymentUrl(process.env.CONVEX_CLOUD_URL);
  const debugDeploymentUrl = normalizeDeploymentUrl(env.DEBUG_TRIAL_DURATION_DEPLOYMENT_URL);
  if (!currentDeploymentUrl || !debugDeploymentUrl || currentDeploymentUrl !== debugDeploymentUrl) {
    return undefined;
  }

  const rawDurationDays = env.DEBUG_TRIAL_DURATION_DAYS?.trim();
  if (!rawDurationDays) {
    return undefined;
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
