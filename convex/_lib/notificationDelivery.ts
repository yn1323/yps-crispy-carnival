import { getDebugNotificationDeliveryMode } from "./config";

type SuppressionOptions = {
  suppressDelivery?: boolean;
};

export type NotificationDeliveryBehavior = "live" | "dry-run" | "force-failure";

/**
 * 通知送信時の動作を一意に決める。
 * force-failure は既存jobの明示抑止より優先し、失敗経路を必ず再現する。
 */
export function getNotificationDeliveryBehavior(options: SuppressionOptions = {}): NotificationDeliveryBehavior {
  const debugMode = getDebugNotificationDeliveryMode();
  if (debugMode === "force-failure") return "force-failure";
  if (options.suppressDelivery || debugMode === "dry-run") return "dry-run";
  return "live";
}

/**
 * 通知送信の最終ゲート。
 * action 単位の明示抑制と環境全体の delivery mode の両方をここに集約し、
 * Resend / LINE クライアント側で送信直前に同じ判定を使う。
 */
export function isNotificationDeliverySuppressed(options: SuppressionOptions = {}): boolean {
  return getNotificationDeliveryBehavior(options) === "dry-run";
}

export function isNotificationDeliveryFailureForced(options: SuppressionOptions = {}): boolean {
  return getNotificationDeliveryBehavior(options) === "force-failure";
}

/** 通知送信に付随するprovider参照もDebug中は外部へ出さない。 */
export function isNotificationProviderAccessSuppressed(): boolean {
  return getNotificationDeliveryBehavior() !== "live";
}

export function logSuppressedNotification(kind: string, metadata: Record<string, unknown>): void {
  console.log(`[notification:dry-run] ${kind}`, metadata);
}
