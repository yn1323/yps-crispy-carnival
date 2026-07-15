import type { ReactNode } from "react";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { EditShopForm, type EditShopFormData } from "../EditShopForm";

type Props = {
  children: ReactNode;
  shop: {
    name: string;
    regularClosedDays: EditShopFormData["regularClosedDays"];
    submissionPattern: EditShopFormData["submissionPattern"];
  };
  dialog: {
    isOpen: boolean;
    onOpenChange: (details: { open: boolean }) => void;
    close: () => void;
  };
  onUpdate: (data: EditShopFormData) => void | Promise<void>;
};

export function ShopSettingsView({ children, shop, dialog, onUpdate }: Props) {
  return (
    <>
      {children}
      <StepperDialog title="店舗設定" isOpen={dialog.isOpen} onOpenChange={dialog.onOpenChange} onClose={dialog.close}>
        <EditShopForm
          key={dialog.isOpen ? "edit-shop-open" : "edit-shop-closed"}
          defaultValues={{
            shopName: shop.name,
            regularClosedDays: shop.regularClosedDays,
            submissionPattern: shop.submissionPattern,
          }}
          onSubmit={onUpdate}
          onCancel={dialog.close}
        />
      </StepperDialog>
    </>
  );
}
