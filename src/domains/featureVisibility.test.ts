import { describe, expect, it } from "vitest";
import {
  AVAILABLE_FEATURE_VISIBILITY,
  AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
  normalizeFeatureVisibility,
  normalizeOrganizationSettingsFeatures,
} from "./featureVisibility";

describe("normalizeFeatureVisibility", () => {
  it.each([undefined, null, {}, [], "enabled", true])("旧DTOまたは不正値では複数店舗writerだけ閉じる", (value) => {
    expect(normalizeFeatureVisibility(value)).toEqual({
      ...AVAILABLE_FEATURE_VISIBILITY,
      shopMembershipAddition: false,
    });
  });

  it.each([false, "enabled", 1, undefined])("backendの明示true以外では所属追加を公開しない: %s", (value) => {
    expect(
      normalizeFeatureVisibility({
        organizationSettingsNavigation: false,
        billing: false,
        shopMembershipAddition: value,
      }),
    ).toEqual({ ...AVAILABLE_FEATURE_VISIBILITY, shopMembershipAddition: false });
  });

  it("backendが明示したときだけ所属追加を公開する", () => {
    expect(normalizeFeatureVisibility({ shopMembershipAddition: true })).toEqual(AVAILABLE_FEATURE_VISIBILITY);
  });
});

describe("normalizeOrganizationSettingsFeatures", () => {
  it.each([undefined, null, {}, { billing: true }])("旧backendまたはpartial payloadでは店舗追加だけ閉じる", (value) => {
    expect(normalizeOrganizationSettingsFeatures(value)).toEqual({
      ...AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
      shopAddition: false,
    });
  });

  it("旧DTOの閉状態でも常時公開機能を維持し、店舗追加は閉じる", () => {
    expect(
      normalizeOrganizationSettingsFeatures({
        organizationCreation: false,
        shopAddition: false,
        billing: false,
        managerInvitation: false,
      }),
    ).toEqual({ ...AVAILABLE_ORGANIZATION_SETTINGS_FEATURES, shopAddition: false });
  });

  it("backendが明示したときだけ店舗追加を公開する", () => {
    expect(normalizeOrganizationSettingsFeatures({ shopAddition: true })).toEqual(
      AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
    );
  });
});
