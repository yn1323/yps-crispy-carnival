import { useSetAtom } from "jotai";
import { type UIEvent, useCallback, useEffect, useRef } from "react";
import { createHideOnScrollDownTracker } from "@/src/hooks/useHideOnScrollDown";
import { chromeHiddenAtom } from "../stores";

// シフト表の外で隠れる、アプリのヘッダーの高さの見積もり。実際の高さ（48〜64px）より小さくしない。
const APP_HEADER_HEIGHT_ESTIMATE_PX = 64;
// 隠したあとに残っていてほしい、スクロールできる長さ。
// 隠すと、その分だけスクロールする入れ物が伸びる。短い内容で隠すと、伸びた分でスクロール位置が上端へ戻り、
// 隠す・表示するを繰り返してしまう。表示するのは上端まで戻しきったときだけなので、上端に届かない長さが残ればよい。
// アプリのヘッダーの高さの見積もりの誤差を見込んで、余裕を持たせる。
const MIN_SCROLL_RANGE_AFTER_HIDE_PX = 48;
// 画面の高さに対して、この割合より低い入れ物（帯の中のスクロールなど）は、画面のスクロールとして扱わない。
// ただし`data-chrome-scroll-target`を付けた表の入れ物は、充足を開いて低くなっても画面のスクロールとして扱う。
const MIN_SCROLLER_HEIGHT_RATIO = 0.5;
// 隠した上の行を戻す位置。上端まで戻しきったときだけ戻す。
// 表の途中や上端の近くで戻すと、1人目のスタッフが見える前に上の行が出て、表が押し下げられてしまう。
// 小数のスクロール位置で上端に届かないことがあるため、1pxまでを上端とみなす。
const REVEAL_SCROLL_Y = 1;

/**
 * シフト表の内側の入れ物を下へスクロールすると上の行を隠し、上端まで戻しきったときだけ表示する。
 * 隠す判定は、アプリのヘッダーがページのスクロールで隠れる動きと同じものを使う。
 * 表示する判定は、ほかのページのヘッダー（上へ戻すとすぐ表示する）と違う。仕様は`doc/features/shift-board.md`の
 * 「スクロールで隠す上の行」に書く。
 * 返したハンドラは、シフト表の全体を包む要素の`onScrollCapture`へ渡す。スクロールのイベントは親へ伝わらないため、
 * 捕捉の段階で、どの表示の入れ物のスクロールも受け取る。
 * `resetKey`（選んだ日、日別と一覧の切り替え）が変わると、表示した状態へ戻す。
 */
export const useChromeHideOnScroll = (resetKey: string, onChange?: (isHidden: boolean) => void) => {
  const setHidden = useSetAtom(chromeHiddenAtom);
  const trackerRef = useRef(createHideOnScrollDownTracker());
  const targetRef = useRef<HTMLElement | null>(null);
  const hiddenRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apply = useCallback(
    (next: boolean) => {
      if (hiddenRef.current === next) return;
      hiddenRef.current = next;
      setHidden(next);
      onChangeRef.current?.(next);
    },
    [setHidden],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: 選んだ日と表示の切り替えで、表示した状態からやり直す。
  useEffect(() => {
    targetRef.current = null;
    apply(false);
  }, [apply, resetKey]);

  // 画面を離れるときは、アプリのヘッダーを表示した状態へ戻す。
  useEffect(() => () => apply(false), [apply]);

  /**
   * 隠すと入れ物が伸びる高さ。シフト表の中の隠す行（上の行と、スマートフォンの日付の一覧）は実際の高さを測る。
   * 見積もりで大きく取ると、行の低い表（PCの日付選択の週の表）で、スクロールできるのに隠れなくなる。
   */
  const measureCollapsibleHeight = useCallback((form: HTMLElement) => {
    let height = onChangeRef.current ? APP_HEADER_HEIGHT_ESTIMATE_PX : 0;
    for (const row of form.querySelectorAll<HTMLElement>("[data-chrome-collapse]")) height += row.offsetHeight;
    return height;
  }, []);

  return useCallback(
    (event: UIEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-chrome-scroll-ignore]")) return;
      if (
        !target.hasAttribute("data-chrome-scroll-target") &&
        target.clientHeight < event.currentTarget.clientHeight * MIN_SCROLLER_HEIGHT_RATIO
      )
        return;

      const maxScrollY = Math.max(target.scrollHeight - target.clientHeight, 0);
      const scrollY = Math.min(Math.max(target.scrollTop, 0), maxScrollY);
      if (targetRef.current !== target) {
        targetRef.current = target;
        apply(trackerRef.current.reset(scrollY));
        return;
      }
      // 隠したあともスクロールできる内容でだけ隠す。
      if (
        !hiddenRef.current &&
        maxScrollY < measureCollapsibleHeight(event.currentTarget) + MIN_SCROLL_RANGE_AFTER_HIDE_PX
      ) {
        trackerRef.current.reset(scrollY);
        return;
      }
      const isHiddenByDirection = trackerRef.current.update(scrollY, maxScrollY);
      // いちど隠したら、上へ戻しても、上端まで戻しきるまで隠したままにする。
      apply(scrollY > REVEAL_SCROLL_Y && (hiddenRef.current || isHiddenByDirection));
    },
    [apply, measureCollapsibleHeight],
  );
};
