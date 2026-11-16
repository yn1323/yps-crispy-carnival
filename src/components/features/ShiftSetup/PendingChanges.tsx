import { chakra, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import { formatPendingSections } from "./script";
import type { LeaveDialogState, PendingSection } from "./types";

type ActionsProps = {
  sections: readonly PendingSection[];
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
};

/**
 * ページの見出しの行に置く、保存の操作。
 * 「保存する」は常に同じ位置に出し、保存していない変更がない間は押せない状態にする。
 * 変更があるときだけ、その左に状態の短い文と「元に戻す」を出す。
 */
export function PendingChangesActions({ sections, isSaving, onReset, onSave }: ActionsProps) {
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const closeResetConfirmation = () => setIsResetConfirmationOpen(false);
  const label = formatPendingSections(sections);
  const hasChanges = sections.length > 0;

  return (
    <>
      <Flex role="group" aria-label="変更の保存" align="center" justify="flex-end" gap={{ base: 1, md: 2 }} minW={0}>
        <Text
          role="status"
          flex={{ base: 1, md: "none" }}
          minW={0}
          fontSize="sm"
          fontWeight="semibold"
          lineHeight="1.3"
          color="gray.900"
        >
          {hasChanges && (
            // 幅が足りないときは、文節の境目でだけ折り返す。
            <>
              <chakra.span display="inline-block">変更を</chakra.span>
              <chakra.span display="inline-block">保存していません</chakra.span>
            </>
          )}
        </Text>
        {hasChanges && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            color="gray.700"
            flexShrink={0}
            minH={{ base: "44px", md: "36px" }}
            px={2}
            disabled={isSaving}
            onClick={() => setIsResetConfirmationOpen(true)}
          >
            元に戻す
          </Button>
        )}
        <Button
          type="button"
          colorPalette="teal"
          size="sm"
          flexShrink={0}
          minH={{ base: "44px", md: "36px" }}
          disabled={!hasChanges}
          loading={isSaving}
          loadingText="保存する"
          onClick={onSave}
        >
          保存する
        </Button>
      </Flex>

      <Dialog
        title="変更を元に戻す"
        isOpen={isResetConfirmationOpen && hasChanges}
        onOpenChange={({ open }) => {
          if (!open) closeResetConfirmation();
        }}
        onClose={closeResetConfirmation}
        role="alertdialog"
        onSubmit={() => {
          closeResetConfirmation();
          onReset();
        }}
        submitLabel="元に戻す"
        submitColorPalette="red"
      >
        <Text fontSize="sm" lineHeight="tall">
          {label}の変更を取り消し、最後に保存した内容へ戻します。
        </Text>
      </Dialog>
    </>
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
