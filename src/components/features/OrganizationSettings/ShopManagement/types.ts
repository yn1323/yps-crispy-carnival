import type { ShopFormData } from "@/src/components/features/ShopForm";
import type { OrganizationShopView } from "../types";

export type ShopManagementOperation = { kind: "addShop"; data: ShopFormData } | { kind: "deleteShop"; shopId: string };

export type ShopManagementDialogState = { kind: "addShop" } | { kind: "shopDetails"; shop: OrganizationShopView };
