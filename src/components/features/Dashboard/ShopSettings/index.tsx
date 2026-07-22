import { type ReactNode, useEffect } from "react";
import { api } from "@/convex/_generated/api";
import type { ShopFormData } from "@/src/components/features/ShopForm";
import { showErrorToast, showSuccessToast } from "@/src/components/shared/feedback";
import { useDialog } from "@/src/components/ui/Dialog";
import { useShopMutation } from "@/src/hooks/useShopMutation";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { ShopSettingsView } from "./ShopSettingsView";

export type ShopSettingsData = {
  name: string;
  regularClosedDays: ShopFormData["regularClosedDays"];
  submissionPattern: ShopFormData["submissionPattern"];
};

type Props = {
  shop: ShopSettingsData;
  isReadOnly?: boolean;
  children: (actions: { openShopSettings: () => void }) => ReactNode;
};

export function ShopSettings({ shop, isReadOnly = false, children }: Props) {
  const dialog = useDialog();
  const updateShopSettings = useShopMutation(api.shop.mutations.updateShopSettings);

  useEffect(() => {
    if (isReadOnly) dialog.close();
  }, [dialog.close, isReadOnly]);

  const { run: handleUpdate } = useSingleFlight(async (data: ShopFormData) => {
    if (isReadOnly) return;
    try {
      await updateShopSettings(data);
      dialog.close();
      showSuccessToast({ title: "店舗設定を更新しました" });
    } catch (error) {
      showErrorToast(error);
    }
  });

  const handleOpen = () => {
    if (isReadOnly) return;
    dialog.open();
  };

  return (
    <ShopSettingsView shop={shop} dialog={dialog} isReadOnly={isReadOnly} onUpdate={handleUpdate}>
      {children({ openShopSettings: handleOpen })}
    </ShopSettingsView>
  );
}
