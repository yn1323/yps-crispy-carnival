import { Dialog as ChakraDialog, CloseButton, Portal } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

// useBottomSheetフック - BottomSheet の開閉を制御
export const useBottomSheet = (defaultOpen = false) => {
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

// BottomSheetコンポーネント - 下からスライドするシート
type BottomSheetProps = {
  title?: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export const BottomSheet = ({ title, children, isOpen, onOpenChange }: BottomSheetProps) => {
  return (
    <ChakraDialog.Root open={isOpen} onOpenChange={onOpenChange} placement="bottom" modal={false}>
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner>
          <ChakraDialog.Content borderTopRadius="xl" maxH="60vh" w="100%">
            {title && (
              <ChakraDialog.Header>
                <ChakraDialog.Title>{title}</ChakraDialog.Title>
              </ChakraDialog.Header>
            )}
            <ChakraDialog.Body pt={title ? 0 : 10} pb={6} overflowY="auto">
              {children}
            </ChakraDialog.Body>
            <ChakraDialog.CloseTrigger position="absolute" top="2" insetEnd="2">
              <CloseButton size="sm" />
            </ChakraDialog.CloseTrigger>
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
