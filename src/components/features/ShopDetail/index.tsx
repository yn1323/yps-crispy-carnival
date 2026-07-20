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
  returnTo?: "dashboard";
};

export function ShopDetail({ shop, people, selectedShopId, returnTo }: Props) {
  const navigate = useNavigate();
  const backToSettings = () =>
    void navigate({
      to: "/settings",
      search: { shop: selectedShopId ?? undefined, tab: "shops" },
      replace: true,
    });
  const backToDashboard = () =>
    void navigate({
      to: "/dashboard",
      search: { shop: selectedShopId ?? undefined },
      replace: true,
    });
  const deletion = useShopDeletionController({ shop, onDeleted: backToSettings });
  const settings = useShopSettingsController(shop);
  const staffs = getShopStaffs(people, shop.id);

  return (
    <ShopDetailView
      key={shop.id}
      shop={shop}
      staffs={staffs}
      settingsDialog={settings.dialog}
      isDeleting={deletion.isDeleting}
      onBack={returnTo === "dashboard" ? backToDashboard : backToSettings}
      onOpenUser={(personId) =>
        void navigate({
          to: "/users/$personId",
          params: { personId },
          search: {
            shop: shop.id,
            returnTo: "shopDetail",
            returnShop: shop.id,
            ...(returnTo === "dashboard" ? { returnShopTo: "dashboard" as const } : {}),
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
