import { describe, expect, it } from "vitest";
import {
  AVAILABLE_FEATURE_VISIBILITY,
  AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
  normalizeFeatureVisibility,
  normalizeOrganizationSettingsFeatures,
} from "./featureVisibility";

describe("normalizeFeatureVisibility", () => {
  it.each([undefined, null, {}, [], "enabled", true, { shopMembershipAddition: false }])(
    "旧DTOや不正値を未リリース機能の開状態として扱わない",
    (value) => {
      expect(normalizeFeatureVisibility(value)).toEqual(AVAILABLE_FEATURE_VISIBILITY);
    },
  );

  it("trueと明示された表示項目だけを開く", () => {
    expect(normalizeFeatureVisibility({ billing: true, shopMembershipAddition: "true" })).toEqual({
      organizationSettingsNavigation: false,
      billing: true,
      shopMembershipAddition: false,
    });
  });
});

describe("normalizeOrganizationSettingsFeatures", () => {
  it.each([undefined, null, {}, { shopAddition: false }])("旧backendの欠損応答を公開済みとみなさない", (value) => {
    expect(normalizeOrganizationSettingsFeatures(value)).toEqual(AVAILABLE_ORGANIZATION_SETTINGS_FEATURES);
  });

  it("項目ごとにtrueと明示された機能だけを開く", () => {
    expect(normalizeOrganizationSettingsFeatures({ billing: true, shopAddition: true })).toEqual({
      organizationCreation: false,
      shopAddition: true,
      billing: true,
      managerInvitation: false,
    });
  });
});
