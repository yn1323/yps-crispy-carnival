import { useEffect, useState } from "react";

/** ページ上端からこの距離までは、スクロール方向にかかわらず常に表示する。 */
export const ALWAYS_VISIBLE_SCROLL_Y = 64;
/** 指の揺れや慣性スクロールの微小な戻りで表示が切り替わらないようにする移動量。 */
const HIDE_DISTANCE = 12;
const REVEAL_DISTANCE = 8;

type Options = {
  enabled?: boolean;
};

/**
 * スクロール位置の変化から、隠すか表示するかを決める。ページのスクロールと、画面の内側の入れ物のスクロールで共有する。
 * 下方向へ進むと隠し、上方向へ戻るか上端の近くへ来ると表示する。
 */
export function createHideOnScrollDownTracker(initialScrollY = 0) {
  let hidden = false;
  // 現在の方向へ進んだ最遠点。逆方向への移動量をここから測る。
  let anchorY = initialScrollY;

  const apply = (next: boolean, scrollY: number) => {
    hidden = next;
    anchorY = scrollY;
    return hidden;
  };

  return {
    /**
     * いまのスクロール位置と、スクロールできる最大の位置を受け取り、隠すかどうかを返す。
     * `revealDistance`は、隠したあとに上へ戻して表示するまでの移動量。
     */
    update(scrollY: number, maxScrollY: number, revealDistance = REVEAL_DISTANCE): boolean {
      if (scrollY <= ALWAYS_VISIBLE_SCROLL_Y) return apply(false, scrollY);

      // スクロール範囲が縮むと、ブラウザが下端の位置を戻す（モバイルブラウザのツールバーや、隠した分だけ入れ物が伸びた場合）。
      // 最遠点も新しい下端へ合わせ、この戻りを利用者の上スクロールとして数えない。
      if (anchorY > maxScrollY) anchorY = maxScrollY;

      if (hidden) {
        if (scrollY > anchorY) anchorY = scrollY;
        else if (anchorY - scrollY >= revealDistance) return apply(false, scrollY);
        return hidden;
      }

      if (scrollY < anchorY) anchorY = scrollY;
      else if (scrollY - anchorY >= HIDE_DISTANCE) return apply(true, scrollY);
      return hidden;
    },
    /** 別の入れ物のスクロールへ切り替わったときに、表示した状態からやり直す。 */
    reset(scrollY: number): boolean {
      return apply(false, scrollY);
    },
  };
}

/** 下方向のページスクロールで隠し、上方向のスクロールとページ上端で再表示する対象の非表示状態を返す。 */
export function useHideOnScrollDown({ enabled = true }: Options = {}) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsHidden(false);
      return;
    }

    const tracker = createHideOnScrollDownTracker(readScrollPosition().scrollY);

    const handleScroll = () => {
      // Dialogなどのscroll lockはbodyを固定して位置を一時的に動かすため、利用者のスクロールとして扱わない。
      if (document.body.hasAttribute("data-scroll-lock")) return;

      const { scrollY, maxScrollY } = readScrollPosition();
      setIsHidden(tracker.update(scrollY, maxScrollY));
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled]);

  return isHidden;
}

/** 現在スクロールできる範囲と、iOSの端のバウンスで範囲外になった分を範囲内へ丸めた位置を返す。 */
function readScrollPosition(): { scrollY: number; maxScrollY: number } {
  const maxScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  return { scrollY: Math.min(Math.max(window.scrollY, 0), maxScrollY), maxScrollY };
}
