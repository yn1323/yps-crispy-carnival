import { Box, Dialog as ChakraDialog, CloseButton, Flex, mergeRefs, Portal } from "@chakra-ui/react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button } from "@/src/components/ui/Button";
import { TOASTER_LAYER_SELECTOR } from "@/src/components/ui/toaster";
import { useCloseDialogOnBrowserBack } from "@/src/hooks/useCloseDialogOnBrowserBack";
import {
  DIALOG_VISUAL_VIEWPORT_HEIGHT,
  DIALOG_VISUAL_VIEWPORT_OFFSET_TOP,
  useDialogVisualViewportStyle,
} from "@/src/hooks/useDialogVisualViewportStyle";

const getInteractOutsideTarget = (event: Event) => {
  // ZagはDialog nodeからCustomEventをdispatchし、実際の操作対象をdetailへ保持する。
  const detail = (event as { detail?: { target?: EventTarget | null; originalEvent?: Event } }).detail;
  if (detail?.target instanceof Element) return detail.target;
  if (detail?.originalEvent?.target instanceof Element) return detail.originalEvent.target;

  return event.target instanceof Element ? event.target : null;
};

const preventCloseWhenInteractingWithToaster: NonNullable<
  ComponentProps<typeof ChakraDialog.Root>["onInteractOutside"]
> = (event) => {
  if (getInteractOutsideTarget(event)?.closest(TOASTER_LAYER_SELECTOR)) {
    event.preventDefault();
  }
};

export type DialogActionAreaLayout = "standard" | "flow";

type DialogActionAreaActions =
  | { startAction: ReactNode; endAction?: ReactNode }
  | { startAction?: ReactNode; endAction: ReactNode };

export type DialogActionAreaProps = DialogActionAreaActions & {
  layout: DialogActionAreaLayout;
};

const mergeMobileFullScreenSize = (value: unknown, mobileValue: string, desktopFallback: string) => {
  if (Array.isArray(value)) {
    const merged = [mobileValue, ...value.slice(1)];
    if (!merged.slice(1).some((item) => item != null)) merged[3] = desktopFallback;
    return merged;
  }
  if (value && typeof value === "object") {
    const responsiveValue = value as Record<string, unknown>;
    const hasDesktopValue = Object.entries(responsiveValue).some(([key, item]) => key !== "base" && item != null);
    return hasDesktopValue
      ? { ...responsiveValue, base: mobileValue }
      : { ...responsiveValue, base: mobileValue, lg: desktopFallback };
  }
  return { base: mobileValue, lg: value ?? desktopFallback };
};

const DialogActionSlot = ({ children, position }: { children: ReactNode; position: "start" | "end" }) => (
  <Box
    data-dialog-action={position}
    display="grid"
    flex={{ base: 1, md: "none" }}
    w={{ base: "auto", md: "auto" }}
    minW={0}
    minH={{ base: 11, md: "auto" }}
    css={{
      "& > button": {
        minWidth: 0,
      },
      "@media screen and (max-width: 47.997rem)": {
        "& > button": {
          minHeight: "44px",
          height: "auto",
          paddingBlock: "0.5rem",
          whiteSpace: "normal",
          overflowWrap: "anywhere",
        },
      },
    }}
  >
    {children}
  </Box>
);

