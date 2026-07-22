import type { ShopFormData } from "@/src/components/features/ShopForm";

export type ShopManagementOperation = { kind: "addShop"; data: ShopFormData };

export type ShopManagementDialogState = { kind: "addShop" };
