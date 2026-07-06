import { describe, expect, it } from "vitest";
import {
  classifyShopStage,
  daysSince,
  lastReachedOnboardingStep,
  type ShopStageInputs,
  shopStageAlerts,
} from "./stage";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 4); // 2026-07-04

function inputs(overrides: Partial<ShopStageInputs> = {}): ShopStageInputs {
  return {
    realStaffCount: 0,
    recruitmentCount: 0,
    confirmedRecruitmentCount: 0,
    hasSubmission: false,
    hasNotificationSent: false,
    hasCurrentOrFutureConfirmedShift: false,
    hasOpenRecruitment: false,
    lastActivityAt: NOW,
    ...overrides,
  };
}

/** 実利用開始条件（スタッフ3人 + 募集2件 + 通知あり）を満たした状態 */
function activatedInputs(overrides: Partial<ShopStageInputs> = {}): ShopStageInputs {
  return inputs({
    realStaffCount: 3,
    recruitmentCount: 2,
    hasNotificationSent: true,
    ...overrides,
  });
}

describe("classifyShopStage", () => {
  it("登録直後の店舗は開始前", () => {
    expect(classifyShopStage(inputs(), NOW)).toBe("beforeStart");
  });

  it("実利用開始条件をどれか1つでも欠くと開始前のまま", () => {
    // スタッフ2人（3人未満）
    expect(classifyShopStage(activatedInputs({ realStaffCount: 2 }), NOW)).toBe("beforeStart");
    // 募集1件（2件未満）
    expect(classifyShopStage(activatedInputs({ recruitmentCount: 1 }), NOW)).toBe("beforeStart");
    // 通知も提出もない（募集を作っただけ）
    expect(classifyShopStage(activatedInputs({ hasNotificationSent: false }), NOW)).toBe("beforeStart");
  });

  it("通知送信がなくても提出があれば実利用開始と判定する", () => {
    const result = classifyShopStage(activatedInputs({ hasNotificationSent: false, hasSubmission: true }), NOW);
    expect(result).toBe("activeTrial");
  });

  it("実利用開始済み + 確定3件未満 + 直近活動あり = 立ち上がり中", () => {
    expect(classifyShopStage(activatedInputs({ confirmedRecruitmentCount: 2 }), NOW)).toBe("activeTrial");
  });

  it("実利用開始済みでも31日以上活動がなければ立ち上がり後休眠", () => {
    const stale = activatedInputs({ lastActivityAt: NOW - 31 * DAY_MS });
    expect(classifyShopStage(stale, NOW)).toBe("activeTrialDormant");
  });

  it("確定3件以上 + 現在も稼働 = 継続中", () => {
    expect(classifyShopStage(activatedInputs({ confirmedRecruitmentCount: 3 }), NOW)).toBe("retained");
  });

  it("確定3件以上でも現在/未来シフト・進行中募集・直近活動がなければ継続後休眠", () => {
    const dormant = activatedInputs({
      confirmedRecruitmentCount: 5,
      lastActivityAt: NOW - 45 * DAY_MS,
    });
    expect(classifyShopStage(dormant, NOW)).toBe("retainedDormant");
  });

  it("直近活動がなくても未来の確定シフトがあれば継続中（月末に翌月分を作る店舗を誤判定しない）", () => {
    const monthly = activatedInputs({
      confirmedRecruitmentCount: 3,
      lastActivityAt: NOW - 45 * DAY_MS,
      hasCurrentOrFutureConfirmedShift: true,
    });
    expect(classifyShopStage(monthly, NOW)).toBe("retained");
  });

  it("直近活動がなくても進行中の募集があれば稼働中とみなす", () => {
    const openOnly = activatedInputs({
      confirmedRecruitmentCount: 3,
      lastActivityAt: NOW - 45 * DAY_MS,
      hasOpenRecruitment: true,
    });
    expect(classifyShopStage(openOnly, NOW)).toBe("retained");
  });

  it("休眠判定の境界: ちょうど30日は稼働中、31日で休眠", () => {
    const at30 = activatedInputs({ lastActivityAt: NOW - 30 * DAY_MS });
    const at31 = activatedInputs({ lastActivityAt: NOW - 31 * DAY_MS });
    expect(classifyShopStage(at30, NOW)).toBe("activeTrial");
    expect(classifyShopStage(at31, NOW)).toBe("activeTrialDormant");
  });
});

