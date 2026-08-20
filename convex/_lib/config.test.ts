import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertDevelopmentSeedEnabled,
  getDevelopmentSeedConfiguration,
  getFeatureVisibility,
  getReleaseFeatureVisibility,
} from "./config";

describe("feature visibility", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("未設定の未リリース機能をfail closedにする", () => {
    expect(getReleaseFeatureVisibility()).toEqual({
      organizationCreation: false,
      shopAddition: false,
      managerInvitation: false,
      billing: false,
    });
    expect(getFeatureVisibility()).toEqual({
      organizationSettingsNavigation: false,
      billing: false,
      shopMembershipAddition: false,
    });
  });

  it("trueと明示した機能だけを開く", () => {
    vi.stubEnv("FEATURE_ORGANIZATION_CREATION", " true ");
    vi.stubEnv("FEATURE_SHOP_ADDITION", "TRUE");
    vi.stubEnv("FEATURE_MANAGER_INVITATION", "1");
    vi.stubEnv("FEATURE_BILLING", "false");

    expect(getReleaseFeatureVisibility()).toEqual({
      organizationCreation: true,
      shopAddition: true,
      managerInvitation: false,
      billing: false,
    });
    expect(getFeatureVisibility()).toEqual({
      organizationSettingsNavigation: true,
      billing: false,
      shopMembershipAddition: true,
    });
  });
});

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
