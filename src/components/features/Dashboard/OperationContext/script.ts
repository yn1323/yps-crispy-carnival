import {
  groupShopsByOrganization,
  type ShopContextOption,
  type ShopOrganizationGroup,
} from "@/src/domains/shop/context";

export type OperationContextModel = {
  groups: ShopOrganizationGroup[];
  selectedGroup: ShopOrganizationGroup;
  selectedShop: ShopContextOption;
  organizationChangeOptions: {
    key: string;
    organizationName: string;
    shopId: string;
  }[];
  hasMultipleGroups: boolean;
  canSwitchShop: boolean;
};

export function buildOperationContextModel(
  shops: readonly ShopContextOption[],
  selectedShopId: string | null,
): OperationContextModel | null {
  const groups = groupShopsByOrganization(shops);
  const selectedGroup = groups.find((group) => group.shops.some((shop) => shop.shopId === selectedShopId));
  const selectedShop = selectedGroup?.shops.find((shop) => shop.shopId === selectedShopId);

  if (!selectedGroup || !selectedShop) return null;

  return {
    groups,
    selectedGroup,
    selectedShop,
    organizationChangeOptions: groups
      .filter((group) => group.key !== selectedGroup.key)
      .map((group) => ({
        key: group.key,
        organizationName: group.organizationName,
        shopId: group.shops[0].shopId,
      })),
    hasMultipleGroups: groups.length > 1,
    canSwitchShop: shops.length > 1,
  };
}
