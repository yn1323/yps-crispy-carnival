import { type TouchEvent, useCallback, useRef } from "react";

/** 左右フリックとして扱う、横の移動量（px）。 */
const SWIPE_THRESHOLD = 50;

/**
 * スマートフォンの日別表示で、左右フリックで前後の日へ移る。
 * 右へフリックすると前の日、左へフリックすると次の日を選ぶ。募集期間の端では何もしない。
 * 返したハンドラは、日別表示の全体を包む要素へ渡す。3つの提出方法で同じ動きにする。
 */
export const useSwipeDateChange = ({
  dates,
  selectedDate,
  onSelect,
}: {
  dates: readonly string[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) => {
  const touchStartX = useRef(0);

  const onTouchStart = useCallback((event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const deltaX = event.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(deltaX) < SWIPE_THRESHOLD) return;
      const currentIndex = dates.indexOf(selectedDate);
      if (deltaX > 0 && currentIndex > 0) onSelect(dates[currentIndex - 1]);
      else if (deltaX < 0 && currentIndex < dates.length - 1) onSelect(dates[currentIndex + 1]);
    },
    [dates, selectedDate, onSelect],
  );

  return { onTouchStart, onTouchEnd };
};
