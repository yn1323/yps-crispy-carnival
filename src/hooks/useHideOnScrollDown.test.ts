// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHideOnScrollDown } from "./useHideOnScrollDown";

const VIEWPORT_HEIGHT = 800;
const PAGE_HEIGHT = 4000;

function setPageMetrics(scrollHeight: number, viewportHeight = VIEWPORT_HEIGHT): void {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: viewportHeight });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: scrollHeight });
}

function scrollTo(scrollY: number): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

beforeEach(() => {
  setPageMetrics(PAGE_HEIGHT);
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

afterEach(() => {
  document.body.removeAttribute("data-scroll-lock");
  vi.restoreAllMocks();
});

describe("useHideOnScrollDown", () => {
  it("下へスクロールすると隠し、上へスクロールすると再表示する", () => {
    const { result } = renderHook(() => useHideOnScrollDown());

    expect(result.current).toBe(false);

    scrollTo(300);
    expect(result.current).toBe(true);

    scrollTo(600);
    expect(result.current).toBe(true);

    scrollTo(580);
    expect(result.current).toBe(false);

    scrollTo(620);
    expect(result.current).toBe(true);
  });

  it("ページ上端の近くでは下へスクロールしても表示を保つ", () => {
    const { result } = renderHook(() => useHideOnScrollDown());

    scrollTo(64);
    expect(result.current).toBe(false);

    scrollTo(300);
    expect(result.current).toBe(true);

    scrollTo(60);
    expect(result.current).toBe(false);
  });

  it("微小な揺れでは表示を切り替えず、逆方向の移動量は最遠点から測る", () => {
    const { result } = renderHook(() => useHideOnScrollDown());

    scrollTo(300);
    expect(result.current).toBe(true);

    scrollTo(296);
    expect(result.current).toBe(true);

    scrollTo(310);
    scrollTo(303);
    expect(result.current).toBe(true);

    scrollTo(302);
    expect(result.current).toBe(false);

    scrollTo(310);
    expect(result.current).toBe(false);

    scrollTo(290);
    scrollTo(301);
    expect(result.current).toBe(false);

    scrollTo(302);
    expect(result.current).toBe(true);
  });

  it("ページ下端のバウンスによる戻りでは再表示しない", () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    const maxScrollY = PAGE_HEIGHT - VIEWPORT_HEIGHT;

    scrollTo(maxScrollY);
    expect(result.current).toBe(true);

    scrollTo(maxScrollY + 80);
    scrollTo(maxScrollY);
    expect(result.current).toBe(true);
  });

  it("ツールバーが隠れてスクロール範囲が縮み、下端の位置が戻されても再表示しない", () => {
    const { result } = renderHook(() => useHideOnScrollDown());
    const toolbarHeight = 56;
    const maxScrollY = PAGE_HEIGHT - VIEWPORT_HEIGHT;

    // 素早いスクロールで、ツールバーが隠れ切る前に下端へ達する。
    scrollTo(maxScrollY);
    expect(result.current).toBe(true);

    setPageMetrics(PAGE_HEIGHT, VIEWPORT_HEIGHT + 20);
    scrollTo(maxScrollY - 20);
    expect(result.current).toBe(true);

    setPageMetrics(PAGE_HEIGHT, VIEWPORT_HEIGHT + toolbarHeight);
    scrollTo(maxScrollY - toolbarHeight);
    expect(result.current).toBe(true);

    // 戻された後の下端から利用者が上へスクロールした分は、通常どおり数える。
    scrollTo(maxScrollY - toolbarHeight - 7);
    expect(result.current).toBe(true);

    scrollTo(maxScrollY - toolbarHeight - 8);
    expect(result.current).toBe(false);
  });

  it("scroll lock中の位置変化を無視する", () => {
    const { result } = renderHook(() => useHideOnScrollDown());

    scrollTo(600);
    expect(result.current).toBe(true);

    document.body.setAttribute("data-scroll-lock", "");
    scrollTo(0);
    expect(result.current).toBe(true);

    document.body.removeAttribute("data-scroll-lock");
    scrollTo(600);
    expect(result.current).toBe(true);
  });

  it("無効にすると表示へ戻し、スクロールを監視しない", () => {
    const { result, rerender } = renderHook(({ enabled }) => useHideOnScrollDown({ enabled }), {
      initialProps: { enabled: true },
    });

    scrollTo(300);
    expect(result.current).toBe(true);

    rerender({ enabled: false });
    expect(result.current).toBe(false);

    scrollTo(900);
    expect(result.current).toBe(false);
  });

  it("unmount時にscroll listenerを解除する", () => {
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useHideOnScrollDown());

    unmount();

    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
  });
});
