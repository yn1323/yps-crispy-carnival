import { useCallback, useEffect, useRef, useState } from "react";

export type DialogKeyboardLayoutMode = "body-scroll" | "header-body-scroll" | "content-scroll";

/** label、入力欄、validation messageを同じ画面で確認するために残す最小高。 */
export const DIALOG_MIN_EDITING_SCROLLPORT_HEIGHT = 240;

const DIALOG_MOBILE_MAX_WIDTH = 1024;
const KEYBOARD_VIEWPORT_DELTA = 48;
const KEYBOARD_CLOSE_SETTLE_MS = 350;
const EDITABLE_INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

type UseDialogKeyboardLayoutOptions = {
  enabled: boolean;
  contentElement: HTMLElement | null;
  footerElement: HTMLElement | null;
  headerElement?: HTMLElement | null;
  leadingElement?: HTMLElement | null;
  viewportHeight: number | undefined;
  viewportOffsetTop: number | undefined;
  viewportWidth: number | undefined;
};

const isEditableElement = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement) || target.hasAttribute("disabled")) return false;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly;
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && EDITABLE_INPUT_TYPES.has(target.type);
  }

  return target.isContentEditable;
};

export const resolveDialogKeyboardLayoutMode = ({
  enabled,
  isEditing,
  viewportHeight,
  viewportWidth,
  contentHeight,
  footerHeight,
  topChromeHeight = 0,
}: {
  enabled: boolean;
  isEditing: boolean;
  viewportHeight: number | undefined;
  viewportWidth: number | undefined;
  contentHeight?: number;
  footerHeight: number;
  topChromeHeight?: number;
}): DialogKeyboardLayoutMode => {
  if (!enabled || !isEditing || viewportHeight == null || viewportWidth == null) return "body-scroll";
  if (viewportWidth >= DIALOG_MOBILE_MAX_WIDTH) return "body-scroll";

  const availableHeight = Math.min(viewportHeight, contentHeight ?? viewportHeight) - footerHeight - topChromeHeight;
  return availableHeight >= DIALOG_MIN_EDITING_SCROLLPORT_HEIGHT ? "header-body-scroll" : "content-scroll";
};

type DialogMeasurements = {
  contentHeight: number | undefined;
  footerHeight: number;
  topChromeHeight: number;
};

const getMeasuredHeight = (element: HTMLElement): number | undefined => {
  const height = Math.ceil(element.getBoundingClientRect().height);
  return Number.isFinite(height) && height > 0 ? height : undefined;
};

