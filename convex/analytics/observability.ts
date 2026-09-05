const SAFE_CODES = new Set([
  "analytics_state_missing",
  "analytics_definition_mismatch",
  "analytics_run_invariant_failed",
  "analytics_shop_day_duplicate",
  "analytics_retention_expired",
  "analytics_run_stale",
]);

export function safeAnalyticsErrorCode(error: unknown): string {
  if (error instanceof Error) {
    for (const code of error.message.match(/analytics_[a-z0-9_]+/g) ?? []) {
      if (SAFE_CODES.has(code)) return code;
    }
  }
  return "analytics_unexpected";
}
