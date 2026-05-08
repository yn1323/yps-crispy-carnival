const SUPPRESSED_DELIVERY_MODES = new Set(["dry-run", "disabled", "mock"]);

export function isNotificationDeliverySuppressed(): boolean {
  return (
    process.env.E2E_TESTING_ENABLED === "true" ||
    SUPPRESSED_DELIVERY_MODES.has(process.env.NOTIFICATION_DELIVERY_MODE ?? "")
  );
}

export function logSuppressedNotification(kind: string, metadata: Record<string, unknown>): void {
  console.log(`[notification:dry-run] ${kind}`, metadata);
}
