import { groupShopsByOrganization, type ShopContextOption, type ShopOrganizationGroup } from "@/src/stores/shop";

export type OperationContextModel = {
  groups: ShopOrganizationGroup[];
  selectedGroup: ShopOrganizationGroup;
  selectedShop: ShopContextOption;
  canSwitchGroup: boolean;
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
    canSwitchGroup: groups.length > 1,
    canSwitchShop: selectedGroup.shops.length > 1,
  };
}

export function getShopForGroupSelection(
  groups: readonly ShopOrganizationGroup[],
  groupKey: string,
  currentShopId: string,
): ShopContextOption | null {
  const group = groups.find((candidate) => candidate.key === groupKey);
  return group?.shops.find((shop) => shop.shopId === currentShopId) ?? group?.shops[0] ?? null;
}
