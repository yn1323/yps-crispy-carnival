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

export type FeatureVisibility = {
  organizationSettingsNavigation: boolean;
  billing: boolean;
  shopMembershipAddition: boolean;
};

export type ReleaseFeatureVisibility = {
  organizationCreation: boolean;
  shopAddition: boolean;
  managerInvitation: boolean;
  billing: boolean;
};

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/** 未設定を含むすべての値を閉じる、未リリース機能のserver-side正本。 */
export function getReleaseFeatureVisibility(): ReleaseFeatureVisibility {
  return {
    organizationCreation: isExplicitlyEnabled(process.env.FEATURE_ORGANIZATION_CREATION),
    shopAddition: isExplicitlyEnabled(process.env.FEATURE_SHOP_ADDITION),
    managerInvitation: isExplicitlyEnabled(process.env.FEATURE_MANAGER_INVITATION),
    billing: isExplicitlyEnabled(process.env.FEATURE_BILLING),
  };
}

/** 旧frontend互換の表示DTO。操作の許可判定には使わない。 */
export function getFeatureVisibility(): FeatureVisibility {
  const features = getReleaseFeatureVisibility();
  return {
    organizationSettingsNavigation:
      features.organizationCreation || features.shopAddition || features.managerInvitation || features.billing,
    billing: features.billing,
    shopMembershipAddition: features.shopAddition,
  };
}

export function getOrganizationInvitationSigningSecret(): string {
  const secret = (process.env.ORGANIZATION_INVITATION_SIGNING_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new Error("ORGANIZATION_INVITATION_SIGNING_SECRET is not configured");
  }
  return secret;
}
