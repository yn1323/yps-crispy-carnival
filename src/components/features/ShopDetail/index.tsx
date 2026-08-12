import { useNavigate } from "@tanstack/react-router";
import { ShopDetailView } from "./ShopDetailView";
import { getShopStaffs } from "./script";
import type { ShopDetailData, ShopDetailPerson } from "./types";
import { useShopDeletionController } from "./useShopDeletionController";
import { useShopSettingsController } from "./useShopSettingsController";

type Props = {
  shop: ShopDetailData;
  people: ShopDetailPerson[];
  selectedShopId: string | null;
  deletionReturnShopId: string | null;
  returnTo?: "dashboard" | "settings";
};

export function ShopDetail({ shop, people, selectedShopId, deletionReturnShopId, returnTo }: Props) {
  const navigate = useNavigate();
  const navigateBack = (shopId: string | null) =>
    returnTo === "settings"
      ? void navigate({
          to: "/settings",
          search: { shop: shopId ?? undefined, tab: "shops" },
          replace: true,
        })
      : void navigate({
          to: "/dashboard",
          search: { shop: shopId ?? undefined },
          replace: true,
        });
  const returnToPreviousScreen = () => navigateBack(selectedShopId);
  const deletion = useShopDeletionController({ shop, onDeleted: () => navigateBack(deletionReturnShopId) });
  const settings = useShopSettingsController(shop);
  const staffs = getShopStaffs(people, shop.id);

  return (
    <ShopDetailView
      key={shop.id}
      shop={shop}
      organizationSettingsShopId={selectedShopId ?? shop.id}
      staffs={staffs}
      settingsDialog={settings.dialog}
      isDeleting={deletion.isDeleting}
      onBack={returnToPreviousScreen}
      onOpenUser={(personId) =>
        void navigate({
          to: "/users/$personId",
          params: { personId },
          search: {
            shop: shop.id,
            returnTo: "shopDetail",
            returnShop: shop.id,
            ...(returnTo !== "settings" ? { returnShopTo: "dashboard" as const } : {}),
          },
        })
      }
      onUpdateSettings={settings.updateSettings}
      onDelete={deletion.deleteShop}
    />
  );
}

export { ShopDetailSkeleton, ShopDetailView } from "./ShopDetailView";
export type { ShopDetailData, ShopDetailPerson } from "./types";
