export type TrialEndingNoticeData = {
  visibleFrom: number;
  trialEndsAt: number;
};

export type TrialEndingCalloutViewModel = {
  finalDateLabel: string;
};

// setTimeout が32bit整数を超えて即時発火しないよう、長い待機は分割する。
export const MAX_BOUNDARY_TIMER_DELAY_MS = 2_147_483_647;

const trialFinalDateFormatter = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  month: "long",
  day: "numeric",
});

export function resolveTrialEndingCallout(
  notice: TrialEndingNoticeData | null,
  now: number,
): TrialEndingCalloutViewModel | null {
  if (!isValidTrialEndingNotice(notice) || now < notice.visibleFrom || now >= notice.trialEndsAt) {
    return null;
  }

  return {
    // trialEndsAt は最終利用日の翌日 0:00 JST という排他的境界。
    finalDateLabel: trialFinalDateFormatter.format(new Date(notice.trialEndsAt - 1)),
  };
}

export function getTrialEndingCalloutNextBoundary(notice: TrialEndingNoticeData | null, now: number): number | null {
  if (!isValidTrialEndingNotice(notice)) return null;
  if (now < notice.visibleFrom) return notice.visibleFrom;
  if (now < notice.trialEndsAt) return notice.trialEndsAt;
  return null;
}

export function getBoundaryTimerDelay(boundary: number, now: number): number {
  return Math.min(Math.max(boundary - now, 0), MAX_BOUNDARY_TIMER_DELAY_MS);
}

function isValidTrialEndingNotice(notice: TrialEndingNoticeData | null): notice is TrialEndingNoticeData {
  return Boolean(
    notice &&
      Number.isFinite(notice.visibleFrom) &&
      Number.isFinite(notice.trialEndsAt) &&
      notice.visibleFrom < notice.trialEndsAt,
  );
}
