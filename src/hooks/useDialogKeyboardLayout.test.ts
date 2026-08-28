// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DIALOG_MIN_EDITING_SCROLLPORT_HEIGHT,
  resolveDialogKeyboardLayoutMode,
  useDialogKeyboardLayout,
} from "./useDialogKeyboardLayout";

const originalResizeObserver = globalThis.ResizeObserver;
let resizeObserverCallback: ResizeObserverCallback | undefined;
let resizeObserverDisconnect: ReturnType<typeof vi.fn>;
let resizeObserverObserve: ReturnType<typeof vi.fn>;

class TestResizeObserver {
  observe = resizeObserverObserve;
  unobserve = vi.fn();
  disconnect = resizeObserverDisconnect;

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }
}

const createDialogElements = (
  initialFooterHeight: number,
  initialContentHeight = 500,
  initialHeaderHeight = 0,
  initialLeadingHeight = 0,
) => {
  let footerHeight = initialFooterHeight;
  let contentHeight = initialContentHeight;
  const headerHeight = initialHeaderHeight;
  let leadingHeight = initialLeadingHeight;
  const content = document.createElement("div");
  const header = document.createElement("div");
  const leading = document.createElement("div");
  const input = document.createElement("input");
  input.type = "text";
  const button = document.createElement("button");
  const footer = document.createElement("div");
  content.append(header, leading, input, button, footer);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockImplementation(() => ({ height: contentHeight }) as DOMRect);
  vi.spyOn(header, "getBoundingClientRect").mockImplementation(() => ({ height: headerHeight }) as DOMRect);
  vi.spyOn(leading, "getBoundingClientRect").mockImplementation(() => ({ height: leadingHeight }) as DOMRect);
  vi.spyOn(footer, "getBoundingClientRect").mockImplementation(() => ({ height: footerHeight }) as DOMRect);

  return {
    button,
    content,
    footer,
    header,
    input,
    leading,
    setContentHeight: (height: number) => {
      contentHeight = height;
    },
    setFooterHeight: (height: number) => {
      footerHeight = height;
    },
    setLeadingHeight: (height: number) => {
      leadingHeight = height;
    },
  };
};

beforeEach(() => {
  resizeObserverCallback = undefined;
  resizeObserverDisconnect = vi.fn();
  resizeObserverObserve = vi.fn();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
});

afterEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalResizeObserver,
  });
  vi.restoreAllMocks();
});

describe("resolveDialogKeyboardLayoutMode", () => {
  const footerHeight = 80;
  const boundaryHeight = DIALOG_MIN_EDITING_SCROLLPORT_HEIGHT + footerHeight;

  it.each([
    { viewportHeight: boundaryHeight - 1, expected: "content-scroll" },
    { viewportHeight: boundaryHeight, expected: "header-body-scroll" },
    { viewportHeight: boundaryHeight + 1, expected: "header-body-scroll" },
  ] as const)("可視高さが$viewportHeightのとき$expectedを選ぶ", ({ viewportHeight, expected }) => {
    expect(
      resolveDialogKeyboardLayoutMode({
        enabled: true,
        isEditing: true,
        viewportHeight,
        viewportWidth: 390,
        footerHeight,
      }),
    ).toBe(expected);
  });

  it("Dialog自体がviewportより低い場合は実際のContent高で判定する", () => {
    expect(
      resolveDialogKeyboardLayoutMode({
        enabled: true,
        isEditing: true,
        viewportHeight: 568,
        viewportWidth: 390,
        contentHeight: 300,
        footerHeight: 80,
      }),
    ).toBe("content-scroll");
  });

  it("HeaderとStepperを除いた実フォーム領域が不足する場合はFooter固定を解除する", () => {
    expect(
      resolveDialogKeyboardLayoutMode({
        enabled: true,
        isEditing: true,
        viewportHeight: 395,
        viewportWidth: 390,
        contentHeight: 395,
        footerHeight: 77,
        topChromeHeight: 162,
      }),
    ).toBe("content-scroll");
  });

  it.each([
    { viewportHeight: 399, expected: "content-scroll" },
    { viewportHeight: 400, expected: "header-body-scroll" },
    { viewportHeight: 401, expected: "header-body-scroll" },
  ] as const)("Headerと先頭領域を差し引いた可視高が境界付近のとき$expectedを選ぶ", ({ viewportHeight, expected }) => {
    expect(
      resolveDialogKeyboardLayoutMode({
        enabled: true,
        isEditing: true,
        viewportHeight,
        viewportWidth: 390,
        footerHeight: 80,
        topChromeHeight: 80,
      }),
    ).toBe(expected);
  });

  it.each([
    { enabled: false, isEditing: true, viewportWidth: 390 },
    { enabled: true, isEditing: false, viewportWidth: 390 },
    { enabled: true, isEditing: true, viewportWidth: 1024 },
  ])("対象外ではBodyだけをスクロールする", ({ enabled, isEditing, viewportWidth }) => {
    expect(
      resolveDialogKeyboardLayoutMode({
        enabled,
        isEditing,
        viewportHeight: boundaryHeight - 1,
        viewportWidth,
        footerHeight,
      }),
    ).toBe("body-scroll");
  });
});

