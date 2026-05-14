const SUPPRESSED_DELIVERY_MODES = new Set(["dry-run", "disabled", "mock"]);

type SuppressionOptions = {
  suppressDelivery?: boolean;
};

/**
 * 通知送信の最終ゲート。
 * action 単位の明示抑制と環境全体の delivery mode の両方をここに集約し、
 * Resend / LINE クライアント側で送信直前に同じ判定を使う。
 */
export function isNotificationDeliverySuppressed(options: SuppressionOptions = {}): boolean {
  return (
    Boolean(options.suppressDelivery) || SUPPRESSED_DELIVERY_MODES.has(process.env.NOTIFICATION_DELIVERY_MODE ?? "")
  );
}

/**
 * dry-run 対象店舗の判定。
 * E2E や検証用アカウントでは manager email にランダム suffix が付くことがあるため、
 * 完全一致ではなく部分一致で運用側の allowlist に寄せる。
 */
export function isDryRunManagerEmail(managerEmail: string | undefined | null): boolean {
  const normalizedManagerEmail = managerEmail?.trim().toLowerCase();
  if (!normalizedManagerEmail) return false;

  return (process.env.NOTIFICATION_DRY_RUN_USER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => normalizedManagerEmail.includes(entry));
}

export function logSuppressedNotification(kind: string, metadata: Record<string, unknown>): void {
  console.log(`[notification:dry-run] ${kind}`, metadata);
}
