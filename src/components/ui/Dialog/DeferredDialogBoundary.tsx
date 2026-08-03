import { Skeleton, Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { ErrorBoundary } from "@/src/components/ui/ErrorBoundary";
import { Dialog } from ".";

type Props = {
  title: string;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  children: ReactNode;
};

/** dynamic import中とchunk取得失敗を、呼び出し元画面ではなくDialog内へ閉じ込める。 */
export function DeferredDialogBoundary({ title, isOpen, onOpenChange, onClose, children }: Props) {
  return (
    <ErrorBoundary
      fallback={
        <Dialog
          title={title}
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          onClose={onClose}
          closeLabel="閉じる"
          maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
        >
          <Empty
            icon={LuTriangleAlert}
            title={`${title}を表示できませんでした`}
            description="通信状態を確認してページを再読み込みしてください。"
            tone="danger"
            minH="220px"
            action={
              <Button colorPalette="teal" onClick={() => window.location.reload()}>
                ページを再読み込みする
              </Button>
            }
          />
        </Dialog>
      }
    >
      <Suspense
        fallback={
          <Dialog
            title={title}
            isOpen={isOpen}
            onOpenChange={onOpenChange}
            onClose={onClose}
            hideFooter
            maxW={{ base: "calc(100vw - 24px)", md: "560px" }}
          >
            <Stack gap={4} minH="220px" aria-label={`${title}を読み込み中`} aria-busy="true">
              <Skeleton h="20px" w="72%" />
              <Skeleton h="48px" w="full" borderRadius="lg" />
              <Skeleton h="48px" w="full" borderRadius="lg" />
            </Stack>
          </Dialog>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}