/** Buttonの意味や配色とは独立して、Dialog内のaction配置とDOM順を揃える。 */
export const DialogActionArea = ({ startAction, endAction, layout }: DialogActionAreaProps) => {
  const desktopJustify =
    layout === "standard"
      ? "flex-end"
      : startAction && endAction
        ? "space-between"
        : endAction
          ? "flex-end"
          : "flex-start";

  return (
    <Flex
      data-dialog-action-area
      data-layout={layout}
      w="full"
      direction="row"
      align={{ base: "stretch", md: "center" }}
      justify={{ base: "flex-start", md: desktopJustify }}
      gap={3}
      flexWrap="nowrap"
    >
      {startAction && <DialogActionSlot position="start">{startAction}</DialogActionSlot>}
      {endAction && <DialogActionSlot position="end">{endAction}</DialogActionSlot>}
    </Flex>
  );
};

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
export type DialogProps = {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onSubmit?: () => void | Promise<void>;
  submitLabel?: string;
  onClose?: () => void;
  onBackGuardRemoved?: () => void;
  closeLabel?: string;
  isLoading?: boolean;
  isSubmitDisabled?: boolean;
  role?: "dialog" | "alertdialog";
  submitColorPalette?: string;
  hideFooter?: boolean;
  footer?: ReactNode;
  maxW?: ComponentProps<typeof ChakraDialog.Content>["maxW"];
  maxH?: ComponentProps<typeof ChakraDialog.Content>["maxH"];
  formId?: string;
  modal?: boolean;
  keyboardAwareViewport?: boolean;
  positionerProps?: ComponentProps<typeof ChakraDialog.Positioner>;
  contentProps?: ComponentProps<typeof ChakraDialog.Content>;
  bodyProps?: ComponentProps<typeof ChakraDialog.Body>;
  preventClose?: boolean;
  unmountOnExit?: boolean;
  actionLayout?: DialogActionAreaLayout;
  mobileFullScreen?: boolean;
};

