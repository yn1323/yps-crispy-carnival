import { useSetAtom } from "jotai";
import { type UIEvent, useCallback, useEffect, useRef } from "react";
import { createHideOnScrollDownTracker } from "@/src/hooks/useHideOnScrollDown";
import { chromeHiddenAtom } from "../stores";

// 隠す行（アプリのヘッダー、シフト表の上の行、日付選択とパターン選択のスマートフォンの日付の一覧）の高さの見積もり。
// 隠すと、その分だけスクロールする入れ物が伸びる。
const COLLAPSIBLE_HEIGHT_ESTIMATE_PX = 140;
// 入れ物が伸びたあともスクロールできる内容でだけ隠す。短い内容で隠すと、伸びた分でスクロール位置が上端へ戻り、
// 隠す・表示するを繰り返してしまう。
const MIN_SCROLL_RANGE_TO_HIDE_PX = COLLAPSIBLE_HEIGHT_ESTIMATE_PX + 120;
// 画面の高さに対して、この割合より低い入れ物（帯の中のスクロールなど）は、画面のスクロールとして扱わない。
const MIN_SCROLLER_HEIGHT_RATIO = 0.5;

/**
 * シフト表の内側の入れ物を下へスクロールすると上の行を隠し、上へ戻すか上端の近くへ来ると表示する。
 * アプリのヘッダーがページのスクロールで隠れる動きと同じ判定を使う。
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

  return useCallback(
    (event: UIEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-chrome-scroll-ignore]")) return;
      if (target.clientHeight < event.currentTarget.clientHeight * MIN_SCROLLER_HEIGHT_RATIO) return;

      const maxScrollY = Math.max(target.scrollHeight - target.clientHeight, 0);
      const scrollY = Math.min(Math.max(target.scrollTop, 0), maxScrollY);
      if (targetRef.current !== target) {
        targetRef.current = target;
        apply(trackerRef.current.reset(scrollY));
        return;
      }
      if (!hiddenRef.current && maxScrollY < MIN_SCROLL_RANGE_TO_HIDE_PX) {
        trackerRef.current.reset(scrollY);
        return;
      }
      apply(trackerRef.current.update(scrollY, maxScrollY));
    },
    [apply],
  );
};
