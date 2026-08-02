export type ShopStatus = "active" | "archived" | "planSuspended";
export type OrganizationMemberStatus = "active" | "readOnly" | "removed";
export type OrganizationPlan = "trial" | "free" | "pro" | "business";

export type ShopContextOption = {
  shopId: string;
  shopName: string;
  shopStatus: ShopStatus;
  // TODO[narrow]: 全deploymentでm025/m026が完走し、shop/member readinessが0件になった後にnullを外す。
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: OrganizationPlan | null;
  memberStatus: OrganizationMemberStatus;
};

export type SelectedShopType = ShopContextOption | null;

export function normalizeShopContextOption(value: unknown): ShopContextOption | null {
  if (!isRecord(value) || typeof value.shopId !== "string" || typeof value.shopName !== "string") {
    return null;
  }

  return {
    shopId: value.shopId,
    shopName: value.shopName,
    shopStatus: isShopStatus(value.shopStatus) ? value.shopStatus : "active",
    organizationId: typeof value.organizationId === "string" ? value.organizationId : null,
    organizationName: typeof value.organizationName === "string" ? value.organizationName : null,
    organizationPlan: isOrganizationPlan(value.organizationPlan) ? value.organizationPlan : null,
    memberStatus: isOrganizationMemberStatus(value.memberStatus) ? value.memberStatus : "active",
  };
}

export function normalizeShopContextOptions(values: readonly unknown[]): ShopContextOption[] {
  return values.flatMap((value) => {
    const normalized = normalizeShopContextOption(value);
    return normalized ? [normalized] : [];
  });
}

export function normalizeSelectedShop(value: unknown): SelectedShopType {
  return normalizeShopContextOption(value);
}

export function toSelectedShop(shop: ShopContextOption): NonNullable<SelectedShopType> {
  return { ...shop };
}

export function isSelectableShop(shop: ShopContextOption): boolean {
  // archived / planSuspended は既存データとグループ設定を読むための選択肢として残す。
  // 書き込み可否はConvex側が店舗状態と管理者所属を再検証する。
  return shop.memberStatus !== "removed";
}

export function isSameSelectedShop(
  selectedShop: SelectedShopType,
  shop: ShopContextOption,
): selectedShop is NonNullable<SelectedShopType> {
  return (
    selectedShop !== null &&
    selectedShop.shopId === shop.shopId &&
    selectedShop.shopName === shop.shopName &&
    selectedShop.shopStatus === shop.shopStatus &&
    selectedShop.organizationId === shop.organizationId &&
    selectedShop.organizationName === shop.organizationName &&
    selectedShop.organizationPlan === shop.organizationPlan &&
    selectedShop.memberStatus === shop.memberStatus
  );
}

export type ShopOrganizationGroup = {
  key: string;
  organizationName: string;
  shops: ShopContextOption[];
};

export function groupShopsByOrganization(shops: readonly ShopContextOption[]): ShopOrganizationGroup[] {
  const groups = new Map<string, ShopOrganizationGroup>();

  for (const shop of shops) {
    const organizationName = shop.organizationName ?? `${shop.shopName}のグループ`;
    // TODO[narrow]: backendのgetMyShopsからlegacy fallbackを外した後、このlegacy keyも削除する。
    // organizationId がまだない移行中店舗を、表示名だけで同一グループと誤認しない。
    const key = shop.organizationId ?? `legacy:${shop.shopId}`;
    const group = groups.get(key) ?? { key, organizationName, shops: [] };
    group.shops.push(shop);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      shops: [...group.shops].sort((a, b) => a.shopName.localeCompare(b.shopName, "ja")),
    }))
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, "ja"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isShopStatus(value: unknown): value is ShopStatus {
  return value === "active" || value === "archived" || value === "planSuspended";
}

function isOrganizationMemberStatus(value: unknown): value is OrganizationMemberStatus {
  return value === "active" || value === "readOnly" || value === "removed";
}

function isOrganizationPlan(value: unknown): value is OrganizationPlan {
  return value === "trial" || value === "free" || value === "pro" || value === "business";
}
