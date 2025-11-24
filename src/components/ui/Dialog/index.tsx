import { Button, Dialog as ChakraDialog, CloseButton, Portal } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

// useDialogフック - Dialog の開閉を制御
export const useDialog = (defaultOpen = false) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const onOpenChange = useCallback((details: { open: boolean }) => {
    setIsOpen(details.open);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    onOpenChange,
  };
};

// 汎用Dialogコンポーネント - ガワを提供
type DialogProps = {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  onClose?: () => void;
  closeLabel?: string;
  isLoading?: boolean;
  role?: "dialog" | "alertdialog";
  submitColorPalette?: string;
};

export const Dialog = ({
  title,
  children,
  isOpen,
  onOpenChange,
  onSubmit,
  submitLabel = "送信",
  onClose,
  closeLabel = "キャンセル",
  isLoading = false,
  role = "dialog",
  submitColorPalette = "teal",
}: DialogProps) => {
  return (
    <ChakraDialog.Root open={isOpen} onOpenChange={onOpenChange} role={role} placement="center">
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content>
            <ChakraDialog.Header>
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
            </ChakraDialog.Header>
            <ChakraDialog.Body>{children}</ChakraDialog.Body>
            <ChakraDialog.Footer>
              <Button variant="outline" onClick={onClose}>
                {closeLabel}
              </Button>
              {onSubmit && (
                <Button colorPalette={submitColorPalette} onClick={onSubmit} loading={isLoading}>
                  {submitLabel}
                </Button>
              )}
            </ChakraDialog.Footer>
            <ChakraDialog.CloseTrigger position="absolute" top="2" insetEnd="2">
              <CloseButton size="sm" />
            </ChakraDialog.CloseTrigger>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
