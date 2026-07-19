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
};

export function ShopDetail({ shop, people, selectedShopId }: Props) {
  const navigate = useNavigate();
  const backToSettings = () =>
    void navigate({
      to: "/settings",
      search: { shop: selectedShopId ?? undefined, tab: "shops" },
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
      updatingSetting={settings.updatingSetting}
      isDeleting={deletion.isDeleting}
      onBack={backToSettings}
      onOpenUser={(personId) =>
        void navigate({
          to: "/users/$personId",
          params: { personId },
          search: {
            shop: shop.id,
            tab: "notification",
            returnTo: "shopDetail",
            returnShop: shop.id,
          },
        })
      }
      onUpdateSetting={settings.updateSetting}
      onDelete={deletion.deleteShop}
    />
  );
}

export { ShopDetailSkeleton, ShopDetailView } from "./ShopDetailView";
export type { ShopDetailData, ShopDetailPerson } from "./types";
