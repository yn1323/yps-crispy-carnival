import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { UpdateShopSettingInput } from "@/convex/shop/schemas";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { ShopDetailData, ShopSettingKind } from "./types";

const SUCCESS_TITLES: Record<ShopSettingKind, string> = {
  shopName: "店舗名を更新しました",
  submissionPattern: "希望シフトの集め方を更新しました",
  regularClosedDays: "定休日を更新しました",
};

export function useShopSettingsController(shop: ShopDetailData) {
  const updateMutation = useMutation(api.shop.mutations.updateShopSetting);
  const latestShopRef = useRef(shop);
  const [updatingSetting, setUpdatingSetting] = useState<ShopSettingKind | null>(null);
  latestShopRef.current = shop;

  const { run } = useSingleFlight(async (change: UpdateShopSettingInput) => {
    const latestShop = latestShopRef.current;
    if (!latestShop.canUpdateSettings) return false;

    setUpdatingSetting(change.kind);
    try {
      await updateMutation({
        shopId: latestShop.id as Id<"shops">,
        change,
      });
      showSuccessToast({ title: SUCCESS_TITLES[change.kind] });
      return true;
    } catch (error) {
      showErrorToast(error);
      return false;
    } finally {
      setUpdatingSetting(null);
    }
  });

  return {
    updatingSetting,
    updateSetting: async (change: UpdateShopSettingInput) => {
      await run(change);
    },
  };
}
