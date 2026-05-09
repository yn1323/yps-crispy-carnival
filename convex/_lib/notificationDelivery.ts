const SUPPRESSED_DELIVERY_MODES = new Set(["dry-run", "disabled", "mock"]);

type SuppressionOptions = {
  suppressDelivery?: boolean;
};

export function isNotificationDeliverySuppressed(options: SuppressionOptions = {}): boolean {
  return (
    Boolean(options.suppressDelivery) || SUPPRESSED_DELIVERY_MODES.has(process.env.NOTIFICATION_DELIVERY_MODE ?? "")
  );
}

export function isDryRunOwnerEmail(ownerEmail: string | undefined | null): boolean {
  const normalizedOwnerEmail = ownerEmail?.trim().toLowerCase();
  if (!normalizedOwnerEmail) return false;

  return (process.env.NOTIFICATION_DRY_RUN_USER_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => normalizedOwnerEmail.includes(entry));
}

export function logSuppressedNotification(kind: string, metadata: Record<string, unknown>): void {
  console.log(`[notification:dry-run] ${kind}`, metadata);
}
