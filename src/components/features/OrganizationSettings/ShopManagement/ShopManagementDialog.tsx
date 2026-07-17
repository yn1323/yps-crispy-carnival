import { Stack, Text } from "@chakra-ui/react";
import { ShopForm, type ShopFormData } from "@/src/components/features/ShopForm";
import { Dialog } from "@/src/components/ui/Dialog";
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

  if (dialog.kind === "addShop") {
    return (
      <StepperDialog
        title="店舗を追加"
        isOpen
        onOpenChange={({ open }) => {
          if (!open) onClose();
        }}
        onClose={onClose}
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

  const isArchive = dialog.kind === "archiveShop";
  return (
    <Dialog
      title={isArchive ? "店舗をアーカイブ" : "店舗を再稼働"}
      isOpen
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      onSubmit={() => onSubmit({ kind: dialog.kind, shopId: dialog.shop.id })}
      submitLabel={isArchive ? "アーカイブする" : "再稼働する"}
      isLoading={isRunning}
      role="alertdialog"
      maxW={{ base: "calc(100vw - 24px)", md: "520px" }}
    >
      <Stack gap={3}>
        <Text fontWeight="bold">{dialog.shop.name}</Text>
        <Text fontSize="sm" color="fg.muted" lineHeight="tall">
          {isArchive
            ? "店舗データと過去のシフトは削除しません。アーカイブ後も履歴を閲覧できます。"
            : "現在のプラン上限を確認し、この店舗でシフト運用を再開します。"}
        </Text>
      </Stack>
    </Dialog>
  );
}
