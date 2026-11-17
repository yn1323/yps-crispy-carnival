import { Flex, Text } from "@chakra-ui/react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import { formatPendingSections } from "./script";
import type { LeaveDialogState, PendingSection } from "./types";

type ActionsProps = {
  sections: readonly PendingSection[];
  isSaving: boolean;
  onSave: () => void;
};

/**
 * ページの見出しの行に置く、保存の操作。
 * 「保存する」は常に同じ位置に出し、保存していない変更がない間は押せない状態にする。
 */
export function PendingChangesActions({ sections, isSaving, onSave }: ActionsProps) {
  return (
    <Flex role="group" aria-label="変更の保存" align="center" justify="flex-end" minW={0}>
      <Button
        type="button"
        colorPalette="teal"
        size="sm"
        flexShrink={0}
        minH={{ base: "44px", md: "36px" }}
        disabled={sections.length === 0}
        loading={isSaving}
        loadingText="保存する"
        onClick={onSave}
      >
        保存する
      </Button>
    </Flex>
  );
}

type LeaveDialogProps = {
  dialog: LeaveDialogState;
  sections: readonly PendingSection[];
};

/** 保存していない変更があるままページを離れようとしたときの確認。 */
export function LeaveConfirmationDialog({ dialog, sections }: LeaveDialogProps) {
  return (
    <Dialog
      title="保存していない変更があります"
      isOpen={dialog.isOpen}
      onOpenChange={({ open }) => {
        if (!open) dialog.onStay();
      }}
      role="alertdialog"
      preventClose={dialog.isSaving}
      footer={
        <DialogActionArea
          layout="standard"
          startAction={
            <Button
              colorPalette="red"
              variant="outline"
              onClick={dialog.onLeaveWithoutSaving}
              disabled={dialog.isSaving}
            >
              保存せず戻る
            </Button>
          }
          endAction={
            <Button
              colorPalette="teal"
              onClick={dialog.onSaveAndLeave}
              loading={dialog.isSaving}
              loadingText="保存して戻る"
            >
              保存して戻る
            </Button>
          }
        />
      }
    >
      <Text fontSize="sm" lineHeight="tall">
        このまま戻ると、{formatPendingSections(sections) || "設定"}の変更は失われます。
        <br />
        これまでの変更を保存しますか？
      </Text>
    </Dialog>
  );
}
