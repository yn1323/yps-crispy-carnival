import { useCallback, useEffect, useState } from "react";
import {
  buildTrialEndingNoticeViewModel,
  getBoundaryTimerDelay,
  getTrialEndingNextBoundary,
  type TrialEndingNoticeData,
  type TrialEndingStage,
} from "./script";

const STORAGE_KEY_PREFIX = "shiftori:trial-ending-notice-dismissed";

const storageKey = (organizationId: string, trialEndsAt: number) =>
  `${STORAGE_KEY_PREFIX}:${organizationId}:${trialEndsAt}`;

function readStoredDismissedStage(key: string): TrialEndingStage | null {
  try {
    return window.localStorage.getItem(key) === "early" ? "early" : null;
  } catch {
    return null;
  }
}

/**
 * 段階の境界で再評価し、閉じた段階だけを非表示にする。
 * 残り14日の段階は次の段階まで保存し、残り7日の段階は次にDashboardを開くまで、最終日は閉じられない。
 */
export function useTrialEndingNotice(notice: TrialEndingNoticeData | null, organizationId: string) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const key = notice ? storageKey(organizationId, notice.trialEndsAt) : null;
  const [dismissedStage, setDismissedStage] = useState<TrialEndingStage | null>(() =>
    key ? readStoredDismissedStage(key) : null,
  );
  const nextBoundary = getTrialEndingNextBoundary(notice, currentTime);

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

  const viewModel = buildTrialEndingNoticeViewModel(notice, currentTime);
  const stage = viewModel?.stage ?? null;

  const dismiss = useCallback(() => {
    if (!stage || stage === "lastDay") return;
    setDismissedStage(stage);
    if (stage !== "early" || !key) return;
    try {
      window.localStorage.setItem(key, "early");
    } catch {
      // 保存できないブラウザでも、この画面を開いている間は閉じた状態を保つ。
    }
  }, [key, stage]);

  return { viewModel: viewModel && dismissedStage !== viewModel.stage ? viewModel : null, dismiss };
}
