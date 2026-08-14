import { useNavigate, useRouter } from "@tanstack/react-router";
import type { Id } from "@/convex/_generated/dataModel";
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
  appOrganizationId?: Id<"organizations">;
};

export function ShopDetail({ shop, people, selectedShopId, deletionReturnShopId, returnTo, appOrganizationId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const navigateBack = (shopId: string | null) => {
    if (appOrganizationId) {
      void navigate({ to: "/app/manage", search: { org: appOrganizationId }, replace: true });
      return;
    }
    return returnTo === "settings"
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
  };
  const returnToPreviousScreen = () => router.history.back();
  const deletion = useShopDeletionController({
    shop,
    onDeleted: () => navigateBack(deletionReturnShopId),
    expectedOrganizationId: appOrganizationId,
    clearLegacySelectedShop: !appOrganizationId,
  });
  const settings = useShopSettingsController(shop, appOrganizationId);
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
        appOrganizationId
          ? void navigate({
              to: "/app/staff/$personId",
              params: { personId },
              search: { org: appOrganizationId },
            })
          : void navigate({
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
      expectedOrganizationId={appOrganizationId}
    />
  );
}

export { ShopDetailSkeleton, ShopDetailView } from "./ShopDetailView";
export type { ShopDetailData, ShopDetailPerson } from "./types";
