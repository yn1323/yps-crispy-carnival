import { useEffect, useState } from "react";
import {
  getBoundaryTimerDelay,
  getTrialEndingCalloutNextBoundary,
  resolveTrialEndingCallout,
  type TrialEndingNoticeData,
} from "./script";

export function useTrialEndingCallout(notice: TrialEndingNoticeData | null) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const nextBoundary = getTrialEndingCalloutNextBoundary(notice, currentTime);

  useEffect(() => {
    if (nextBoundary === null) return;

    const timeoutId = window.setTimeout(
      () => {
        // 境界ちょうどで同じ時刻が返っても、必ず次の区間として再評価する。
        setCurrentTime((previous) => Math.max(Date.now(), previous + 1));
      },
      getBoundaryTimerDelay(nextBoundary, currentTime),
    );

    return () => window.clearTimeout(timeoutId);
  }, [currentTime, nextBoundary]);

  return resolveTrialEndingCallout(notice, currentTime);
}
