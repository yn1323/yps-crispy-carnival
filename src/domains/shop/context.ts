export type OrganizationPlan = "trial" | "free" | "standard" | "pro";

export type ShopContextOption = {
  shopId: string;
  shopName: string;
  organizationId: string;
  organizationName: string;
  organizationPlan: OrganizationPlan;
};

export type SelectedShopType = ShopContextOption | null;

export function normalizeShopContextOption(value: unknown): ShopContextOption | null {
  if (
    !isRecord(value) ||
    typeof value.shopId !== "string" ||
    typeof value.shopName !== "string" ||
    typeof value.organizationId !== "string" ||
    typeof value.organizationName !== "string" ||
    !isOrganizationPlan(value.organizationPlan)
  ) {
    return null;
  }

  return {
    shopId: value.shopId,
    shopName: value.shopName,
    organizationId: value.organizationId,
    organizationName: value.organizationName,
    organizationPlan: value.organizationPlan,
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
    const key = shop.organizationId;
    const group = groups.get(key) ?? { key, organizationName: shop.organizationName, shops: [] };
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
