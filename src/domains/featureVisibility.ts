export type FeatureVisibility = {
  organizationSettingsNavigation: boolean;
  billing: boolean;
  shopMembershipAddition: boolean;
};

export const AVAILABLE_FEATURE_VISIBILITY: FeatureVisibility = {
  organizationSettingsNavigation: true,
  billing: true,
  shopMembershipAddition: true,
};

export type OrganizationSettingsFeatures = {
  organizationCreation: boolean;
  shopAddition: boolean;
  billing: boolean;
  managerInvitation: boolean;
};

export const AVAILABLE_ORGANIZATION_SETTINGS_FEATURES: OrganizationSettingsFeatures = {
  organizationCreation: true,
  shopAddition: true,
  billing: true,
  managerInvitation: true,
};

/** 常時公開機能は旧応答でも開き、複数店舗writerだけはserverの明示値へfail closedに揃える。 */
export function normalizeFeatureVisibility(value: unknown): FeatureVisibility {
  return {
    organizationSettingsNavigation: true,
    billing: true,
    shopMembershipAddition: hasExplicitlyEnabledFeature(value, "shopMembershipAddition"),
  };
}

/** getSettingsでも店舗追加だけserver gateを正とし、旧応答の欠損時は入口を開かない。 */
export function normalizeOrganizationSettingsFeatures(value: unknown): OrganizationSettingsFeatures {
  return {
    organizationCreation: true,
    shopAddition: hasExplicitlyEnabledFeature(value, "shopAddition"),
    billing: true,
    managerInvitation: true,
  };
}

function hasExplicitlyEnabledFeature(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && (value as Record<string, unknown>)[key] === true;
}
