// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogVisualViewportStyle } from "./useDialogVisualViewportStyle";

type TestVisualViewport = EventTarget & {
  height: number;
  offsetTop: number;
};

const originalVisualViewport = window.visualViewport;
const originalInnerHeight = window.innerHeight;

function createVisualViewport(height: number, offsetTop: number): TestVisualViewport {
  return Object.assign(new EventTarget(), { height, offsetTop });
}

function setVisualViewport(viewport: TestVisualViewport | undefined): void {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: viewport,
  });
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: originalVisualViewport,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
  vi.restoreAllMocks();
});

describe("useDialogVisualViewportStyle", () => {
  it("無効時はstyleを返さずresize listenerも登録しない", () => {
    const viewport = createVisualViewport(600, 0);
    setVisualViewport(viewport);
    const viewportAddEventListener = vi.spyOn(viewport, "addEventListener");
    const windowAddEventListener = vi.spyOn(window, "addEventListener");

    const { result } = renderHook(() => useDialogVisualViewportStyle(false));

    expect(result.current).toBeUndefined();
    expect(viewportAddEventListener).not.toHaveBeenCalled();
    expect(windowAddEventListener).not.toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("Visual Viewportの高さと上端位置を丸めてCSS変数へ反映する", async () => {
    const viewport = createVisualViewport(480.6, 12.4);
    setVisualViewport(viewport);
    const addEventListener = vi.spyOn(viewport, "addEventListener");
    const removeEventListener = vi.spyOn(viewport, "removeEventListener");

    const { result, unmount } = renderHook(() => useDialogVisualViewportStyle(true));

    await waitFor(() => {
      expect(result.current).toEqual({
        "--dialog-visual-viewport-height": "481px",
        "--dialog-visual-viewport-offset-top": "12px",
      });
    });
    expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });

  it.each(["resize", "scroll"] as const)("Visual Viewportの%sで最新値へ更新する", async (eventName) => {
    const viewport = createVisualViewport(600, 0);
    setVisualViewport(viewport);
    const { result } = renderHook(() => useDialogVisualViewportStyle(true));

    viewport.height = 420.2;
    viewport.offsetTop = 89.8;
    act(() => {
      viewport.dispatchEvent(new Event(eventName));
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        "--dialog-visual-viewport-height": "420px",
        "--dialog-visual-viewport-offset-top": "90px",
      });
    });
  });

  it("Visual Viewportがない環境ではwindow.innerHeightを使い、無効化時にlistenerを解除する", async () => {
    setVisualViewport(undefined);
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 640.4 });
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) => useDialogVisualViewportStyle(enabled),
      { initialProps: { enabled: true } },
    );

    await waitFor(() => {
      expect(result.current).toEqual({
        "--dialog-visual-viewport-height": "640px",
        "--dialog-visual-viewport-offset-top": "0px",
      });
    });

    Object.defineProperty(window, "innerHeight", { configurable: true, value: 520.6 });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      expect(result.current?.["--dialog-visual-viewport-height"]).toBe("521px");
    });

    rerender({ enabled: false });

    expect(result.current).toBeUndefined();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });
});
