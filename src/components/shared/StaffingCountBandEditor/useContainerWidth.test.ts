// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContainerWidth } from "./useContainerWidth";

/** jsdomにResizeObserverがないため、監視している要素と通知を手で操れるもので代える。 */
class ControlledResizeObserver {
  static instances: ControlledResizeObserver[] = [];
  readonly observed: Element[] = [];
  isDisconnected = false;

  constructor(private readonly callback: () => void) {
    ControlledResizeObserver.instances.push(this);
  }

  observe(element: Element) {
    this.observed.push(element);
  }

  disconnect() {
    this.isDisconnected = true;
  }

  notify() {
    this.callback();
  }
}

function createElement(width: number): HTMLElement {
  const element = document.createElement("div");
  setWidth(element, width);
  return element;
}

function setWidth(element: HTMLElement, width: number): void {
  Object.defineProperty(element, "clientWidth", { configurable: true, value: width });
}

const activeObservers = () => ControlledResizeObserver.instances.filter((observer) => !observer.isDisconnected);

beforeEach(() => {
  ControlledResizeObserver.instances = [];
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useContainerWidth", () => {
  it("要素を渡すまでは幅を0として返し、何も監視しない", () => {
    const { result } = renderHook(() => useContainerWidth());

    expect(result.current.width).toBe(0);
    expect(ControlledResizeObserver.instances).toEqual([]);
  });

  it("要素を渡すとその幅を測り、幅が変わるたびに測り直す", () => {
    const { result } = renderHook(() => useContainerWidth());
    const element = createElement(640);

    act(() => result.current.measureRef(element));
    expect(result.current.width).toBe(640);
    expect(activeObservers().map((observer) => observer.observed)).toEqual([[element]]);

    setWidth(element, 375);
    act(() => activeObservers()[0].notify());
    expect(result.current.width).toBe(375);
  });

  it("別の要素へ付け替えると、前の要素の監視をやめて新しい要素の幅を測る", () => {
    const { result } = renderHook(() => useContainerWidth());
    const first = createElement(640);
    const second = createElement(320);
    act(() => result.current.measureRef(first));

    act(() => result.current.measureRef(second));

    expect(result.current.width).toBe(320);
    expect(activeObservers().map((observer) => observer.observed)).toEqual([[second]]);
  });

  it("部品が外れると監視をやめる", () => {
    const { result, unmount } = renderHook(() => useContainerWidth());
    act(() => result.current.measureRef(createElement(640)));

    unmount();

    expect(ControlledResizeObserver.instances).toHaveLength(1);
    expect(activeObservers()).toEqual([]);
  });
});