describe("useDialogKeyboardLayout", () => {
  it("遅延mount後にContentを受け取ると既にfocus中のinputから入力レイアウトを開始する", async () => {
    const elements = createDialogElements(77, 395, 110, 52);
    const { result, rerender } = renderHook(
      ({ contentElement }: { contentElement: HTMLElement | null }) =>
        useDialogKeyboardLayout({
          enabled: true,
          contentElement,
          footerElement: elements.footer,
          headerElement: elements.header,
          leadingElement: elements.leading,
          viewportHeight: 395,
          viewportOffsetTop: 0,
          viewportWidth: 390,
        }),
      { initialProps: { contentElement: null as HTMLElement | null } },
    );

    act(() => elements.input.focus());
    expect(result.current.mode).toBe("body-scroll");

    rerender({ contentElement: elements.content });
    await waitFor(() => expect(result.current.mode).toBe("content-scroll"));
  });

  it("入力開始後はHeaderとBodyをスクロールし、可視高さ不足時はFooterも通常フローへ移す", async () => {
    const elements = createDialogElements(80);
    const { result, rerender } = renderHook(
      (props: { viewportHeight: number }) =>
        useDialogKeyboardLayout({
          enabled: true,
          contentElement: elements.content,
          footerElement: elements.footer,
          viewportHeight: props.viewportHeight,
          viewportOffsetTop: 0,
          viewportWidth: 390,
        }),
      { initialProps: { viewportHeight: 500 } },
    );

    await waitFor(() => expect(result.current.mode).toBe("body-scroll"));
    act(() => elements.input.focus());
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));

    rerender({ viewportHeight: 319 });
    await waitFor(() => expect(result.current.mode).toBe("content-scroll"));
  });

  it("キーボード相当の高さ減少中はFooterへfocusを移してもmodeを維持し、復元後に戻す", async () => {
    const elements = createDialogElements(80);
    const { result, rerender } = renderHook(
      (props: { viewportHeight: number }) =>
        useDialogKeyboardLayout({
          enabled: true,
          contentElement: elements.content,
          footerElement: elements.footer,
          viewportHeight: props.viewportHeight,
          viewportOffsetTop: 0,
          viewportWidth: 390,
        }),
      { initialProps: { viewportHeight: 500 } },
    );

    act(() => elements.input.focus());
    rerender({ viewportHeight: 320 });
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));

    act(() => elements.button.focus());
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));

    rerender({ viewportHeight: 500 });
    await waitFor(() => expect(result.current.mode).toBe("body-scroll"));
  });

  it("viewportが縮まらない環境ではblur後の待機時間を過ぎると通常modeへ戻す", async () => {
    const elements = createDialogElements(80);
    const { result } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));

    vi.useFakeTimers();
    try {
      act(() => {
        elements.button.focus();
        vi.advanceTimersByTime(350);
      });
      expect(result.current.mode).toBe("body-scroll");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Footerの実高が増えて入力領域が境界を下回るとContent全体のスクロールへ切り替える", async () => {
    const elements = createDialogElements(80);
    const { result } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 400,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.content);
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.footer);

    elements.setFooterHeight(161);
    act(() => resizeObserverCallback?.([], {} as ResizeObserver));
    await waitFor(() => expect(result.current.mode).toBe("content-scroll"));
  });

  it("HeaderとStepperの実高を引いたフォーム領域でFooter固定可否を決める", async () => {
    const elements = createDialogElements(77, 395, 110, 52);
    const { result } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        headerElement: elements.header,
        leadingElement: elements.leading,
        viewportHeight: 395,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());

    await waitFor(() => expect(result.current.mode).toBe("content-scroll"));
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.content);
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.header);
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.leading);
    expect(resizeObserverObserve).toHaveBeenCalledWith(elements.footer);
  });

  it("Stepperの実高が増えてフォーム領域が境界を下回るとFooter固定を解除する", async () => {
    const elements = createDialogElements(80, 500, 100, 60);
    const { result } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        headerElement: elements.header,
        leadingElement: elements.leading,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());
    await waitFor(() => expect(result.current.mode).toBe("header-body-scroll"));

    elements.setLeadingHeight(81);
    act(() => resizeObserverCallback?.([], {} as ResizeObserver));
    await waitFor(() => expect(result.current.mode).toBe("content-scroll"));
  });

  it("mode切替後にfocus中のinputが可視領域外なら最小限のscrollを要求する", async () => {
    const elements = createDialogElements(80);
    const scrollIntoView = vi.fn();
    Object.defineProperty(elements.input, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(elements.input, "getBoundingClientRect").mockReturnValue({ top: 280, bottom: 324 } as DOMRect);
    const { rerender } = renderHook(
      (props: { viewportHeight: number }) =>
        useDialogKeyboardLayout({
          enabled: true,
          contentElement: elements.content,
          footerElement: elements.footer,
          viewportHeight: props.viewportHeight,
          viewportOffsetTop: 0,
          viewportWidth: 390,
        }),
      { initialProps: { viewportHeight: 500 } },
    );

    act(() => elements.input.focus());
    rerender({ viewportHeight: 319 });

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });
  });

  it("focus先のinputが変わると同じmodeでも可視位置を再確認する", async () => {
    const elements = createDialogElements(80);
    const secondInput = document.createElement("input");
    const scrollIntoView = vi.fn();
    Object.defineProperty(secondInput, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(secondInput, "getBoundingClientRect").mockReturnValue({ top: 460, bottom: 504 } as DOMRect);
    elements.content.insertBefore(secondInput, elements.button);
    renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());
    act(() => secondInput.focus());

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });
  });

  it("Visual Viewportの上端だけが変わった場合も可視位置を再確認する", async () => {
    const elements = createDialogElements(80);
    const scrollIntoView = vi.fn();
    Object.defineProperty(elements.input, "scrollIntoView", { configurable: true, value: scrollIntoView });
    vi.spyOn(elements.input, "getBoundingClientRect").mockReturnValue({ top: 20, bottom: 64 } as DOMRect);
    const { rerender } = renderHook(
      (props: { viewportOffsetTop: number }) =>
        useDialogKeyboardLayout({
          enabled: true,
          contentElement: elements.content,
          footerElement: elements.footer,
          viewportHeight: 500,
          viewportOffsetTop: props.viewportOffsetTop,
          viewportWidth: 390,
        }),
      { initialProps: { viewportOffsetTop: 0 } },
    );

    act(() => elements.input.focus());
    await waitFor(() => expect(scrollIntoView).not.toHaveBeenCalled());
    rerender({ viewportOffsetTop: 10 });

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    });
  });

  it("readonly inputとDialog外のinputでは入力用レイアウトを開始しない", async () => {
    const elements = createDialogElements(80);
    const readonlyInput = document.createElement("input");
    readonlyInput.readOnly = true;
    elements.content.append(readonlyInput);
    const outsideInput = document.createElement("input");
    document.body.append(outsideInput);
    const { result } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 300,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => readonlyInput.focus());
    await waitFor(() => expect(result.current.mode).toBe("body-scroll"));
    act(() => outsideInput.focus());
    await waitFor(() => expect(result.current.mode).toBe("body-scroll"));
  });

  it("unmount時にFooter監視とwindow listenerを解除する", () => {
    const elements = createDialogElements(80);
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const removeContentEventListener = vi.spyOn(elements.content, "removeEventListener");
    const { unmount } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    unmount();

    expect(resizeObserverDisconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(removeContentEventListener).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(removeContentEventListener).toHaveBeenCalledWith("focusout", expect.any(Function));
  });

  it("unmount時に保留中の可視位置補正を取り消す", () => {
    const elements = createDialogElements(80);
    const cancelAnimationFrame = vi.spyOn(window, "cancelAnimationFrame");
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const { unmount } = renderHook(() =>
      useDialogKeyboardLayout({
        enabled: true,
        contentElement: elements.content,
        footerElement: elements.footer,
        viewportHeight: 500,
        viewportOffsetTop: 0,
        viewportWidth: 390,
      }),
    );

    act(() => elements.input.focus());
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });
});
