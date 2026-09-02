import { type CSSProperties, useEffect, useMemo, useState } from "react";

export const DIALOG_VISUAL_VIEWPORT_HEIGHT = "var(--dialog-visual-viewport-height, 100dvh)";
export const DIALOG_VISUAL_VIEWPORT_OFFSET_TOP = "var(--dialog-visual-viewport-offset-top, 0px)";

type DialogVisualViewportMetrics = {
  height: number;
  offsetTop: number;
  width: number;
};

type DialogVisualViewportStyle = CSSProperties & {
  "--dialog-visual-viewport-height": string;
  "--dialog-visual-viewport-offset-top": string;
};

const toMetrics = (): DialogVisualViewportMetrics => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;
  const width = window.innerWidth;

  return {
    height: Math.round(height),
    offsetTop: Math.round(offsetTop),
    width: Math.round(width),
  };
};

export const useDialogVisualViewport = (
  enabled: boolean,
): {
  height: number | undefined;
  offsetTop: number | undefined;
  width: number | undefined;
  style: DialogVisualViewportStyle | undefined;
} => {
  const [metrics, setMetrics] = useState<DialogVisualViewportMetrics>();

  useEffect(() => {
    if (!enabled) return;

    const updateMetrics = () => {
      const nextMetrics = toMetrics();
      setMetrics((current) =>
        current?.height === nextMetrics.height &&
        current.offsetTop === nextMetrics.offsetTop &&
        current.width === nextMetrics.width
          ? current
          : nextMetrics,
      );
    };

    updateMetrics();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", updateMetrics);
    viewport?.addEventListener("scroll", updateMetrics);
    window.addEventListener("resize", updateMetrics);

    return () => {
      viewport?.removeEventListener("resize", updateMetrics);
      viewport?.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [enabled]);

  return useMemo(() => {
    if (!enabled) return { height: undefined, offsetTop: undefined, width: undefined, style: undefined };

    return {
      height: metrics?.height,
      offsetTop: metrics?.offsetTop,
      width: metrics?.width,
      style: {
        "--dialog-visual-viewport-height": metrics ? `${metrics.height}px` : "100dvh",
        "--dialog-visual-viewport-offset-top": metrics ? `${metrics.offsetTop}px` : "0px",
      },
    };
  }, [enabled, metrics]);
};

export const useDialogVisualViewportStyle = (enabled: boolean): DialogVisualViewportStyle | undefined =>
  useDialogVisualViewport(enabled).style;
