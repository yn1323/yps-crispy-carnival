import {
  groupShopsByOrganization,
  type ShopContextOption,
  type ShopOrganizationGroup,
} from "@/src/domains/shop/context";

export type OperationContextModel = {
  selectedGroup: ShopOrganizationGroup;
  selectedShop: ShopContextOption;
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
    selectedGroup,
    selectedShop,
    canSwitchShop: selectedGroup.shops.length > 1,
  };
}
