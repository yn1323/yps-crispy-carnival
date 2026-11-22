// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode, UIEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { chromeVisibilityAtom } from "../stores";
import { useChromeHideOnScroll } from "./useChromeHideOnScroll";

const SHIFT_FORM_HEIGHT_PX = 800;

/** スクロールする入れ物。jsdomは配置を計算しないため、高さとスクロール位置を直接持たせる。 */
function createScroller({
  clientHeight = 600,
  scrollHeight = 2000,
  parent,
}: {
  clientHeight?: number;
  scrollHeight?: number;
  parent?: HTMLElement;
} = {}) {
  const element = document.createElement("div");
  parent?.appendChild(element);
  Object.defineProperty(element, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(element, "scrollHeight", { configurable: true, value: scrollHeight });
  return element;
}

function createShiftForm() {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", { configurable: true, value: SHIFT_FORM_HEIGHT_PX });
  return element;
}

function scrollEvent(target: HTMLElement, currentTarget: HTMLElement, scrollTop: number) {
  target.scrollTop = scrollTop;
  return { target, currentTarget } as unknown as UIEvent<HTMLElement>;
}

function setup(resetKey = "daily:2026-12-01", { isCompact = false } = {}) {
  const store = createStore();
  const onChange = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(({ key }) => useChromeHideOnScroll(key, onChange, { isCompact }), {
    wrapper,
    initialProps: { key: resetKey },
  });
  const form = createShiftForm();
  const scroll = (target: HTMLElement, scrollTop: number) =>
    act(() => hook.result.current(scrollEvent(target, form, scrollTop)));
  const visibility = () => store.get(chromeVisibilityAtom);
  const isHidden = () => visibility() === "hidden";
  return { hook, onChange, form, scroll, isHidden, visibility };
}

describe("useChromeHideOnScroll", () => {
  it("下へスクロールすると上の行を隠し、上へ戻すと表示する", () => {
    const { onChange, scroll, isHidden } = setup();
    const scroller = createScroller();

    // 最初のスクロールは、その入れ物の位置を覚えるだけで隠さない。
    scroll(scroller, 100);
    expect(isHidden()).toBe(false);

    scroll(scroller, 200);
    expect(isHidden()).toBe(true);

    scroll(scroller, 150);
    expect(isHidden()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("隠したあとでも、上端の近くへ来ると表示する", () => {
    const { scroll, isHidden } = setup();
    const scroller = createScroller();
    scroll(scroller, 100);
    scroll(scroller, 300);
    expect(isHidden()).toBe(true);

    scroll(scroller, 40);
    expect(isHidden()).toBe(false);
  });

  it("隠した分だけ伸びるとスクロールできなくなる短い内容では、下へスクロールしても隠さない", () => {
    const { onChange, scroll, isHidden } = setup();
    // スクロールできる範囲が200px。上の行を隠して伸びた分で、上端へ戻ってしまう。
    const scroller = createScroller({ clientHeight: 600, scrollHeight: 800 });

    scroll(scroller, 0);
    scroll(scroller, 100);
    scroll(scroller, 200);
    expect(isHidden()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("画面のスクロールとして扱わない入れ物のスクロールでは、隠さない", () => {
    const { onChange, scroll, isHidden } = setup();
    const ignored = document.createElement("div");
    ignored.setAttribute("data-chrome-scroll-ignore", "");
    // 必要人数の帯のように、印を付けた要素の中でスクロールする入れ物。
    const insideIgnored = createScroller({ parent: ignored });
    // シフト表の高さの半分より低い入れ物。
    const lowScroller = createScroller({ clientHeight: SHIFT_FORM_HEIGHT_PX / 2 - 1 });

    for (const scroller of [insideIgnored, lowScroller]) {
      scroll(scroller, 100);
      scroll(scroller, 400);
    }
    expect(isHidden()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("充足を開いて表の入れ物が低くなっても、下へスクロールすると隠す", () => {
    const { scroll, isHidden } = setup();
    const scroller = createScroller({ clientHeight: SHIFT_FORM_HEIGHT_PX / 4 });
    scroller.setAttribute("data-chrome-scroll-target", "");

    scroll(scroller, 100);
    scroll(scroller, 300);
    expect(isHidden()).toBe(true);
  });

  it("別の入れ物のスクロールへ移ると、表示した状態からやり直す", () => {
    const { scroll, isHidden } = setup();
    const first = createScroller();
    const second = createScroller();
    scroll(first, 100);
    scroll(first, 300);
    expect(isHidden()).toBe(true);

    scroll(second, 500);
    expect(isHidden()).toBe(false);
    scroll(second, 600);
    expect(isHidden()).toBe(true);
  });

  it("選んだ日や表示を切り替えると、上の行を表示した状態へ戻す", () => {
    const { hook, onChange, scroll, isHidden } = setup("daily:2026-12-01");
    const scroller = createScroller();
    scroll(scroller, 100);
    scroll(scroller, 300);
    expect(isHidden()).toBe(true);

    hook.rerender({ key: "daily:2026-12-02" });
    expect(isHidden()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);

    // 切り替えたあとの同じ入れ物でも、最初のスクロールでは隠さない。
    scroll(scroller, 400);
    expect(isHidden()).toBe(false);
  });

  it("シフト表を離れると、隠していた上の行を表示へ戻す", () => {
    const { hook, scroll, isHidden } = setup();
    const scroller = createScroller();
    scroll(scroller, 100);
    scroll(scroller, 300);
    expect(isHidden()).toBe(true);

    hook.unmount();
    expect(isHidden()).toBe(false);
  });

  describe("スマートフォン", () => {
    // シフト表の高さ800pxの4分の1。
    const COMPACT_REVEAL_DISTANCE_PX = SHIFT_FORM_HEIGHT_PX / 4;

    const hideAt = (scroll: (target: HTMLElement, scrollTop: number) => void, scrollTop: number) => {
      const scroller = createScroller();
      scroll(scroller, scrollTop - 200);
      scroll(scroller, scrollTop);
      return scroller;
    };

    it("表の途中では、少し上へ戻しても表示しない", () => {
      const { onChange, scroll, visibility } = setup("daily:2026-12-01", { isCompact: true });
      const scroller = hideAt(scroll, 1000);
      expect(visibility()).toBe("hidden");

      scroll(scroller, 1000 - (COMPACT_REVEAL_DISTANCE_PX - 1));
      expect(visibility()).toBe("hidden");
      expect(onChange.mock.calls).toEqual([[true]]);
    });

    it("表の途中ではっきり上へ戻すと、日付の一覧だけを表示し、上の行は隠したままにする", () => {
      const { onChange, scroll, visibility } = setup("daily:2026-12-01", { isCompact: true });
      const scroller = hideAt(scroll, 1000);

      scroll(scroller, 1000 - COMPACT_REVEAL_DISTANCE_PX);
      expect(visibility()).toBe("datesOnly");
      // アプリのヘッダーは隠したまま。
      expect(onChange.mock.calls).toEqual([[true]]);

      // さらに上へ戻しても、上端の近くへ来るまでは日付の一覧だけ。
      scroll(scroller, 200);
      expect(visibility()).toBe("datesOnly");

      scroll(scroller, 40);
      expect(visibility()).toBe("shown");
      expect(onChange.mock.calls).toEqual([[true], [false]]);
    });

    it("日付の一覧だけを表示したあと、下へスクロールするとまた隠す", () => {
      const { scroll, visibility } = setup("daily:2026-12-01", { isCompact: true });
      const scroller = hideAt(scroll, 1000);
      scroll(scroller, 1000 - COMPACT_REVEAL_DISTANCE_PX);
      expect(visibility()).toBe("datesOnly");

      scroll(scroller, 1000 - COMPACT_REVEAL_DISTANCE_PX + 20);
      expect(visibility()).toBe("hidden");
    });

    it("隠している間に選んだ日を変えると、日付の一覧だけを表示する", () => {
      const { hook, onChange, scroll, visibility } = setup("daily:2026-12-01", { isCompact: true });
      hideAt(scroll, 1000);

      hook.rerender({ key: "daily:2026-12-02" });
      expect(visibility()).toBe("datesOnly");
      expect(onChange.mock.calls).toEqual([[true]]);
    });

    it("上の行を表示している間に表示を切り替えると、表示したままにする", () => {
      const { hook, onChange, visibility } = setup("daily:2026-12-01", { isCompact: true });

      hook.rerender({ key: "overview:2026-12-01" });
      expect(visibility()).toBe("shown");
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
