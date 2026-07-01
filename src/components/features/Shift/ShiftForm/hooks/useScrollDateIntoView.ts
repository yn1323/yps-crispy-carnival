import { type RefObject, useEffect } from "react";

// 選択日のチップ（data-date-chip="<iso>"）をコンテナ内で画面内へスクロールする。
// 初期表示で今日が先頭以外のとき、レール／横チップが今日まで自動スクロールするために使う。
export const useScrollDateIntoView = (
  containerRef: RefObject<HTMLElement | null>,
  selectedDate: string,
  axis: "vertical" | "horizontal",
) => {
  useEffect(() => {
    if (!selectedDate) return;
    const container = containerRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-date-chip="${selectedDate}"]`);
    if (!target) return;

    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({
        block: "nearest",
        inline: axis === "horizontal" ? "center" : "nearest",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [containerRef, selectedDate, axis]);
};
