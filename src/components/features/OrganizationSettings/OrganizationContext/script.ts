import { groupShopsByOrganization, type ShopContextOption } from "@/src/stores/shop";

export type OrganizationContextOption = {
  key: string;
  organizationName: string;
  shopId: string;
  isSelected: boolean;
};

export type OrganizationContextModel = {
  options: OrganizationContextOption[];
  selectedOrganizationName: string;
  selectedShopId: string;
  selectedShopName: string;
  canSwitchOrganization: boolean;
};

export function buildOrganizationContextModel(
  shops: readonly ShopContextOption[],
  selectedShopId: string,
): OrganizationContextModel | null {
  const groups = groupShopsByOrganization(shops);
  const selectedGroup = groups.find((group) => group.shops.some((shop) => shop.shopId === selectedShopId));
  const selectedShop = selectedGroup?.shops.find((shop) => shop.shopId === selectedShopId);

  if (!selectedGroup || !selectedShop) return null;

  return {
    options: groups.map((group) => ({
      key: group.key,
      organizationName: group.organizationName,
      shopId: group.key === selectedGroup.key ? selectedShop.shopId : group.shops[0].shopId,
      isSelected: group.key === selectedGroup.key,
    })),
    selectedOrganizationName: selectedGroup.organizationName,
    selectedShopId: selectedShop.shopId,
    selectedShopName: selectedShop.shopName,
    canSwitchOrganization: groups.length > 1,
  };
}
