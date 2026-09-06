import { Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useId } from "react";
import { LuChevronDown, LuFileDown, LuSave, LuSend } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { ShiftFormExportAction } from "../components";

type Props = {
  isConfirmed: boolean;
  isSavingDraft: boolean;
  isConfirming: boolean;
  onSaveDraft?: () => void;
  onConfirm?: () => void;
  exportAction?: ShiftFormExportAction;
};

export function ActionsMenu({ isConfirmed, isSavingDraft, isConfirming, onSaveDraft, onConfirm, exportAction }: Props) {
  const descriptionId = useId();
  const isBusy = isSavingDraft || isConfirming;
  const label = `保存・${isConfirmed ? "再送" : "確定"}${exportAction ? "・出力" : ""}`;
  const confirmLabel = isConfirmed ? "確定シフトを再送" : "シフトを確定";

  return (
    <Menu.Root positioning={{ placement: "bottom-end", gutter: 8 }} lazyMount unmountOnExit>
      <Menu.Trigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          colorPalette="teal"
          minH="44px"
          px={3}
          gap={1}
          flexShrink={0}
          whiteSpace="nowrap"
          aria-label={label}
          aria-busy={isBusy}
          disabled={isBusy}
          loading={isBusy}
        >
          {label}
          <LuChevronDown aria-hidden />
        </Button>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content w="min(320px, calc(100vw - 24px))" maxH="calc(100dvh - 96px)" overflowY="auto">
            <Menu.Item
              value="save-draft"
              aria-label="下書きを保存"
              aria-describedby={`${descriptionId}-save`}
              disabled={isBusy || !onSaveDraft}
              onSelect={isBusy ? undefined : onSaveDraft}
              gap={3}
              px={3}
              py={3}
              cursor="pointer"
            >
              <LuSave aria-hidden />
              <Stack gap={1} minW={0}>
                <Menu.ItemText fontWeight="semibold">下書きを保存</Menu.ItemText>
                <Text id={`${descriptionId}-save`} fontSize="xs" color="fg.muted" whiteSpace="normal">
                  スタッフには通知しません
                </Text>
              </Stack>
            </Menu.Item>
            <Menu.Item
              value="confirm"
              aria-label={confirmLabel}
              aria-describedby={`${descriptionId}-confirm`}
              data-tour="confirm-button"
              disabled={isBusy || !onConfirm}
              onSelect={isBusy ? undefined : onConfirm}
              gap={3}
              px={3}
              py={3}
              cursor="pointer"
            >
              <LuSend aria-hidden />
              <Stack gap={1} minW={0}>
                <Menu.ItemText fontWeight="semibold">{confirmLabel}</Menu.ItemText>
                <Text id={`${descriptionId}-confirm`} fontSize="xs" color="fg.muted" whiteSpace="normal">
                  編集内容を保存し、対象スタッフへ通知します
                </Text>
              </Stack>
            </Menu.Item>
            {exportAction && (
              <>
                <Menu.Separator />
                <Menu.Item
                  value="export"
                  aria-label="PDF・Excel出力"
                  aria-describedby={`${descriptionId}-export`}
                  disabled={isBusy || exportAction.isDisabled}
                  onSelect={isBusy || exportAction.isDisabled ? undefined : exportAction.onClick}
                  gap={3}
                  px={3}
                  py={3}
                  cursor="pointer"
                >
                  <LuFileDown aria-hidden />
                  <Stack gap={1} minW={0}>
                    <Menu.ItemText fontWeight="semibold">PDF・Excel出力</Menu.ItemText>
                    <Text id={`${descriptionId}-export`} fontSize="xs" color="fg.muted" whiteSpace="normal">
                      保存したシフトの出力画面を別タブで開きます
                    </Text>
                  </Stack>
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
