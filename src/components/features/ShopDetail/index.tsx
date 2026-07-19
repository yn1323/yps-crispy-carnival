import { useNavigate } from "@tanstack/react-router";
import { ShopDetailView } from "./ShopDetailView";
import type { ShopDetailData, ShopDetailTab } from "./types";
import { useShopDeletionController } from "./useShopDeletionController";

type Props = {
  shop: ShopDetailData;
  selectedShopId: string | null;
  activeTab: ShopDetailTab;
};

export function ShopDetail({ shop, selectedShopId, activeTab }: Props) {
  const navigate = useNavigate();
  const backToSettings = () =>
    void navigate({
      to: "/settings",
      search: { shop: selectedShopId ?? undefined, tab: "shops" },
      replace: true,
    });
  const deletion = useShopDeletionController({ shop, onDeleted: backToSettings });

  return (
    <ShopDetailView
      key={shop.id}
      shop={shop}
      activeTab={activeTab}
      isDeleting={deletion.isDeleting}
      onBack={backToSettings}
      onTabChange={(tab) =>
        void navigate({
          to: ".",
          search: (previous) => ({ ...previous, tab }),
          replace: true,
          resetScroll: false,
        })
      }
      onDelete={deletion.deleteShop}
    />
  );
}

export { ShopDetailSkeleton, ShopDetailView } from "./ShopDetailView";
export type { ShopDetailData, ShopDetailTab } from "./types";
