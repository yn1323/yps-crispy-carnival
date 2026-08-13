import { ConvexError } from "convex/values";
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

/**
 * LINE連携の組織人物単位への切替完了後だけ、複数店舗のwriterを開放する。
 * 値の推測やtruthy判定を避け、deploymentごとの明示設定がない場合は閉じる。
 */
export function isLineCommonLinkCanonicalReady(): boolean {
  return env.LINE_COMMON_LINK_CANONICAL_READY?.trim() === "enabled";
}

/** staged rolloutのread authority。readiness完了まで旧行を正とし、未設定は安全側に倒す。 */
export function useCanonicalLineCommonLinkReads(): boolean {
  return env.LINE_COMMON_LINK_CANONICAL_READS?.trim() === "enabled";
}

export function requireShopMembershipAdditionEnabled(): void {
  if (!isLineCommonLinkCanonicalReady()) {
    throw new ConvexError(
      "現在、店舗や所属を追加できません。画面を再読み込みして、しばらくしてからもう一度お試しください。",
    );
  }
}

/** 旧frontend互換の表示DTO。複数店舗関連の入口はserver-side gateと同じ値を返す。 */
export function getFeatureVisibility(): FeatureVisibility {
  return {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: isLineCommonLinkCanonicalReady(),
  };
}

export function getOrganizationInvitationSigningSecret(): string {
  const secret = (process.env.ORGANIZATION_INVITATION_SIGNING_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new Error("ORGANIZATION_INVITATION_SIGNING_SECRET is not configured");
  }
  return secret;
}
