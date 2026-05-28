import { type CSSProperties, useEffect, useMemo, useState } from "react";

export const DIALOG_VISUAL_VIEWPORT_HEIGHT = "var(--dialog-visual-viewport-height, 100dvh)";
export const DIALOG_VISUAL_VIEWPORT_OFFSET_TOP = "var(--dialog-visual-viewport-offset-top, 0px)";

type DialogVisualViewportMetrics = {
  height: string;
  offsetTop: string;
};

type DialogVisualViewportStyle = CSSProperties & {
  "--dialog-visual-viewport-height": string;
  "--dialog-visual-viewport-offset-top": string;
};

const FALLBACK_METRICS: DialogVisualViewportMetrics = {
  height: "100dvh",
  offsetTop: "0px",
};

const toMetrics = (): DialogVisualViewportMetrics => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  const offsetTop = viewport?.offsetTop ?? 0;

  return {
    height: `${Math.round(height)}px`,
    offsetTop: `${Math.round(offsetTop)}px`,
  };
};

export const useDialogVisualViewportStyle = (enabled: boolean): DialogVisualViewportStyle | undefined => {
  const [metrics, setMetrics] = useState<DialogVisualViewportMetrics>(FALLBACK_METRICS);

  useEffect(() => {
    if (!enabled) return;

    const updateMetrics = () => {
      const nextMetrics = toMetrics();
      setMetrics((current) =>
        current.height === nextMetrics.height && current.offsetTop === nextMetrics.offsetTop ? current : nextMetrics,
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
    if (!enabled) return undefined;

    return {
      "--dialog-visual-viewport-height": metrics.height,
      "--dialog-visual-viewport-offset-top": metrics.offsetTop,
    };
  }, [enabled, metrics]);
};
