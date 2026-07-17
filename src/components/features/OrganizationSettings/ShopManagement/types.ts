import type { ShopFormData } from "@/src/components/features/ShopForm";
import type { OrganizationShopView } from "../types";

export type ShopManagementOperation =
  | { kind: "addShop"; data: ShopFormData }
  | { kind: "archiveShop"; shopId: string }
  | { kind: "reactivateShop"; shopId: string };

export type ShopManagementDialogState =
  | { kind: "addShop" }
  | { kind: "archiveShop"; shop: OrganizationShopView }
  | { kind: "reactivateShop"; shop: OrganizationShopView };
