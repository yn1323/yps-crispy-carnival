import { convexRunJson } from "./convex";

type NotificationShopSafetyState = {
  notificationDeliverySuppressed: boolean;
};

// 通知送信を防ぐfail-closedの事前確認は、並列burn-in時のCLI cold startを許容する。
// timeoutは成功時に消費する固定待機ではなく、失敗時の上限である。
const SAFETY_PROBE_TIMEOUT_MS = 20_000;

export function assertNotificationDeliverySuppressed(shopId: string) {
  const state = convexRunJson<NotificationShopSafetyState>(
    "testing:getE2EShopSafetyState",
    { shopId },
    { timeoutMs: SAFETY_PROBE_TIMEOUT_MS },
  );
  if (!state.notificationDeliverySuppressed) {
    throw new Error("Notification delivery is not suppressed for the E2E shop");
  }
}

export function assertNotificationRecipientSuppressed(email: string) {
  const state = convexRunJson<NotificationShopSafetyState>(
    "testing:getE2ERecipientSafetyState",
    { email },
    { timeoutMs: SAFETY_PROBE_TIMEOUT_MS },
  );
  if (!state.notificationDeliverySuppressed) {
    throw new Error("Notification delivery is not suppressed for the E2E recipient");
  }
}
