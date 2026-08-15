import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ShopDetailData } from "./types";

export function useShopSettingsController(shop: ShopDetailData, expectedOrganizationId?: Id<"organizations">) {
  const updateMutation = useMutation(api.shop.mutations.updateShopSettings);
  const dialog = useDialog();
  const latestShopRef = useRef(shop);
  latestShopRef.current = shop;

  useEffect(() => {
    if (!shop.canUpdateSettings) dialog.close();
  }, [dialog.close, shop.canUpdateSettings]);

  const { run, isRunning: isUpdating } = useSingleFlight(async (data: ShopFormData) => {
    const latestShop = latestShopRef.current;
    if (!latestShop.canUpdateSettings) return false;

    try {
      await updateMutation({
        shopId: latestShop.id as Id<"shops">,
        ...(expectedOrganizationId ? { expectedOrganizationId } : {}),
        ...data,
      });
      dialog.close();
      showSuccessToast({ title: "店舗設定を更新しました" });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    }
  });

  const openSettings = () => {
    if (!latestShopRef.current.canUpdateSettings) return;
    dialog.open();
  };

  return {
    dialog: {
      isOpen: dialog.isOpen,
      onOpenChange: dialog.onOpenChange,
      open: openSettings,
      close: dialog.close,
      isUpdating,
    },
    updateSettings: async (data: ShopFormData) => {
      await run(data);
    },
  };
}
