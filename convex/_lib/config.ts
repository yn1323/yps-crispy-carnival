import { env } from "../_generated/server";
import { AI_SHIFT_DRAFT_RECRUITMENT_LIMIT_DEFAULT, AI_SHIFT_DRAFT_RECRUITMENT_LIMIT_MAX } from "../constants";

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
  // Node workerではprocess.env自体が差し替わるため、通知のデバッグ設定は保持済みのenvを参照しない。
  const rawDebugMode = process.env.DEBUG_MODE?.trim() ?? "";
  if (!rawDebugMode || rawDebugMode === "false") return false;
  if (rawDebugMode === "true") return true;
  throw new Error("DEBUG_MODE must be either true or false");
}

function normalizeDeploymentUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, "") ?? "";
}

export function getDebugNotificationDeliveryMode(): DebugNotificationDeliveryMode {
  const debugModeEnabled = isDebugModeEnabled();
  const rawDeliveryMode = process.env.DEBUG_NOTIFICATION_DELIVERY_MODE?.trim() ?? "";
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

export type ShiftSetupAssistMode = "off" | "random";

/**
 * 「必要人数設定」のAIサポート。未設定の環境では出さない。
 * "random"は実際のAIにつながず、必要人数をランダムな値で埋める仮の処理を使う。
 * 根拠のない人数を店舗へ見せないため、Productionでは設定しない。
 */
export function getShiftSetupAssistMode(): ShiftSetupAssistMode {
  const rawMode = env.SHIFT_SETUP_ASSIST_MODE?.trim() ?? "";
  if (!rawMode) return "off";
  if (rawMode === "random") return "random";
  throw new Error("SHIFT_SETUP_ASSIST_MODE must be random or unset");
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

export const AI_SHIFT_DRAFT_EFFORTS = ["low", "medium", "high"] as const;
export type AiShiftDraftEffort = (typeof AI_SHIFT_DRAFT_EFFORTS)[number];

/**
 * "revise"は、決まった手順で作った下書きを、AIがメモを読んで見直す。既定の作り方である。
 * "scratch"は、AIが希望と必要人数とメモから、勤務を一から作る。比べるために残している。
 */
export const AI_SHIFT_DRAFT_MODES = ["scratch", "revise"] as const;
export type AiShiftDraftMode = (typeof AI_SHIFT_DRAFT_MODES)[number];

export type AiShiftDraftSettings = {
  /** 作り方。 */
  mode: AiShiftDraftMode;
  /** 呼び出すモデルのID。 */
  model: string;
  /** 考える量。多いほど決まりを守りやすく、遅く、高くなる。 */
  effort: AiShiftDraftEffort;
  /** 1回の返答の上限。考える分も含むため、返す勤務の量より大きく取る。 */
  maxTokens: number;
  /** 一から作る場合に、1回の呼び出しで作る日数。0なら、募集期間をまとめて1回で送る。 */
  daysPerRequest: number;
};

// 考える量は、試した範囲では"low"で結果が変わらず、待ち時間が半分になったため、"low"を既定にする。
// 作り方は、決まった手順の下書きを見直す形を既定にする。一から作る形は、大きな募集で足りない時間が決まった手順の約2.8倍残った。
const AI_SHIFT_DRAFT_DEFAULTS: AiShiftDraftSettings = {
  mode: "revise",
  model: "claude-haiku-5-5",
  effort: "low",
  maxTokens: 16000,
  // 一から作る形で大きな募集を1回で送ると、どのモデルも数件だけ書いて終えた。1日分なら書き切れたため、1日ごとに分ける。
  daysPerRequest: 1,
};
/**
 * 1つの募集（シフト）でAIが作成できる回数。環境変数のAI_SHIFT_DRAFT_RECRUITMENT_LIMITで決め、設定していなければ既定の値を使う。
 * 0にすると、どの募集でもAIを使えない。想定しない値は、黙って既定に戻さずに失敗させる。
 * 回数はqueryとmutationでも読む。Nodeのactionと同じ値になるよう、process.envを読む。
 */
export function getAiShiftDraftRecruitmentLimit(): number {
  const raw = process.env.AI_SHIFT_DRAFT_RECRUITMENT_LIMIT?.trim();
  if (!raw) return AI_SHIFT_DRAFT_RECRUITMENT_LIMIT_DEFAULT;
  const limit = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (!Number.isInteger(limit) || limit > AI_SHIFT_DRAFT_RECRUITMENT_LIMIT_MAX) {
    throw new Error(
      `AI_SHIFT_DRAFT_RECRUITMENT_LIMIT must be an integer between 0 and ${AI_SHIFT_DRAFT_RECRUITMENT_LIMIT_MAX}`,
    );
  }
  return limit;
}

/** 返答の上限として設定できる最大の値。モデルが1回に返せる量に合わせる。 */
const AI_SHIFT_DRAFT_MAX_TOKENS_LIMIT = 128000;

/**
 * シフトのAI作成の設定。作り方、モデル、考える量、返答の上限を、1つずつ別の環境変数で持つ。
 * 設定していない項目は既定の値を使う。想定しない値は、黙って既定に戻さずに失敗させる。
 * AIを呼ぶactionはNodeで動く。Nodeではprocess.env自体が差し替わるため、保持済みのenvを参照しない。
 * 保持済みのenvを読むと、環境変数を変えたあとも、変える前の値で呼び続ける。
 */
export function getAiShiftDraftSettings(): AiShiftDraftSettings {
  const model = process.env.AI_SHIFT_DRAFT_MODEL?.trim() || AI_SHIFT_DRAFT_DEFAULTS.model;
  if (!/^claude-[a-z0-9-]+$/.test(model)) throw new Error("AI_SHIFT_DRAFT_MODEL must be a Claude model ID");

  const rawMode = process.env.AI_SHIFT_DRAFT_MODE?.trim() || AI_SHIFT_DRAFT_DEFAULTS.mode;
  const mode = AI_SHIFT_DRAFT_MODES.find((value) => value === rawMode);
  if (!mode) throw new Error("AI_SHIFT_DRAFT_MODE must be scratch or revise");

  const rawEffort = process.env.AI_SHIFT_DRAFT_EFFORT?.trim() || AI_SHIFT_DRAFT_DEFAULTS.effort;
  const effort = AI_SHIFT_DRAFT_EFFORTS.find((value) => value === rawEffort);
  if (!effort) throw new Error("AI_SHIFT_DRAFT_EFFORT must be low, medium, or high");

  const rawMaxTokens = process.env.AI_SHIFT_DRAFT_MAX_TOKENS?.trim();
  const maxTokens = rawMaxTokens ? Number(rawMaxTokens) : AI_SHIFT_DRAFT_DEFAULTS.maxTokens;
  if (
    (rawMaxTokens && !/^[1-9]\d*$/.test(rawMaxTokens)) ||
    !Number.isSafeInteger(maxTokens) ||
    maxTokens < 1024 ||
    maxTokens > AI_SHIFT_DRAFT_MAX_TOKENS_LIMIT
  ) {
    throw new RangeError(
      `AI_SHIFT_DRAFT_MAX_TOKENS must be an integer between 1024 and ${AI_SHIFT_DRAFT_MAX_TOKENS_LIMIT}`,
    );
  }

  const rawDays = process.env.AI_SHIFT_DRAFT_DAYS_PER_REQUEST?.trim();
  const daysPerRequest = rawDays ? Number(rawDays) : AI_SHIFT_DRAFT_DEFAULTS.daysPerRequest;
  if ((rawDays && !/^\d+$/.test(rawDays)) || !Number.isSafeInteger(daysPerRequest) || daysPerRequest > 31) {
    throw new RangeError("AI_SHIFT_DRAFT_DAYS_PER_REQUEST must be an integer between 0 and 31");
  }

  return { mode, model, effort, maxTokens, daysPerRequest };
}

/**
 * シフトのAI作成を使える環境か。APIキーのない環境では、画面で選べなくし、サーバーでも断る。
 */
export function isAiShiftDraftConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

export function getAnthropicApiKey(): string {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  return apiKey;
}
