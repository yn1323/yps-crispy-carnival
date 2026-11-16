import { useLayoutEffect, useState } from "react";
import { TIME_AXIS_PADDING_PX } from "@/src/components/shared/ShiftTimeline/constants";
import { MIN_HOUR_WIDTH_PX } from "./script";

/**
 * 時間の軸を置く要素の幅から、1時間の幅（px）を決める。
 * 返した measureRef を、時間の軸と同じ幅の要素へ渡す。幅が変わるたびに計算し直す。
 */
export const useTimelineHourWidth = (totalHours: number) => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [hourWidth, setHourWidth] = useState(MIN_HOUR_WIDTH_PX);

  useLayoutEffect(() => {
    if (!element || totalHours <= 0) return;
    const update = () => {
      const width = element.clientWidth;
      if (width <= 0) return;
      setHourWidth(Math.max(MIN_HOUR_WIDTH_PX, (width - TIME_AXIS_PADDING_PX * 2) / totalHours));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, totalHours]);

  return { measureRef: setElement, hourWidth };
};
