export type FeatureVisibility = {
  organizationSettingsNavigation: boolean;
  billing: boolean;
  shopMembershipAddition: boolean;
};

export const AVAILABLE_FEATURE_VISIBILITY: FeatureVisibility = {
  organizationSettingsNavigation: false,
  billing: false,
  shopMembershipAddition: false,
};

export type OrganizationSettingsFeatures = {
  organizationCreation: boolean;
  shopAddition: boolean;
  billing: boolean;
  managerInvitation: boolean;
};

export const AVAILABLE_ORGANIZATION_SETTINGS_FEATURES: OrganizationSettingsFeatures = {
  organizationCreation: false,
  shopAddition: false,
  billing: false,
  managerInvitation: false,
};

function enabledField(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Reflect.get(value, key) === true;
}

/** 旧backendの欠損・不正DTOは、未リリース機能を開かずfail closedにする。 */
export function normalizeFeatureVisibility(value: unknown): FeatureVisibility {
  return {
    organizationSettingsNavigation: enabledField(value, "organizationSettingsNavigation"),
    billing: enabledField(value, "billing"),
    shopMembershipAddition: enabledField(value, "shopMembershipAddition"),
  };
}

export function normalizeOrganizationSettingsFeatures(value: unknown): OrganizationSettingsFeatures {
  return {
    organizationCreation: enabledField(value, "organizationCreation"),
    shopAddition: enabledField(value, "shopAddition"),
    billing: enabledField(value, "billing"),
    managerInvitation: enabledField(value, "managerInvitation"),
  };
}
