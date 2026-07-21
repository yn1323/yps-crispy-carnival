import { Box, Circle, HStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";

type InfoGuideProps = {
  title: string;
  pages: ReactNode[];
  size?: "xs" | "sm";
};

export function InfoGuide({ title, pages, size = "xs" }: InfoGuideProps) {
  const { isOpen, open, close, onOpenChange } = useDialog();
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = pages.length;
  const isMultiPage = totalPages > 1;
  const isFirstPage = currentPage === 0;
  const isLastPage = currentPage === totalPages - 1;

  const handleOpen = useCallback(() => {
    setCurrentPage(0);
    open();
  }, [open]);

  return (
    <>
      <IconButton aria-label={title} variant="ghost" size={size} color="fg.muted" onClick={handleOpen}>
        <LuInfo />
      </IconButton>

      <Dialog
        title={title}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        onClose={close}
        footer={
          <>
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
              <Button colorPalette="teal" size="sm" onClick={close}>
                閉じる
              </Button>
            )}
          </>
        }
      >
        <Box minH="4rem">{pages[currentPage]}</Box>
        {isMultiPage && (
          <HStack justify="center" gap={1.5} pt={2}>
            {pages.map((_, i) => (
              <Circle key={i} size="2" bg={i === currentPage ? "teal.500" : "gray.300"} />
            ))}
          </HStack>
        )}
      </Dialog>
    </>
  );
}
