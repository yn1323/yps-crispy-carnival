import { afterEach, describe, expect, it, vi } from "vitest";
import { isNotificationDeliverySuppressed } from "./notificationDelivery";

describe("isNotificationDeliverySuppressed", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("E2E testing helpers are enabled のとき外部通知を抑止する", () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");

    expect(isNotificationDeliverySuppressed()).toBe(true);
  });

  it.each(["dry-run", "disabled", "mock"])("NOTIFICATION_DELIVERY_MODE=%s のとき外部通知を抑止する", (mode) => {
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", mode);

    expect(isNotificationDeliverySuppressed()).toBe(true);
  });

  it("抑止用envがないときは外部通知を許可する", () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "");

    expect(isNotificationDeliverySuppressed()).toBe(false);
  });
});
