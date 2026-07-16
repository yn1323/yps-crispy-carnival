import type { OrganizationShopView } from "../types";

export type ShopManagementDialogState =
  | { kind: "addShop" }
  | { kind: "archiveShop"; shop: OrganizationShopView }
  | { kind: "reactivateShop"; shop: OrganizationShopView };
