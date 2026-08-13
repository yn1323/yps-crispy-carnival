import { describe, expect, it } from "vitest";
import {
  AVAILABLE_FEATURE_VISIBILITY,
  AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
  normalizeFeatureVisibility,
  normalizeOrganizationSettingsFeatures,
} from "./featureVisibility";

describe("normalizeFeatureVisibility", () => {
  it.each([undefined, null, {}, [], "enabled", true])("DTOの新旧に関わらず全機能を公開する", (value) => {
    expect(normalizeFeatureVisibility(value)).toEqual(AVAILABLE_FEATURE_VISIBILITY);
  });

  it("旧DTOが閉状態を含んでも全機能を公開する", () => {
    expect(
      normalizeFeatureVisibility({
        organizationSettingsNavigation: false,
        billing: false,
        shopMembershipAddition: false,
      }),
    ).toEqual(AVAILABLE_FEATURE_VISIBILITY);
  });
});

describe("normalizeOrganizationSettingsFeatures", () => {
  it.each([undefined, null, {}, { billing: true }])("旧backendまたはpartial payloadでも全機能を公開する", (value) => {
    expect(normalizeOrganizationSettingsFeatures(value)).toEqual(AVAILABLE_ORGANIZATION_SETTINGS_FEATURES);
  });

  it("旧DTOが閉状態を含んでも全機能を公開する", () => {
    expect(
      normalizeOrganizationSettingsFeatures({
        organizationCreation: false,
        shopAddition: false,
        billing: false,
        managerInvitation: false,
      }),
    ).toEqual(AVAILABLE_ORGANIZATION_SETTINGS_FEATURES);
  });
});
