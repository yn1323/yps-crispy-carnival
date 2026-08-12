import { Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";

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
    preventClose={isSaving}
    footer={
      <DialogActionArea
        layout="standard"
        mobileLayout="stacked"
        startAction={
          <Button colorPalette="red" variant="outline" onClick={onLeaveWithoutSaving} disabled={isSaving}>
            保存せず戻る
          </Button>
        }
        endAction={
          <Button colorPalette="teal" onClick={onSaveAndLeave} loading={isSaving} loadingText="保存して戻る">
            保存して戻る
          </Button>
        }
      />
    }
  >
    <Text fontSize="sm" lineHeight="tall">
      このまま戻ると、シフトの変更内容は失われます。
      <br />
      これまでの編集内容を保存しますか？
    </Text>
  </Dialog>
);
