import { describe, expect, it } from "vitest";
import {
  CLOSED_FEATURE_VISIBILITY,
  CLOSED_ORGANIZATION_SETTINGS_FEATURES,
  normalizeFeatureVisibility,
  normalizeOrganizationSettingsFeatures,
} from "./featureVisibility";

describe("normalizeFeatureVisibility", () => {
  it.each([undefined, null, {}, [], "enabled", true])("欠損または不正な値は全機能を閉じる", (value) => {
    expect(normalizeFeatureVisibility(value)).toEqual(CLOSED_FEATURE_VISIBILITY);
  });

  it("フィールドが欠損またはboolean以外なら全機能を閉じる", () => {
    expect(
      normalizeFeatureVisibility({
        organizationSettingsNavigation: true,
        billing: "true",
        shopMembershipAddition: 1,
        unexpectedFeature: true,
      }),
    ).toEqual(CLOSED_FEATURE_VISIBILITY);
  });

  it("各機能のboolean値をそのまま正規化する", () => {
    expect(
      normalizeFeatureVisibility({
        organizationSettingsNavigation: false,
        billing: true,
        shopMembershipAddition: true,
      }),
    ).toEqual({
      organizationSettingsNavigation: false,
      billing: true,
      shopMembershipAddition: true,
    });
  });
});

describe("normalizeOrganizationSettingsFeatures", () => {
  it.each([undefined, null, {}, { billing: true }])("旧backendまたはpartial payloadは全機能を閉じる", (value) => {
    expect(normalizeOrganizationSettingsFeatures(value)).toEqual(CLOSED_ORGANIZATION_SETTINGS_FEATURES);
  });

  it("全フィールドがbooleanならそのまま採用する", () => {
    expect(
      normalizeOrganizationSettingsFeatures({
        organizationCreation: true,
        shopAddition: false,
        billing: true,
        managerInvitation: false,
      }),
    ).toEqual({
      organizationCreation: true,
      shopAddition: false,
      billing: true,
      managerInvitation: false,
    });
  });
});
