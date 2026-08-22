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
  organizationId: Id<"organizations">;
};

export function ShopDetail({ shop, people, organizationId }: Props) {
  const navigate = useNavigate();
  const router = useRouter();
  const navigateBack = () => {
    void navigate({ to: "/manage", search: { org: organizationId }, replace: true });
  };
  const returnToPreviousScreen = () => router.history.back();
  const deletion = useShopDeletionController({
    shop,
    onDeleted: navigateBack,
    expectedOrganizationId: organizationId,
    clearLegacySelectedShop: false,
  });
  const settings = useShopSettingsController(shop, organizationId);
  const staffs = getShopStaffs(people, shop.id);

  return (
    <ShopDetailView
      key={shop.id}
      shop={shop}
      staffs={staffs}
      settingsDialog={settings.dialog}
      isDeleting={deletion.isDeleting}
      onBack={returnToPreviousScreen}
      onOpenUser={(personId) =>
        void navigate({
          to: "/staff/$personId",
          params: { personId },
          search: { org: organizationId },
        })
      }
      onUpdateSettings={settings.updateSettings}
      onDelete={deletion.deleteShop}
      expectedOrganizationId={organizationId}
    />
  );
}

export { ShopDetailSkeleton, ShopDetailView } from "./ShopDetailView";
export type { ShopDetailData, ShopDetailPerson } from "./types";
