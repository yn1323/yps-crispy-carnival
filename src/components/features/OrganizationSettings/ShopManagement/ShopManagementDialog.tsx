import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import type { ShopManagementDialogState, ShopManagementOperation } from "./types";

const ADD_SHOP_DEFAULT_VALUES: ShopFormData = {
  shopName: "",
  regularClosedDays: [],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
};

type Props = {
  dialog: ShopManagementDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (operation: ShopManagementOperation) => void | Promise<void>;
};

export function ShopManagementDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  if (!dialog) return null;

  return (
    <StepperDialog
      title="店舗を追加"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      preventClose={isRunning}
    >
      <ShopForm
        defaultValues={ADD_SHOP_DEFAULT_VALUES}
        onSubmit={(data) => onSubmit({ kind: "addShop", data })}
        onCancel={onClose}
        submitLabel="店舗を追加"
      />
    </StepperDialog>
  );
}