export const useDialogKeyboardLayout = ({
  enabled,
  contentElement,
  footerElement,
  headerElement,
  leadingElement,
  viewportHeight,
  viewportOffsetTop,
  viewportWidth,
}: UseDialogKeyboardLayoutOptions): { mode: DialogKeyboardLayoutMode; footerHeight: number } => {
  const [hasEditingSession, setHasEditingSession] = useState(false);
  const [focusedEditableElement, setFocusedEditableElement] = useState<HTMLElement | null>(null);
  const [measurements, setMeasurements] = useState<DialogMeasurements>({
    contentHeight: undefined,
    footerHeight: 0,
    topChromeHeight: 0,
  });
  const hasEditingSessionRef = useRef(false);
  const restingViewportHeightRef = useRef<number | null>(null);
  const restingViewportWidthRef = useRef<number | null>(null);
  const editingViewportBaselineRef = useRef<number | null>(null);
  const hasContractedViewportRef = useRef(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const viewportHeightRef = useRef(viewportHeight);
  viewportHeightRef.current = viewportHeight;

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current == null) return;
    window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = null;
  }, []);

  const finishEditingSession = useCallback(() => {
    clearBlurTimeout();
    hasEditingSessionRef.current = false;
    editingViewportBaselineRef.current = null;
    hasContractedViewportRef.current = false;
    setHasEditingSession(false);
  }, [clearBlurTimeout]);

  const beginEditingSession = useCallback(() => {
    clearBlurTimeout();
    if (hasEditingSessionRef.current) return;

    hasEditingSessionRef.current = true;
    editingViewportBaselineRef.current = restingViewportHeightRef.current ?? viewportHeightRef.current ?? null;
    hasContractedViewportRef.current = false;
    setHasEditingSession(true);
  }, [clearBlurTimeout]);

  useEffect(() => {
    if (!enabled) {
      finishEditingSession();
      setFocusedEditableElement(null);
      return;
    }

    const content = contentElement;
    if (!content) return;

    const updateFocus = (target: EventTarget | null) => {
      const focusedElement = isEditableElement(target) && content.contains(target) ? target : null;
      setFocusedEditableElement(focusedElement);
      if (focusedElement) {
        beginEditingSession();
        return;
      }

      if (hasEditingSessionRef.current) {
        clearBlurTimeout();
        blurTimeoutRef.current = window.setTimeout(finishEditingSession, KEYBOARD_CLOSE_SETTLE_MS);
      }
    };
    const handleFocusIn = (event: FocusEvent) => updateFocus(event.target);
    const handleFocusOut = (event: FocusEvent) => updateFocus(event.relatedTarget);

    updateFocus(document.activeElement);
    content.addEventListener("focusin", handleFocusIn);
    content.addEventListener("focusout", handleFocusOut);

    return () => {
      content.removeEventListener("focusin", handleFocusIn);
      content.removeEventListener("focusout", handleFocusOut);
      clearBlurTimeout();
    };
  }, [beginEditingSession, clearBlurTimeout, contentElement, enabled, finishEditingSession]);

  useEffect(() => {
    if (!enabled) {
      setMeasurements({ contentHeight: undefined, footerHeight: 0, topChromeHeight: 0 });
      return;
    }

    const content = contentElement;
    if (!content) return;

    const updateMeasurements = () => {
      const nextMeasurements = {
        contentHeight: getMeasuredHeight(content),
        footerHeight: footerElement ? (getMeasuredHeight(footerElement) ?? 0) : 0,
        topChromeHeight:
          (headerElement ? (getMeasuredHeight(headerElement) ?? 0) : 0) +
          (leadingElement ? (getMeasuredHeight(leadingElement) ?? 0) : 0),
      };
      setMeasurements((current) =>
        current.contentHeight === nextMeasurements.contentHeight &&
        current.footerHeight === nextMeasurements.footerHeight &&
        current.topChromeHeight === nextMeasurements.topChromeHeight
          ? current
          : nextMeasurements,
      );
    };
    updateMeasurements();
    window.addEventListener("resize", updateMeasurements);

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateMeasurements);
    observer?.observe(content);
    if (footerElement) observer?.observe(footerElement);
    if (headerElement) observer?.observe(headerElement);
    if (leadingElement) observer?.observe(leadingElement);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateMeasurements);
    };
  }, [contentElement, enabled, footerElement, headerElement, leadingElement]);

  useEffect(() => {
    if (!enabled || viewportHeight == null || viewportWidth == null) return;

    if (!hasEditingSession) {
      const viewportWidthChanged = restingViewportWidthRef.current !== viewportWidth;
      if (viewportWidthChanged || !focusedEditableElement) {
        restingViewportHeightRef.current = viewportHeight;
        restingViewportWidthRef.current = viewportWidth;
        return;
      }

      const restingHeight = restingViewportHeightRef.current;
      if (restingHeight != null && restingHeight - viewportHeight >= KEYBOARD_VIEWPORT_DELTA) {
        beginEditingSession();
        editingViewportBaselineRef.current = restingHeight;
        hasContractedViewportRef.current = true;
      } else if (restingHeight == null || viewportHeight > restingHeight) {
        restingViewportHeightRef.current = viewportHeight;
      }
      return;
    }

    const baselineHeight = editingViewportBaselineRef.current ?? viewportHeight;
    editingViewportBaselineRef.current = baselineHeight;
    if (baselineHeight - viewportHeight >= KEYBOARD_VIEWPORT_DELTA) {
      hasContractedViewportRef.current = true;
    }
    if (hasContractedViewportRef.current && viewportHeight >= baselineHeight) {
      restingViewportHeightRef.current = viewportHeight;
      restingViewportWidthRef.current = viewportWidth;
      finishEditingSession();
    }
  }, [
    beginEditingSession,
    enabled,
    finishEditingSession,
    focusedEditableElement,
    hasEditingSession,
    viewportHeight,
    viewportWidth,
  ]);

  const mode = resolveDialogKeyboardLayoutMode({
    enabled,
    isEditing: hasEditingSession,
    viewportHeight,
    viewportWidth,
    contentHeight: measurements.contentHeight,
    footerHeight: measurements.footerHeight,
    topChromeHeight: measurements.topChromeHeight,
  });

  useEffect(() => {
    if (mode === "body-scroll" || viewportHeight == null || !focusedEditableElement) return;

    const frame = window.requestAnimationFrame(() => {
      const content = contentElement;
      if (!content?.contains(focusedEditableElement) || document.activeElement !== focusedEditableElement) return;
      if (typeof focusedEditableElement.scrollIntoView !== "function") return;

      const viewportTop = viewportOffsetTop ?? 0;
      const viewportBottom = viewportTop + viewportHeight;
      const footerTop = footerElement?.getBoundingClientRect().top;
      const visibleBottom =
        mode === "header-body-scroll" && footerTop != null && Number.isFinite(footerTop)
          ? Math.min(viewportBottom, footerTop)
          : viewportBottom;
      const activeRect = focusedEditableElement.getBoundingClientRect();
      const margin = 16;

      if (activeRect.top < viewportTop + margin || activeRect.bottom > visibleBottom - margin) {
        focusedEditableElement.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [contentElement, focusedEditableElement, footerElement, mode, viewportHeight, viewportOffsetTop]);

  return { mode, footerHeight: measurements.footerHeight };
};
