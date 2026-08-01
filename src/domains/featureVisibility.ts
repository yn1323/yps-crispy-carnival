export type FeatureVisibility = {
  organizationSettingsNavigation: boolean;
  billing: boolean;
  shopMembershipAddition: boolean;
};

export const CLOSED_FEATURE_VISIBILITY: FeatureVisibility = {
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

export const CLOSED_ORGANIZATION_SETTINGS_FEATURES: OrganizationSettingsFeatures = {
  organizationCreation: false,
  shopAddition: false,
  billing: false,
  managerInvitation: false,
};

/**
 * 旧backendの欠損やpartialな応答は、一部だけ公開せず全機能を閉じる。
 * TODO[narrow]: 対応backendの全deployment反映と旧atom互換期間終了後にfallbackを削除する。
 */
export function normalizeFeatureVisibility(value: unknown): FeatureVisibility {
  if (
    !isRecord(value) ||
    typeof value.organizationSettingsNavigation !== "boolean" ||
    typeof value.billing !== "boolean" ||
    typeof value.shopMembershipAddition !== "boolean"
  ) {
    return { ...CLOSED_FEATURE_VISIBILITY };
  }

  return {
    organizationSettingsNavigation: value.organizationSettingsNavigation,
    billing: value.billing,
    shopMembershipAddition: value.shopMembershipAddition,
  };
}

/**
 * Widen中の旧getSettingsや不完全な応答は、四機能すべてを非公開として扱う。
 * TODO[narrow]: 対応backendの全deployment反映と旧frontend互換期間終了後にfallbackを削除する。
 */
export function normalizeOrganizationSettingsFeatures(value: unknown): OrganizationSettingsFeatures {
  if (
    !isRecord(value) ||
    typeof value.organizationCreation !== "boolean" ||
    typeof value.shopAddition !== "boolean" ||
    typeof value.billing !== "boolean" ||
    typeof value.managerInvitation !== "boolean"
  ) {
    return { ...CLOSED_ORGANIZATION_SETTINGS_FEATURES };
  }

  return {
    organizationCreation: value.organizationCreation,
    shopAddition: value.shopAddition,
    billing: value.billing,
    managerInvitation: value.managerInvitation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
