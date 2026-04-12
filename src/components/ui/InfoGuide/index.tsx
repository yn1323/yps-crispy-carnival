import { Box, Button, Dialog as ChakraDialog, Circle, CloseButton, HStack, IconButton, Portal } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { useDialog } from "@/src/components/ui/Dialog";

type InfoGuideProps = {
  title: string;
  pages: ReactNode[];
  size?: "xs" | "sm";
};

export function InfoGuide({ title, pages, size = "xs" }: InfoGuideProps) {
  const dialog = useDialog();
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = pages.length;
  const isMultiPage = totalPages > 1;
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  const handleOpen = useCallback(() => {
    setCurrentPage(0);
    dialog.open();
  }, [dialog]);

  return (
    <>
      <IconButton aria-label={title} variant="ghost" size={size} color="fg.muted" onClick={handleOpen}>
        <LuInfo />
      </IconButton>

      <ChakraDialog.Root open={dialog.isOpen} onOpenChange={dialog.onOpenChange} placement="center">
        <Portal>
          <ChakraDialog.Backdrop />
          <ChakraDialog.Positioner>
            <ChakraDialog.Content>
              <ChakraDialog.Header>
                <ChakraDialog.Title>{title}</ChakraDialog.Title>
              </ChakraDialog.Header>
              <ChakraDialog.Body>
                <Box minH="4rem">{pages[currentPage]}</Box>
              </ChakraDialog.Body>
              {isMultiPage && (
                <HStack justify="center" gap={1.5} pb={2}>
                  {pages.map((_, i) => (
                    <Circle key={i} size="2" bg={i === currentPage ? "teal.500" : "gray.300"} />
                  ))}
                </HStack>
              )}
              <ChakraDialog.Footer>
                {isMultiPage && !isFirstPage && (
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => p - 1)}>
                    戻る
                  </Button>
                )}
                {isMultiPage && !isLastPage ? (
                  <Button colorPalette="teal" size="sm" onClick={() => setCurrentPage((p) => p + 1)}>
                    次へ
                  </Button>
                ) : (
                  <Button colorPalette="teal" size="sm" onClick={dialog.close}>
                    閉じる
                  </Button>
                )}
              </ChakraDialog.Footer>
              <ChakraDialog.CloseTrigger asChild position="absolute" top="2" insetEnd="2">
                <CloseButton size="sm" />
              </ChakraDialog.CloseTrigger>
            </ChakraDialog.Content>
          </ChakraDialog.Positioner>
        </Portal>
      </ChakraDialog.Root>
    </>
  );
}
