import { afterEach, describe, expect, it, vi } from "vitest";
import { getFeatureVisibility, getReleaseFeatureVisibility } from "./config";

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
