import { groupShopsByOrganization, type ShopContextOption, type ShopOrganizationGroup } from "@/src/stores/shop";

export type OperationContextModel = {
  groups: ShopOrganizationGroup[];
  selectedGroup: ShopOrganizationGroup;
  selectedShop: ShopContextOption;
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
    hasMultipleGroups: groups.length > 1,
    canSwitchShop: shops.length > 1,
  };
}
