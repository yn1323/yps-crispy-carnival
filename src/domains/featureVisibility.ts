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

/** 旧backend応答と永続atomの形状に関わらず、現行機能はすべて公開する。 */
export function normalizeFeatureVisibility(_value: unknown): FeatureVisibility {
  return { ...AVAILABLE_FEATURE_VISIBILITY };
}

/** 旧getSettings DTOとの型互換は保ち、表示判定は常時公開に正規化する。 */
export function normalizeOrganizationSettingsFeatures(_value: unknown): OrganizationSettingsFeatures {
  return { ...AVAILABLE_ORGANIZATION_SETTINGS_FEATURES };
}
