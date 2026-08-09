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

/**
 * ダークローンチ中に公開していない導線の設定。
 *
 * 未設定は閉じた状態として扱う。新しいdeploymentと設定漏れが閉じる側に倒れる。
 * 段階解放の順序と各段階の作業は`doc/plans/2026-07-25_ダークローンチ_実装計画.md`にある。
 */
function isFeatureEnabled(value: string | undefined): boolean {
  return (value ?? "").trim() === "enabled";
}

export function isOrganizationCreationEnabled(): boolean {
  return isFeatureEnabled(process.env.FEATURE_ORGANIZATION_CREATION);
}

export function isBillingEnabled(): boolean {
  return isFeatureEnabled(process.env.FEATURE_BILLING);
}

export function isManagerInvitationEnabled(): boolean {
  return isFeatureEnabled(process.env.FEATURE_MANAGER_INVITATION);
}

export type FeatureVisibility = {
  organizationSettingsNavigation: boolean;
  billing: boolean;
  shopMembershipAddition: boolean;
};

/**
 * 認証後のUIが参照する公開状態を、一度のqueryで返せる形へ集約する。
 * 店舗管理は常時公開し、旧frontend互換の表示DTOにもtrueを返す。
 */
export function getFeatureVisibility(): FeatureVisibility {
  const billing = isBillingEnabled();

  return {
    organizationSettingsNavigation: true,
    billing,
    shopMembershipAddition: true,
  };
}

export function getOrganizationInvitationSigningSecret(): string {
  const secret = (process.env.ORGANIZATION_INVITATION_SIGNING_SECRET ?? "").trim();
  if (secret.length < 32) {
    throw new Error("ORGANIZATION_INVITATION_SIGNING_SECRET is not configured");
  }
  return secret;
}
