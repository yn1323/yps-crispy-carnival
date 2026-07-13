import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import type { EditShopFormData } from "../EditShopForm";
import { ShopSettingsView } from "./ShopSettingsView";

export type ShopSettingsData = {
  name: string;
  regularClosedDays: EditShopFormData["regularClosedDays"];
  submissionPattern: EditShopFormData["submissionPattern"];
};

type Props = {
  shop: ShopSettingsData;
  children: (actions: { openShopSettings: () => void }) => ReactNode;
};

export function ShopSettings({ shop, children }: Props) {
  const dialog = useDialog();
  const updateShopSettings = useShopMutation(api.shop.mutations.updateShopSettings);
  const { run: handleUpdate } = useSingleFlight(async (data: EditShopFormData) => {
    try {
      await updateShopSettings(data);
      dialog.close();
      showSuccessToast({ title: "店舗設定を更新しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  return (
    <ShopSettingsView shop={shop} dialog={dialog} onUpdate={handleUpdate}>
      {children({ openShopSettings: dialog.open })}
    </ShopSettingsView>
  );
}
