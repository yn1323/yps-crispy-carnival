import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import type { OrganizationCreationDialogState } from "./types";

const CREATE_ORGANIZATION_DEFAULT_VALUES: ShopFormData = {
  shopName: "",
  regularClosedDays: [],
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
};

type Props = {
  dialog: OrganizationCreationDialogState | null;
  isRunning: boolean;
  onClose: () => void;
  onSubmit: (data: ShopFormData) => void | Promise<void>;
};

export function OrganizationCreationDialog({ dialog, isRunning, onClose, onSubmit }: Props) {
  if (!dialog) return null;

  return (
    <StepperDialog
      title="新しい組織を作る"
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      preventClose={isRunning}
    >
      <ShopForm
        defaultValues={CREATE_ORGANIZATION_DEFAULT_VALUES}
        onSubmit={onSubmit}
        onCancel={onClose}
        submitLabel="作成する"
      />
    </StepperDialog>
  );
}
