import { Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";

type UnsavedChangesDialogProps = {
  isOpen: boolean;
  /** ダイアログを閉じてその場に留まる */
  onStay: () => void;
  onLeaveWithoutSaving: () => void;
  onSaveAndLeave: () => void;
  isSaving?: boolean;
};

export const UnsavedChangesDialog = ({
  isOpen,
  onStay,
  onLeaveWithoutSaving,
  onSaveAndLeave,
  isSaving = false,
}: UnsavedChangesDialogProps) => (
  <Dialog
    title="保存していない変更があります"
    isOpen={isOpen}
    onOpenChange={({ open }) => {
      if (!open) onStay();
    }}
    role="alertdialog"
    footer={
      <>
        <Button variant="outline" onClick={onLeaveWithoutSaving} disabled={isSaving}>
          保存せず離脱
        </Button>
        <Button colorPalette="teal" onClick={onSaveAndLeave} loading={isSaving}>
          保存して離脱
        </Button>
      </>
    }
  >
    <Text fontSize="sm" lineHeight="tall">
      このまま戻ると、シフトの変更内容は失われます。
    </Text>
  </Dialog>
);
