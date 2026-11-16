import { useLayoutEffect, useState } from "react";
import { resolveHourWidth, type TimelineMetrics } from "./script";

/**
 * 時間の軸を置く要素の幅から、1時間の幅（px）を決める。
 * 返した measureRef を、時間の軸と同じ幅の要素へ渡す。幅が変わるたびに計算し直す。
 */
export const useTimelineHourWidth = (totalHours: number, metrics: TimelineMetrics) => {
  const { axisPadding, minHourWidth } = metrics;
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [hourWidth, setHourWidth] = useState(minHourWidth);

  useLayoutEffect(() => {
    if (!element) return;
    const update = () =>
      setHourWidth(
        resolveHourWidth({ trackWidth: element.clientWidth, totalHours, metrics: { axisPadding, minHourWidth } }),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, totalHours, axisPadding, minHourWidth]);

  return { measureRef: setElement, hourWidth };
};
