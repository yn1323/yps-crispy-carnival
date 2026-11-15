import { Box, Flex, Text } from "@chakra-ui/react";
import { useState } from "react";
import { MOBILE_APP_NAVIGATION_HEIGHT } from "@/src/components/features/AuthenticatedApp/AppPrimaryNavigation";
import { Button } from "@/src/components/ui/Button";
import { Dialog, DialogActionArea } from "@/src/components/ui/Dialog";
import { formatPendingSections } from "./script";
import type { LeaveDialogState, PendingSection } from "./types";

type BarProps = {
  sections: readonly PendingSection[];
  isSaving: boolean;
  onReset: () => void;
  onSave: () => void;
};

/**
 * 保存していない変更があるときだけ、画面の下端に留まる操作バーを出す。
 * 何の変更が保存されるかを、セクションの名前で示す。
 */
export function PendingChangesBar({ sections, isSaving, onReset, onSave }: BarProps) {
  const [isResetConfirmationOpen, setIsResetConfirmationOpen] = useState(false);
  const closeResetConfirmation = () => setIsResetConfirmationOpen(false);
  const label = formatPendingSections(sections);

  return (
    <>
      {sections.length > 0 && (
        <Box
          position="sticky"
          // スマートフォンでは、画面下端に固定されたメインメニューの上に留める。
          bottom={{ base: `calc(${MOBILE_APP_NAVIGATION_HEIGHT} + env(safe-area-inset-bottom) + 8px)`, lg: 4 }}
          zIndex="docked"
        >
          <Flex
            role="region"
            aria-label="保存していない変更"
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            gap={3}
            px={{ base: 3, md: 5 }}
            py={3}
            bg="white"
            borderWidth="1px"
            borderColor="gray.300"
            borderRadius="xl"
            boxShadow="lg"
          >
            <Text fontSize="sm" fontWeight="semibold" color="gray.900">
              {label}の変更を保存していません
            </Text>
            <Flex gap={2} flexShrink={0}>
              <Button
                type="button"
                variant="outline"
                bg="white"
                flex={{ base: 1, md: "none" }}
                minH={{ base: "44px", md: "40px" }}
                disabled={isSaving}
                onClick={() => setIsResetConfirmationOpen(true)}
              >
                元に戻す
              </Button>
              <Button
                type="button"
                colorPalette="teal"
                flex={{ base: 1, md: "none" }}
                minH={{ base: "44px", md: "40px" }}
                loading={isSaving}
                loadingText="保存する"
                onClick={onSave}
              >
                保存する
              </Button>
            </Flex>
          </Flex>
        </Box>
      )}

      <Dialog
        title="変更を元に戻す"
        isOpen={isResetConfirmationOpen && sections.length > 0}
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
