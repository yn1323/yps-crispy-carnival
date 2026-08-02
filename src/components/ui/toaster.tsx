import { Toaster as ChakraToaster, createToaster, Portal, Spinner, Stack, Toast } from "@chakra-ui/react";

export const TOASTER_LAYER_SELECTOR = "[data-shiftori-toaster-layer]";

export const toaster = createToaster({
  placement: "top",
  pauseOnPageIdle: true,
  duration: 2000,
});

export const Toaster = () => {
  return (
    <Portal>
      <div data-shiftori-toaster-layer="">
        <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
          {(toast) => (
            <Toast.Root width={{ md: "sm" }}>
              {toast.type === "loading" ? <Spinner size="sm" color="blue.solid" /> : <Toast.Indicator />}
              <Stack gap="1" flex="1" maxWidth="100%">
                {toast.title && <Toast.Title whiteSpace="pre-line">{toast.title}</Toast.Title>}
                {toast.description && <Toast.Description whiteSpace="pre-line">{toast.description}</Toast.Description>}
              </Stack>
              {toast.action && <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>}
              <Toast.CloseTrigger cursor="pointer" aria-label="通知を閉じる" />
            </Toast.Root>
          )}
        </ChakraToaster>
      </div>
    </Portal>
  );
};
