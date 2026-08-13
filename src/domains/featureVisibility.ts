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

/** 公開済み機能は、旧backendや保存済みDTOの値にかかわらず利用可能として扱う。 */
export function normalizeFeatureVisibility(_value: unknown): FeatureVisibility {
  return { ...AVAILABLE_FEATURE_VISIBILITY };
}

/** 組織設定でも、旧backendの部分応答を公開済み機能の閉鎖理由にしない。 */
export function normalizeOrganizationSettingsFeatures(_value: unknown): OrganizationSettingsFeatures {
  return { ...AVAILABLE_ORGANIZATION_SETTINGS_FEATURES };
}
