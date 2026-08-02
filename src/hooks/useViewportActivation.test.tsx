// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useViewportActivation } from "./useViewportActivation";

const observers: Array<{
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options?: IntersectionObserverInit;
}> = [];

beforeEach(() => {
  observers.length = 0;
  class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly scrollMargin = "0px";
    readonly thresholds = [0];
    readonly disconnect = vi.fn();
    readonly observe = vi.fn();
    readonly takeRecords = vi.fn(() => []);
    readonly unobserve = vi.fn();

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.rootMargin = options?.rootMargin ?? "0px";
      observers.push({
        callback,
        disconnect: this.disconnect,
        observe: this.observe,
        options,
      });
    }
  }
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useViewportActivation", () => {
  it("対象を監視し、viewportへ入ったら一度だけ有効化して監視を解除する", () => {
    const target = document.createElement("section");
    const { result, rerender } = renderHook(() => useViewportActivation<HTMLElement>());

    act(() => result.current.ref(target));

    expect(observers).toHaveLength(1);
    expect(observers[0]?.observe).toHaveBeenCalledOnce();
    expect(observers[0]?.observe).toHaveBeenCalledWith(target);
    expect(observers[0]?.options).toEqual({ rootMargin: "320px 0px" });
    expect(result.current.isActive).toBe(false);

    act(() => {
      observers[0]?.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(result.current.isActive).toBe(true);
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();

    rerender();
    expect(observers).toHaveLength(1);
  });

  it("focusなどの直接操作で有効化し、cleanup時に監視を解除する", () => {
    const target = document.createElement("section");
    const { result, unmount } = renderHook(() => useViewportActivation<HTMLElement>({ rootMargin: "120px" }));

    act(() => result.current.ref(target));
    act(() => result.current.activate());

    expect(result.current.isActive).toBe(true);
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();

    unmount();
    expect(observers[0]?.disconnect).toHaveBeenCalledOnce();
  });

  it("Intersection Observerがない環境では通常表示へフォールバックする", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const target = document.createElement("section");
    const { result } = renderHook(() => useViewportActivation<HTMLElement>());

    act(() => result.current.ref(target));

    expect(result.current.isActive).toBe(true);
  });

  it("対象keyが変わった場合は新しいsectionとして監視をやり直す", () => {
    const target = document.createElement("section");
    const { result, rerender } = renderHook(
      ({ activationKey }) => useViewportActivation<HTMLElement>({ activationKey }),
      { initialProps: { activationKey: "person-a" } },
    );

    act(() => result.current.ref(target));
    act(() => result.current.activate());
    expect(result.current.isActive).toBe(true);

    rerender({ activationKey: "person-b" });

    expect(result.current.isActive).toBe(false);
    expect(observers).toHaveLength(2);
    expect(observers[1]?.observe).toHaveBeenCalledWith(target);
  });
});
