import { describe, expect, it } from "vitest";
import {
  getBoundaryTimerDelay,
  getTrialEndingCalloutNextBoundary,
  MAX_BOUNDARY_TIMER_DELAY_MS,
  resolveTrialEndingCallout,
  type TrialEndingNoticeData,
} from "./script";

const notice = {
  visibleFrom: Date.parse("2026-08-25T00:00:00+09:00"),
  trialEndsAt: Date.parse("2026-09-01T00:00:00+09:00"),
} satisfies TrialEndingNoticeData;

describe("TrialEndingCallout", () => {
  it("終了7日前から終了境界の直前まで表示する", () => {
    expect(resolveTrialEndingCallout(notice, notice.visibleFrom - 1)).toBeNull();
    expect(resolveTrialEndingCallout(notice, notice.visibleFrom)).toEqual({ finalDateLabel: "8月31日" });
    expect(resolveTrialEndingCallout(notice, notice.trialEndsAt - 1)).toEqual({ finalDateLabel: "8月31日" });
    expect(resolveTrialEndingCallout(notice, notice.trialEndsAt)).toBeNull();
  });

  it("排他的な終了境界の前日をJSTの最終日として表示する", () => {
    const utcBoundary = {
      visibleFrom: Date.parse("2026-08-24T15:00:00.000Z"),
      trialEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
    };

    expect(resolveTrialEndingCallout(utcBoundary, utcBoundary.visibleFrom)?.finalDateLabel).toBe("8月31日");
  });

  it("長時間開いた画面を開始境界と終了境界で再評価する", () => {
    expect(getTrialEndingCalloutNextBoundary(notice, notice.visibleFrom - 1)).toBe(notice.visibleFrom);
    expect(getTrialEndingCalloutNextBoundary(notice, notice.visibleFrom)).toBe(notice.trialEndsAt);
    expect(getTrialEndingCalloutNextBoundary(notice, notice.trialEndsAt)).toBeNull();
  });

  it("長いタイマー待機をブラウザ上限で分割する", () => {
    expect(getBoundaryTimerDelay(MAX_BOUNDARY_TIMER_DELAY_MS + 1, 0)).toBe(MAX_BOUNDARY_TIMER_DELAY_MS);
    expect(getBoundaryTimerDelay(99, 100)).toBe(0);
  });

  it("欠損または壊れた境界は表示しない", () => {
    expect(resolveTrialEndingCallout(null, notice.visibleFrom)).toBeNull();
    expect(
      resolveTrialEndingCallout(
        { visibleFrom: notice.trialEndsAt, trialEndsAt: notice.trialEndsAt },
        notice.trialEndsAt,
      ),
    ).toBeNull();
  });
});
