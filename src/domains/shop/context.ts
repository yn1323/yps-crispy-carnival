export type OrganizationPlan = "trial" | "free" | "standard" | "pro";

export type ShopContextOption = {
  shopId: string;
  shopName: string;
  // TODO[narrow]: 全deploymentでm025/m026が完走し、shop/member readinessが0件になった後にnullを外す。
  organizationId: string | null;
  organizationName: string | null;
  organizationPlan: OrganizationPlan | null;
};

export type SelectedShopType = ShopContextOption | null;

export function normalizeShopContextOption(value: unknown): ShopContextOption | null {
  if (!isRecord(value) || typeof value.shopId !== "string" || typeof value.shopName !== "string") {
    return null;
  }
  // 旧保存値やrolling deploymentから状態値を受け取った場合も、
  // archivedや未知の値を現行店舗へ黙って読み替えない。
  if (
    (value.shopStatus !== undefined && value.shopStatus !== "active") ||
    (value.operatingStatus !== undefined && value.operatingStatus !== "active")
  ) {
    return null;
  }

  return {
    shopId: value.shopId,
    shopName: value.shopName,
    organizationId: typeof value.organizationId === "string" ? value.organizationId : null,
    organizationName: typeof value.organizationName === "string" ? value.organizationName : null,
    organizationPlan: isOrganizationPlan(value.organizationPlan) ? value.organizationPlan : null,
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

export function isSameSelectedShop(
  selectedShop: SelectedShopType,
  shop: ShopContextOption,
): selectedShop is NonNullable<SelectedShopType> {
  return (
    selectedShop !== null &&
    selectedShop.shopId === shop.shopId &&
    selectedShop.shopName === shop.shopName &&
    selectedShop.organizationId === shop.organizationId &&
    selectedShop.organizationName === shop.organizationName &&
    selectedShop.organizationPlan === shop.organizationPlan
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
    const organizationName = shop.organizationName ?? `${shop.shopName}の組織`;
    // TODO[narrow]: backendのgetMyShopsからlegacy fallbackを外した後、このlegacy keyも削除する。
    // organizationId がまだない移行中店舗を、表示名だけで同一組織と誤認しない。
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

function isOrganizationPlan(value: unknown): value is OrganizationPlan {
  return value === "trial" || value === "free" || value === "standard" || value === "pro";
}
