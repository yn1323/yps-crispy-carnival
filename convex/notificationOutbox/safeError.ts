export const SAFE_NOTIFICATION_ERROR_CODES = [
  "line_rate_limited",
  "line_provider_unavailable",
  "line_recipient_rejected",
  "line_quota_exceeded",
  "line_quota_fallback_enqueued",
  "email_rate_limited",
  "email_provider_unavailable",
  "email_recipient_rejected",
  "email_delivery_delayed",
  "email_delivery_failed",
  "email_delivery_bounced",
  "email_delivery_suppressed",
  "notification_enqueue_failed",
  "notification_preparation_failed",
  "notification_worker_failed",
  "notification_delivery_failed",
] as const;

export type SafeNotificationErrorCode = (typeof SAFE_NOTIFICATION_ERROR_CODES)[number];

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  retryable?: unknown;
  errorName?: unknown;
  deliveryCause?: unknown;
};

const SAFE_NOTIFICATION_ERROR_CODE_SET = new Set<string>(SAFE_NOTIFICATION_ERROR_CODES);

/**
 * Providerのresponse bodyや例外messageを永続化・ログ出力せず、固定taxonomyへ落とす。
 * retry可否の判断は呼び出し元が生の例外で先に行い、この結果は監査metadataだけに使う。
 */
export function safeNotificationError(
  error: unknown,
  fallback: SafeNotificationErrorCode = "notification_delivery_failed",
): { code: SafeNotificationErrorCode } {
  if (isErrorLike(error) && error.deliveryCause !== undefined) {
    const cause = safeNotificationError(error.deliveryCause, fallback);
    return cause.code === fallback ? { code: "line_provider_unavailable" } : cause;
  }

  if (typeof error === "string") {
    if (isSafeNotificationErrorCode(error)) return { code: error };
    if (error === "LINE quota exceeded; fallback email enqueued") {
      return { code: "line_quota_fallback_enqueued" };
    }
    if (error === "LINE quota exceeded") return { code: "line_quota_exceeded" };
    return { code: fallback };
  }
  if (!isErrorLike(error)) return { code: fallback };

  if (error.name === "LineApiError") {
    const status = finiteNumber(error.status);
    if (status === 429) return { code: "line_rate_limited" };
    if (status !== null && status >= 500) return { code: "line_provider_unavailable" };
    if (status !== null && status >= 400) return { code: "line_recipient_rejected" };
    return { code: "notification_delivery_failed" };
  }

  if (error.name === "ResendEmailError") {
    const providerCode = typeof error.errorName === "string" ? error.errorName : "";
    if (providerCode === "email_rate_limited" || providerCode === "rate_limit_exceeded") {
      return { code: "email_rate_limited" };
    }
    if (error.retryable === true || finiteNumber(error.statusCode) === null) {
      return { code: "email_provider_unavailable" };
    }
    return { code: "email_recipient_rejected" };
  }

  if (typeof error.message === "string") {
    if (isSafeNotificationErrorCode(error.message)) return { code: error.message };
    if (error.message === "LINE quota exceeded; fallback email enqueued") {
      return { code: "line_quota_fallback_enqueued" };
    }
    if (error.message === "LINE quota exceeded") {
      return { code: "line_quota_exceeded" };
    }
  }

  return { code: fallback };
}

/** Persistence境界でもallowlist外の文字列を固定値へ置換する。 */
export function safeStoredNotificationError(
  errorMessage: string,
  fallback: SafeNotificationErrorCode = "notification_delivery_failed",
): SafeNotificationErrorCode {
  return isSafeNotificationErrorCode(errorMessage) ? errorMessage : fallback;
}

export function isSafeNotificationErrorCode(value: string): value is SafeNotificationErrorCode {
  return SAFE_NOTIFICATION_ERROR_CODE_SET.has(value);
}

function isErrorLike(value: unknown): value is ErrorLike {
  return value !== null && typeof value === "object";
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
