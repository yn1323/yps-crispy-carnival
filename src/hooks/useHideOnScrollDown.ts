import { useEffect, useState } from "react";

/** ページ上端からこの距離までは、スクロール方向にかかわらず常に表示する。 */
const ALWAYS_VISIBLE_SCROLL_Y = 64;
/** 指の揺れや慣性スクロールの微小な戻りで表示が切り替わらないようにする移動量。 */
const HIDE_DISTANCE = 12;
const REVEAL_DISTANCE = 8;

type Options = {
  enabled?: boolean;
};

/** 下方向のページスクロールで隠し、上方向のスクロールとページ上端で再表示する対象の非表示状態を返す。 */
export function useHideOnScrollDown({ enabled = true }: Options = {}) {
  const [isHidden, setIsHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsHidden(false);
      return;
    }

    let hidden = false;
    // 現在の方向へ進んだ最遠点。逆方向への移動量をここから測る。
    let anchorY = readScrollY();

    const apply = (next: boolean, scrollY: number) => {
      hidden = next;
      anchorY = scrollY;
      setIsHidden(next);
    };

    const handleScroll = () => {
      // Dialogなどのscroll lockはbodyを固定して位置を一時的に動かすため、利用者のスクロールとして扱わない。
      if (document.body.hasAttribute("data-scroll-lock")) return;

      const scrollY = readScrollY();
      if (scrollY <= ALWAYS_VISIBLE_SCROLL_Y) {
        apply(false, scrollY);
        return;
      }

      if (hidden) {
        if (scrollY > anchorY) anchorY = scrollY;
        else if (anchorY - scrollY >= REVEAL_DISTANCE) apply(false, scrollY);
        return;
      }

      if (scrollY < anchorY) anchorY = scrollY;
      else if (scrollY - anchorY >= HIDE_DISTANCE) apply(true, scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [enabled]);

  return isHidden;
}

/** iOSの端のバウンスで範囲外になった位置を、実際にスクロールできる範囲へ丸める。 */
function readScrollY(): number {
  const maxScrollY = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  return Math.min(Math.max(window.scrollY, 0), maxScrollY);
}
