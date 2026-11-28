// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode, UIEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { chromeHiddenAtom } from "../stores";
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

// シフト表の中の隠す行の高さ。PCとスマートフォンの時間指定は上の行だけ、
// スマートフォンの日付選択とパターン選択は日付の一覧も隠す。
const TOP_ROW_HEIGHT_PX = 46;
const DATE_RAIL_HEIGHT_PX = 64;

function createShiftForm(collapsibleRowHeights: number[] = [TOP_ROW_HEIGHT_PX]) {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", { configurable: true, value: SHIFT_FORM_HEIGHT_PX });
  for (const height of collapsibleRowHeights) {
    const row = document.createElement("div");
    row.setAttribute("data-chrome-collapse", "");
    Object.defineProperty(row, "offsetHeight", { configurable: true, value: height });
    element.appendChild(row);
  }
  return element;
}

function scrollEvent(target: HTMLElement, currentTarget: HTMLElement, scrollTop: number) {
  target.scrollTop = scrollTop;
  return { target, currentTarget } as unknown as UIEvent<HTMLElement>;
}

function setup(resetKey = "daily:2026-12-01", { collapsibleRowHeights }: { collapsibleRowHeights?: number[] } = {}) {
  const store = createStore();
  const onChange = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(({ key }) => useChromeHideOnScroll(key, onChange), {
    wrapper,
    initialProps: { key: resetKey },
  });
  const form = createShiftForm(collapsibleRowHeights);
  const scroll = (target: HTMLElement, scrollTop: number) =>
    act(() => hook.result.current(scrollEvent(target, form, scrollTop)));
  const isHidden = () => store.get(chromeHiddenAtom);
  return { hook, onChange, form, scroll, isHidden };
}

describe("useChromeHideOnScroll", () => {
  it("下へスクロールすると上の行を隠す", () => {
    const { onChange, scroll, isHidden } = setup();
    const scroller = createScroller();

    // 最初のスクロールは、その入れ物の位置を覚えるだけで隠さない。
    scroll(scroller, 100);
    expect(isHidden()).toBe(false);

    scroll(scroller, 200);
    expect(isHidden()).toBe(true);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it("表の途中で上へ戻しても表示せず、上端まで戻しきったときだけ表示する", () => {
    const { onChange, scroll, isHidden } = setup();
    const scroller = createScroller();
    scroll(scroller, 800);
    scroll(scroller, 1000);
    expect(isHidden()).toBe(true);

    // 少しの戻りでも、大きな戻りでも出さない。
    scroll(scroller, 950);
    expect(isHidden()).toBe(true);
    scroll(scroller, 300);
    expect(isHidden()).toBe(true);
    // 1人目のスタッフが見える前に出さないよう、上端の近く（ほかのページのヘッダーが出る64px以内）でも、まだ出さない。
    scroll(scroller, 40);
    expect(isHidden()).toBe(true);
    expect(onChange.mock.calls).toEqual([[true]]);

    scroll(scroller, 0);
    expect(isHidden()).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("上へ戻したあとで下へスクロールしても、隠したままにする", () => {
    const { onChange, scroll, isHidden } = setup();
    const scroller = createScroller();
    scroll(scroller, 800);
    scroll(scroller, 1000);

    scroll(scroller, 600);
    scroll(scroller, 700);
    expect(isHidden()).toBe(true);
    expect(onChange.mock.calls).toEqual([[true]]);
  });

  it("上端で表示したあと、下へスクロールするとまた隠す", () => {
    const { scroll, isHidden } = setup();
    const scroller = createScroller();
    scroll(scroller, 800);
    scroll(scroller, 1000);
    scroll(scroller, 0);
    expect(isHidden()).toBe(false);

    scroll(scroller, 200);
    expect(isHidden()).toBe(true);
  });

  it("隠した分だけ伸びるとスクロールできなくなる短い内容では、下へスクロールしても隠さない", () => {
    const { onChange, scroll, isHidden } = setup();
    // 隠れるのは上の行46pxとアプリのヘッダー64px。隠したあとに48px残るには、158px以上スクロールできる必要がある。
    const scroller = createScroller({ clientHeight: 600, scrollHeight: 757 });

    scroll(scroller, 0);
    scroll(scroller, 100);
    scroll(scroller, 157);
    expect(isHidden()).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("隠したあともスクロールできる長さが残る内容は、行の低い短めの表でも隠す", () => {
    const { scroll, isHidden } = setup();
    const scroller = createScroller({ clientHeight: 600, scrollHeight: 758 });

    scroll(scroller, 0);
    scroll(scroller, 100);
    expect(isHidden()).toBe(true);
  });

  it("隠す行が多い画面では、その分だけ長くスクロールできる内容でだけ隠す", () => {
    // スマートフォンの日付選択とパターン選択は、日付の一覧も隠す。46 + 64 + 64 + 48 = 222px以上が必要になる。
    const rows = [TOP_ROW_HEIGHT_PX, DATE_RAIL_HEIGHT_PX];
    const short = setup("daily:2026-12-01", { collapsibleRowHeights: rows });
    const shortScroller = createScroller({ clientHeight: 600, scrollHeight: 821 });
    short.scroll(shortScroller, 0);
    short.scroll(shortScroller, 100);
    expect(short.isHidden()).toBe(false);

    const enough = setup("daily:2026-12-01", { collapsibleRowHeights: rows });
    const enoughScroller = createScroller({ clientHeight: 600, scrollHeight: 822 });
    enough.scroll(enoughScroller, 0);
    enough.scroll(enoughScroller, 100);
    expect(enough.isHidden()).toBe(true);
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
});
