import { Toaster as ChakraToaster, createToaster, Portal, Spinner, Stack, Toast } from "@chakra-ui/react";
import { ConvexError } from "convex/values";

function hasStringData(error: unknown): error is { data: string } {
  return typeof error === "object" && error !== null && "data" in error && typeof error.data === "string";
}

export function showErrorToast(error: unknown): void {
  let title = "うまく処理できませんでした";
  if (hasStringData(error)) {
    title = error.data;
  } else if (error instanceof ConvexError && typeof error.data === "string") {
    title = error.data;
  }
  toaster.create({ title, type: "error", duration: Number.POSITIVE_INFINITY });
}

// 読了に必要な時間を文字数から概算する。短文は2秒、長文は最大8秒でクランプする
function calcReadingDuration(title: string, description?: string): number {
  const charCount = title.length + (description?.length ?? 0);
  return Math.min(8000, Math.max(2000, charCount * 120));
}

export function showSuccessToast(args: { title: string; description?: string }): void {
  toaster.create({
    ...args,
    type: "success",
    duration: calcReadingDuration(args.title, args.description),
  });
}

export const toaster = createToaster({
  placement: "top",
  pauseOnPageIdle: true,
  duration: 2000,
});

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            {toast.type === "loading" ? <Spinner size="sm" color="blue.solid" /> : <Toast.Indicator />}
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
            </Stack>
            {toast.action && <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>}
            <Toast.CloseTrigger cursor="pointer" />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
};
