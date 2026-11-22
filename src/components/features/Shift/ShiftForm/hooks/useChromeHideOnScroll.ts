import { useSetAtom } from "jotai";
import { type UIEvent, useCallback, useEffect, useRef } from "react";
import { ALWAYS_VISIBLE_SCROLL_Y, createHideOnScrollDownTracker } from "@/src/hooks/useHideOnScrollDown";
import { type ChromeVisibility, chromeVisibilityAtom } from "../stores";

// 隠す行（アプリのヘッダー、シフト表の上の行、日付選択とパターン選択のスマートフォンの日付の一覧）の高さの見積もり。
// 隠すと、その分だけスクロールする入れ物が伸びる。
const COLLAPSIBLE_HEIGHT_ESTIMATE_PX = 140;
// 入れ物が伸びたあともスクロールできる内容でだけ隠す。短い内容で隠すと、伸びた分でスクロール位置が上端へ戻り、
// 隠す・表示するを繰り返してしまう。
const MIN_SCROLL_RANGE_TO_HIDE_PX = COLLAPSIBLE_HEIGHT_ESTIMATE_PX + 120;
// 画面の高さに対して、この割合より低い入れ物（帯の中のスクロールなど）は、画面のスクロールとして扱わない。
// ただし`data-chrome-scroll-target`を付けた表の入れ物は、充足を開いて低くなっても画面のスクロールとして扱う。
const MIN_SCROLLER_HEIGHT_RATIO = 0.5;
// スマートフォンで、隠したあとに日付の一覧を表示するまでに上へ戻す距離の、シフト表の高さに対する割合。
// 指の揺れや慣性スクロールの止まり際では出さず、はっきり上へ戻したときだけ出す。速く上へはじくと、慣性でこの距離を超える。
const COMPACT_REVEAL_DISTANCE_RATIO = 0.25;

type Options = {
  /** スマートフォンの表示。上へ戻す距離を大きく取り、表の途中では日付の一覧だけを表示する。 */
  isCompact?: boolean;
};

/**
 * シフト表の内側の入れ物を下へスクロールすると上の行を隠し、上へ戻すか上端の近くへ来ると表示する。
 * アプリのヘッダーがページのスクロールで隠れる動きと同じ判定を使う。
 * スマートフォンでは、表の途中から上へ戻したときは日付の一覧だけを表示し、上の行は上端の近くへ来たときに表示する。
 * 返したハンドラは、シフト表の全体を包む要素の`onScrollCapture`へ渡す。スクロールのイベントは親へ伝わらないため、
 * 捕捉の段階で、どの表示の入れ物のスクロールも受け取る。
 * `resetKey`（選んだ日、日別と一覧の切り替え）が変わると、上の行を隠していなければ表示した状態へ戻し、
 * 隠していれば日付の一覧だけを表示した状態にする（スマートフォン）。
 * `onChange`には、上の行（アプリのヘッダーを含む）を隠しているかどうかを伝える。
 */
export const useChromeHideOnScroll = (
  resetKey: string,
  onChange?: (isHidden: boolean) => void,
  { isCompact = false }: Options = {},
) => {
  const setVisibility = useSetAtom(chromeVisibilityAtom);
  const trackerRef = useRef(createHideOnScrollDownTracker());
  const targetRef = useRef<HTMLElement | null>(null);
  // シフト表全体を描き直さないよう、状態はstoreから読まず、ここで持つ。
  const visibilityRef = useRef<ChromeVisibility>("shown");
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const isCompactRef = useRef(isCompact);
  isCompactRef.current = isCompact;

  const apply = useCallback(
    (next: ChromeVisibility) => {
      const previous = visibilityRef.current;
      if (previous === next) return;
      visibilityRef.current = next;
      setVisibility(next);
      const isHidden = next !== "shown";
      if (isHidden !== (previous !== "shown")) onChangeRef.current?.(isHidden);
    },
    [setVisibility],
  );

  /** 隠していない状態へ戻すときの行き先。スマートフォンの表の途中では、上の行を隠したまま日付の一覧だけを出す。 */
  const revealTo = useCallback((scrollY: number | null): ChromeVisibility => {
    if (!isCompactRef.current || visibilityRef.current === "shown") return "shown";
    if (scrollY !== null && scrollY <= ALWAYS_VISIBLE_SCROLL_Y) return "shown";
    return "datesOnly";
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 選んだ日と表示の切り替えで、隠していない状態からやり直す。
  useEffect(() => {
    targetRef.current = null;
    apply(revealTo(null));
  }, [apply, revealTo, resetKey]);

  // 画面を離れるときは、アプリのヘッダーを表示した状態へ戻す。
  useEffect(() => () => apply("shown"), [apply]);

  return useCallback(
    (event: UIEvent<HTMLElement>) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-chrome-scroll-ignore]")) return;
      const formHeight = event.currentTarget.clientHeight;
      if (
        !target.hasAttribute("data-chrome-scroll-target") &&
        target.clientHeight < formHeight * MIN_SCROLLER_HEIGHT_RATIO
      )
        return;

      const maxScrollY = Math.max(target.scrollHeight - target.clientHeight, 0);
      const scrollY = Math.min(Math.max(target.scrollTop, 0), maxScrollY);
      if (targetRef.current !== target) {
        targetRef.current = target;
        trackerRef.current.reset(scrollY);
        apply(revealTo(scrollY));
        return;
      }
      if (visibilityRef.current === "shown" && maxScrollY < MIN_SCROLL_RANGE_TO_HIDE_PX) {
        trackerRef.current.reset(scrollY);
        return;
      }
      const revealDistance = isCompactRef.current ? formHeight * COMPACT_REVEAL_DISTANCE_RATIO : undefined;
      const isHidden = trackerRef.current.update(scrollY, maxScrollY, revealDistance);
      apply(isHidden ? "hidden" : revealTo(scrollY));
    },
    [apply, revealTo],
  );
};
