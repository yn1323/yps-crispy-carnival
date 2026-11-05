import { describe, expect, it } from "vitest";
import {
  buildTrialEndingNoticeViewModel,
  getTrialEndingNextBoundary,
  getTrialEndingStage,
  type TrialEndingNoticeData,
} from "./script";

const DAY_MS = 24 * 60 * 60 * 1000;
// 2026-11-01 0:00 JSTの排他的境界。最終利用日は10月31日。
const TRIAL_ENDS_AT = Date.UTC(2026, 9, 31, 15, 0, 0);

const notice = (freeLimitStatus: TrialEndingNoticeData["freeLimitStatus"]): TrialEndingNoticeData => ({
  trialEndsAt: TRIAL_ENDS_AT,
  freeLimitStatus,
});

describe("getTrialEndingStage", () => {
  it.each([
    { label: "残り14日より前", remaining: 14 * DAY_MS + 1, expected: null },
    { label: "残り14日ちょうど", remaining: 14 * DAY_MS, expected: "early" },
    { label: "残り7日より前", remaining: 7 * DAY_MS + 1, expected: "early" },
    { label: "残り7日ちょうど", remaining: 7 * DAY_MS, expected: "soon" },
    { label: "最終日の前日", remaining: DAY_MS + 1, expected: "soon" },
    { label: "最終日の0:00 JST", remaining: DAY_MS, expected: "lastDay" },
    { label: "最終日の終わり", remaining: 1, expected: "lastDay" },
    { label: "終了時刻以降", remaining: 0, expected: null },
  ])("$labelは$expected", ({ remaining, expected }) => {
    expect(getTrialEndingStage(TRIAL_ENDS_AT, TRIAL_ENDS_AT - remaining)).toBe(expected);
  });
});

describe("getTrialEndingNextBoundary", () => {
  it("表示開始、残り7日、最終日、終了の順に次の境界を返し、終了後はnullを返す", () => {
    const data = notice({ kind: "withinLimits" });
    expect(getTrialEndingNextBoundary(data, TRIAL_ENDS_AT - 20 * DAY_MS)).toBe(TRIAL_ENDS_AT - 14 * DAY_MS);
    expect(getTrialEndingNextBoundary(data, TRIAL_ENDS_AT - 14 * DAY_MS)).toBe(TRIAL_ENDS_AT - 7 * DAY_MS);
    expect(getTrialEndingNextBoundary(data, TRIAL_ENDS_AT - 3 * DAY_MS)).toBe(TRIAL_ENDS_AT - DAY_MS);
    expect(getTrialEndingNextBoundary(data, TRIAL_ENDS_AT - 1)).toBe(TRIAL_ENDS_AT);
    expect(getTrialEndingNextBoundary(data, TRIAL_ENDS_AT)).toBeNull();
    expect(getTrialEndingNextBoundary(null, TRIAL_ENDS_AT)).toBeNull();
  });
});

describe("buildTrialEndingNoticeViewModel", () => {
  const descriptions = [
    "終了後はFreeプラン（スタッフ5名 / 1店舗 / 管理者2名まで）になります。",
    "上限を超えると、シフト募集や希望シフトの提出、通知機能がストップします。",
  ];

  it("Free上限を超える組織には、残り7日から要対応にし、最終日は閉じられなくする", () => {
    const data = notice({
      kind: "overLimit",
      violations: [
        { kind: "people", current: 12 },
        { kind: "shops", current: 2 },
      ],
    });

    expect(buildTrialEndingNoticeViewModel(data, TRIAL_ENDS_AT - 10 * DAY_MS)).toEqual({
      stage: "early",
      tone: "neutral",
      title: "10月31日で無料トライアルが終了します",
      descriptions,
      dismissible: true,
    });
    expect(buildTrialEndingNoticeViewModel(data, TRIAL_ENDS_AT - 7 * DAY_MS)).toMatchObject({
      stage: "soon",
      tone: "warning",
      title: "10月31日で無料トライアルが終了します",
      dismissible: true,
    });
    expect(buildTrialEndingNoticeViewModel(data, TRIAL_ENDS_AT - 1)).toMatchObject({
      stage: "lastDay",
      tone: "warning",
      title: "無料トライアルが本日で終了します",
      dismissible: false,
    });
  });

  it("Free上限内の組織には、同じ本文を示し、どの段階でも要対応の色を使わない", () => {
    const data = notice({ kind: "withinLimits" });

    expect(buildTrialEndingNoticeViewModel(data, TRIAL_ENDS_AT - 3 * DAY_MS)).toMatchObject({
      stage: "soon",
      tone: "neutral",
      descriptions,
    });
    expect(buildTrialEndingNoticeViewModel(data, TRIAL_ENDS_AT - 1)?.tone).toBe("neutral");
  });

  it("利用数を確認できない組織には、同じ本文を示し、残り7日から要対応にする", () => {
    expect(buildTrialEndingNoticeViewModel(notice({ kind: "unknown" }), TRIAL_ENDS_AT - 2 * DAY_MS)).toMatchObject({
      tone: "warning",
      descriptions,
    });
  });

  it("表示期間の外と案内がない組織にはnullを返す", () => {
    expect(buildTrialEndingNoticeViewModel(notice({ kind: "withinLimits" }), TRIAL_ENDS_AT - 15 * DAY_MS)).toBeNull();
    expect(buildTrialEndingNoticeViewModel(notice({ kind: "withinLimits" }), TRIAL_ENDS_AT)).toBeNull();
    expect(buildTrialEndingNoticeViewModel(null, TRIAL_ENDS_AT - DAY_MS)).toBeNull();
  });
});