export const Dialog = ({
  title,
  children,
  isOpen,
  onOpenChange,
  onSubmit,
  submitLabel = "送信",
  onClose,
  onBackGuardRemoved,
  closeLabel,
  isLoading = false,
  isSubmitDisabled = false,
  role = "dialog",
  submitColorPalette = "teal",
  hideFooter = false,
  footer,
  maxW,
  maxH,
  formId,
  modal = true,
  keyboardAwareViewport = false,
  positionerProps,
  contentProps,
  bodyProps,
  preventClose = false,
  unmountOnExit = false,
  actionLayout = "standard",
  mobileFullScreen = false,
}: DialogProps) => {
  const isBusy = preventClose || isLoading;
  const hasSubmitAction = Boolean(onSubmit || formId);
  const resolvedCloseLabel = closeLabel ?? (hasSubmitAction ? "キャンセル" : "閉じる");
  const usesKeyboardAwareViewport = keyboardAwareViewport || mobileFullScreen;
  const resolvedMaxW = mobileFullScreen
    ? (mergeMobileFullScreenSize(maxW, "100vw", "640px") as DialogProps["maxW"])
    : maxW;
  const resolvedMaxH = mobileFullScreen
    ? (mergeMobileFullScreenSize(maxH, DIALOG_VISUAL_VIEWPORT_HEIGHT, "85dvh") as DialogProps["maxH"])
    : maxH;
  const hasScrollableBody = Boolean(resolvedMaxH || contentProps?.maxH || contentProps?.h);
  const viewportStyle = useDialogVisualViewportStyle(isOpen && usesKeyboardAwareViewport);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTriggerRef = useRef<HTMLButtonElement>(null);
  const { ref: contentPropsRef, tabIndex: contentTabIndex, ...restContentProps } = contentProps ?? {};
  const mergedContentRef = useMemo(() => mergeRefs(contentRef, contentPropsRef), [contentPropsRef]);
  const handleOpenChange = useCallback(
    (details: { open: boolean }) => {
      if (isBusy && !details.open) return;
      onOpenChange(details);
    },
    [isBusy, onOpenChange],
  );
  const handleClose = useCallback(() => {
    if (isBusy) return;
    if (onClose) {
      onClose();
      return;
    }
    handleOpenChange({ open: false });
  }, [handleOpenChange, isBusy, onClose]);
  useCloseDialogOnBrowserBack(isOpen, () => handleOpenChange({ open: false }), onBackGuardRemoved, !isBusy);
  const { style: positionerStyle, ...restPositionerProps } = positionerProps ?? {};

  const closeAction = (
    <Button type="button" variant="outline" onClick={handleClose} disabled={isBusy}>
      {resolvedCloseLabel}
    </Button>
  );
  const submitAction = hasSubmitAction ? (
    <Button
      colorPalette={submitColorPalette}
      {...(formId ? { type: "submit" as const, form: formId } : { type: "button" as const, onClick: onSubmit })}
      loading={isLoading}
      loadingText={submitLabel}
      disabled={isSubmitDisabled || isBusy}
    >
      {submitLabel}
    </Button>
  ) : undefined;

  return (
    <ChakraDialog.Root
      open={isOpen}
      lazyMount
      unmountOnExit={unmountOnExit}
      onOpenChange={handleOpenChange}
      role={role}
      placement="center"
      modal={modal}
      closeOnEscape={!isBusy}
      closeOnInteractOutside={!isBusy}
      onInteractOutside={preventCloseWhenInteractingWithToaster}
      {...(role === "alertdialog"
        ? { initialFocusEl: () => closeTriggerRef.current ?? contentRef.current }
        : undefined)}
    >
      <Portal>
        <ChakraDialog.Backdrop />
        <ChakraDialog.Positioner
          h={usesKeyboardAwareViewport ? DIALOG_VISUAL_VIEWPORT_HEIGHT : undefined}
          maxH={usesKeyboardAwareViewport ? DIALOG_VISUAL_VIEWPORT_HEIGHT : undefined}
          top={usesKeyboardAwareViewport ? DIALOG_VISUAL_VIEWPORT_OFFSET_TOP : undefined}
          {...restPositionerProps}
          style={{
            ...viewportStyle,
            ...positionerStyle,
          }}
        >
          <ChakraDialog.Content
            ref={mergedContentRef}
            maxW={resolvedMaxW}
            maxH={resolvedMaxH}
            w={mobileFullScreen ? "full" : undefined}
            h={mobileFullScreen ? { base: DIALOG_VISUAL_VIEWPORT_HEIGHT, lg: "auto" } : undefined}
            my={mobileFullScreen ? { base: 0, lg: "var(--dialog-base-margin)" } : undefined}
            borderRadius={mobileFullScreen ? { base: 0, lg: "l3" } : undefined}
            display={hasScrollableBody ? "flex" : undefined}
            flexDirection="column"
            overflow={hasScrollableBody ? "hidden" : undefined}
            aria-busy={isBusy || undefined}
            tabIndex={role === "alertdialog" ? (contentTabIndex ?? -1) : contentTabIndex}
            {...restContentProps}
          >
            <ChakraDialog.Header
              flexShrink={0}
              pt={mobileFullScreen ? { base: "calc(env(safe-area-inset-top) + 1.5rem)", lg: 6 } : undefined}
            >
              <ChakraDialog.Title>{title}</ChakraDialog.Title>
            </ChakraDialog.Header>
            <ChakraDialog.Body
              flex={hasScrollableBody ? 1 : undefined}
              minH={hasScrollableBody ? 0 : undefined}
              overflowY={hasScrollableBody ? "auto" : undefined}
              {...bodyProps}
            >
              {children}
            </ChakraDialog.Body>
            {!hideFooter && (
              <ChakraDialog.Footer
                flexShrink={0}
                borderTopWidth={hasScrollableBody ? 1 : undefined}
                borderColor={hasScrollableBody ? "border.default" : undefined}
                pb={mobileFullScreen ? { base: "calc(env(safe-area-inset-bottom) + 1rem)", lg: 4 } : undefined}
              >
                {footer ?? (
                  <DialogActionArea
                    layout={actionLayout}
                    startAction={submitAction ? closeAction : undefined}
                    endAction={submitAction ?? closeAction}
                  />
                )}
              </ChakraDialog.Footer>
            )}
            {!isBusy && (
              <ChakraDialog.CloseTrigger
                asChild
                position="absolute"
                top={mobileFullScreen ? { base: "calc(env(safe-area-inset-top) + 0.5rem)", lg: 2 } : 2}
                insetEnd={mobileFullScreen ? { base: "calc(env(safe-area-inset-right) + 0.5rem)", lg: 2 } : 2}
              >
                <CloseButton ref={closeTriggerRef} size="sm" aria-label="閉じる" />
              </ChakraDialog.CloseTrigger>
            )}
          </ChakraDialog.Content>
        </ChakraDialog.Positioner>
      </Portal>
    </ChakraDialog.Root>
  );
};
