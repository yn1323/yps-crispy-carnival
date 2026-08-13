import { describe, expect, it } from "vitest";
import {
  AVAILABLE_FEATURE_VISIBILITY,
  AVAILABLE_ORGANIZATION_SETTINGS_FEATURES,
  normalizeFeatureVisibility,
  normalizeOrganizationSettingsFeatures,
} from "./featureVisibility";

describe("normalizeFeatureVisibility", () => {
  it.each([undefined, null, {}, [], "enabled", true, { shopMembershipAddition: false }])(
    "旧DTOや保存済みの閉状態にかかわらず所属追加を公開する",
    (value) => {
      expect(normalizeFeatureVisibility(value)).toEqual(AVAILABLE_FEATURE_VISIBILITY);
    },
  );
});

describe("normalizeOrganizationSettingsFeatures", () => {
  it.each([undefined, null, {}, { billing: true }, { shopAddition: false }])(
    "旧backendや保存済みの閉状態にかかわらず店舗追加を公開する",
    (value) => {
      expect(normalizeOrganizationSettingsFeatures(value)).toEqual(AVAILABLE_ORGANIZATION_SETTINGS_FEATURES);
    },
  );
});
