import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDevelopmentSeedEnabled, getDevelopmentSeedConfiguration } from "./config";

describe("development seed guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  function stubReadyEnvironment() {
    vi.stubEnv("DEVELOPMENT_SEED_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud/");
    vi.stubEnv("DEVELOPMENT_SEED_DEPLOYMENT_URL", " https://seed-development.convex.cloud/// ");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
  }

  it("enable、deployment一致、dry-runがすべて揃った時だけ許可する", () => {
    stubReadyEnvironment();

    expect(assertDevelopmentSeedEnabled()).toEqual({
      enabled: true,
      currentDeploymentUrl: "https://seed-development.convex.cloud",
      targetDeploymentUrl: "https://seed-development.convex.cloud",
      notificationDeliveryMode: "dry-run",
    });
  });

  it.each([
    ["enable未設定", "DEVELOPMENT_SEED_ENABLED", ""],
    ["enableの表記揺れ", "DEVELOPMENT_SEED_ENABLED", "TRUE"],
    ["deployment不一致", "DEVELOPMENT_SEED_DEPLOYMENT_URL", "https://other.convex.cloud"],
    ["delivery mode未設定", "NOTIFICATION_DELIVERY_MODE", ""],
    ["delivery modeが別の抑止mode", "NOTIFICATION_DELIVERY_MODE", "disabled"],
  ])("%sをfail closedにする", (_label, key, value) => {
    stubReadyEnvironment();
    vi.stubEnv(key, value);

    expect(getDevelopmentSeedConfiguration().enabled).toBe(key !== "DEVELOPMENT_SEED_ENABLED");
    expect(() => assertDevelopmentSeedEnabled()).toThrowError(/Development seed/);
  });

  it("dry-runの大文字と前後空白は正規化する", () => {
    stubReadyEnvironment();
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", " DRY-RUN ");

    expect(assertDevelopmentSeedEnabled().notificationDeliveryMode).toBe("dry-run");
  });
});
