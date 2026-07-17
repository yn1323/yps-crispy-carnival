import type { ReactNode } from "react";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { StepperDialog } from "@/src/components/ui/StepperDialog";

type Props = {
  children: ReactNode;
  shop: {
    name: string;
    regularClosedDays: ShopFormData["regularClosedDays"];
    submissionPattern: ShopFormData["submissionPattern"];
  };
  isReadOnly: boolean;
  dialog: {
    isOpen: boolean;
    onOpenChange: (details: { open: boolean }) => void;
    close: () => void;
  };
  onUpdate: (data: ShopFormData) => void | Promise<void>;
};

export function ShopSettingsView({ children, shop, dialog, isReadOnly, onUpdate }: Props) {
  return (
    <>
      {children}
      <StepperDialog
        title="店舗設定"
        isOpen={dialog.isOpen && !isReadOnly}
        onOpenChange={dialog.onOpenChange}
        onClose={dialog.close}
      >
        <ShopForm
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