describe("lastReachedOnboardingStep", () => {
  it("店舗を作っただけなら店舗登録まで", () => {
    expect(lastReachedOnboardingStep(inputs())).toBe("shopCreated");
  });

  it("テスト募集作成 → テスト申請 → テスト確定の順に進む", () => {
    expect(lastReachedOnboardingStep(inputs({ realStaffCount: 1 }))).toBe("firstStaffRegistered");
    expect(lastReachedOnboardingStep(inputs({ recruitmentCount: 1 }))).toBe("testRecruitmentCreated");
    expect(lastReachedOnboardingStep(inputs({ recruitmentCount: 1, hasSubmission: true }))).toBe(
      "selfTestSubmissionReceived",
    );
    expect(lastReachedOnboardingStep(inputs({ recruitmentCount: 1, confirmedRecruitmentCount: 1 }))).toBe(
      "testRecruitmentConfirmed",
    );
  });

  it("本番シフト作成と通知送信を判定する", () => {
    expect(lastReachedOnboardingStep(inputs({ realStaffCount: 3, recruitmentCount: 2 }))).toBe(
      "productionRecruitmentCreated",
    );
    expect(
      lastReachedOnboardingStep(inputs({ realStaffCount: 2, recruitmentCount: 2, hasNotificationSent: true })),
    ).toBe("notificationSent");
  });

  it("順序を飛ばしても最も先の到達点を返す", () => {
    const submittedWithoutNotification = inputs({ recruitmentCount: 2, hasSubmission: true });
    expect(lastReachedOnboardingStep(submittedWithoutNotification)).toBe("productionRecruitmentCreated");
  });

  it("実利用開始条件を満たすと実利用開始を返す", () => {
    expect(lastReachedOnboardingStep(activatedInputs())).toBe("activated");
  });
});

describe("shopStageAlerts", () => {
  it("順調な店舗にはアラートを出さない", () => {
    const alerts = shopStageAlerts({
      inputs: activatedInputs({ confirmedRecruitmentCount: 3, hasCurrentOrFutureConfirmedShift: true }),
      stage: "retained",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it("募集中なのに提出0件を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: activatedInputs({ hasOpenRecruitment: true }),
      stage: "activeTrial",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("募集中・提出0件");
  });

  it("提出があるのに一度も確定していない店舗を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: activatedInputs({ hasSubmission: true, hasOpenRecruitment: true }),
      stage: "activeTrial",
      openRecruitmentSubmittedCount: 2,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("提出あり・確定なし");
    expect(alerts).not.toContain("募集中・提出0件");
  });

  it("開始前で7日以上停止している店舗と通知失敗を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: inputs({ lastActivityAt: NOW - 8 * DAY_MS }),
      stage: "beforeStart",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 2,
      nowMs: NOW,
    });
    expect(alerts).toContain("開始前で8日停止");
    expect(alerts).toContain("通知失敗あり（2件）");
  });

  it("実利用開始後に現在/未来シフトがない店舗を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: activatedInputs({ confirmedRecruitmentCount: 3, lastActivityAt: NOW - 40 * DAY_MS }),
      stage: "retainedDormant",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("現在/未来シフトなし");
    expect(alerts).toContain("30日以上活動なし");
  });
});

describe("daysSince", () => {
  it("経過日数を切り捨てで返し、未来時刻は0に丸める", () => {
    expect(daysSince(NOW - 1.5 * DAY_MS, NOW)).toBe(1);
    expect(daysSince(NOW + DAY_MS, NOW)).toBe(0);
  });
});
