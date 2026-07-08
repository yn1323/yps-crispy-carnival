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
    hasCurrentConfirmedShift: false,
    hasOpenRecruitment: false,
    hasFutureOpenRecruitment: false,
    hasFutureConfirmedShift: false,
    hadActiveOrRetainedStage: false,
    hadRetainedStage: false,
    lastActivityAt: NOW,
    ...overrides,
  };
}

function activeTrialInputs(overrides: Partial<ShopStageInputs> = {}): ShopStageInputs {
  return inputs({
    realStaffCount: 2,
    recruitmentCount: 1,
    hasOpenRecruitment: true,
    lastActivityAt: NOW,
    ...overrides,
  });
}

function retainedInputs(overrides: Partial<ShopStageInputs> = {}): ShopStageInputs {
  return inputs({
    realStaffCount: 2,
    recruitmentCount: 1,
    confirmedRecruitmentCount: 1,
    hasCurrentOrFutureConfirmedShift: true,
    hasCurrentConfirmedShift: true,
    hasOpenRecruitment: true,
    hasFutureOpenRecruitment: true,
    lastActivityAt: NOW,
    ...overrides,
  });
}

function dormantInputs(overrides: Partial<ShopStageInputs> = {}): ShopStageInputs {
  return inputs({
    realStaffCount: 2,
    confirmedRecruitmentCount: 1,
    hadActiveOrRetainedStage: true,
    lastActivityAt: NOW - 31 * DAY_MS,
    ...overrides,
  });
}

describe("classifyShopStage", () => {
  it("登録直後の店舗は開始前", () => {
    expect(classifyShopStage(inputs(), NOW)).toBe("beforeStart");
  });

  it("スタッフ2人未満なら現在/未来シフトがあっても開始前", () => {
    expect(classifyShopStage(activeTrialInputs({ realStaffCount: 1 }), NOW)).toBe("beforeStart");
    expect(classifyShopStage(retainedInputs({ realStaffCount: 1 }), NOW)).toBe("beforeStart");
  });

  it("スタッフ2人以上 + 現在/未来の募集中シフトあり + 今日の確定シフトなし = 立ち上げ", () => {
    expect(classifyShopStage(activeTrialInputs({ hasOpenRecruitment: true }), NOW)).toBe("activeTrial");
  });

  it("スタッフ2人以上 + 未来の確定シフトあり + 今日の確定シフトなし = 立ち上げ", () => {
    expect(
      classifyShopStage(
        activeTrialInputs({
          hasCurrentOrFutureConfirmedShift: true,
          hasOpenRecruitment: false,
        }),
        NOW,
      ),
    ).toBe("activeTrial");
  });

  it("スタッフ2人以上 + 今日に被る確定シフトあり + 未来の募集中シフトあり = 運用中", () => {
    expect(classifyShopStage(retainedInputs(), NOW)).toBe("retained");
  });

  it("スタッフ2人以上 + 今日に被る確定シフトあり + 未来の確定シフトあり = 運用中", () => {
    expect(
      classifyShopStage(
        retainedInputs({
          hasFutureConfirmedShift: true,
          hasFutureOpenRecruitment: false,
          hasOpenRecruitment: false,
        }),
        NOW,
      ),
    ).toBe("retained");
  });

  it("今日に被る確定シフトがあれば、未来の募集または確定がなくても運用中に残す", () => {
    expect(
      classifyShopStage(
        retainedInputs({
          hasFutureConfirmedShift: false,
          hasFutureOpenRecruitment: false,
          hasOpenRecruitment: false,
        }),
        NOW,
      ),
    ).toBe("retained");
  });

  it("過去に立ち上げまたは運用中で、確定シフト経験があり、現在/未来シフトがなければ休眠", () => {
    expect(classifyShopStage(dormantInputs(), NOW)).toBe("activeTrialDormant");
  });

  it("現在/未来シフトがなければ、直近30日以内の活動があっても休眠", () => {
    expect(classifyShopStage(dormantInputs({ lastActivityAt: NOW }), NOW)).toBe("activeTrialDormant");
  });

  it("過去に運用中だった店舗の休眠は運用後休眠として残す", () => {
    expect(classifyShopStage(dormantInputs({ hadRetainedStage: true }), NOW)).toBe("retainedDormant");
  });

  it("確定シフト経験がなければ、過去ステージ履歴があっても休眠ではなく開始前", () => {
    expect(classifyShopStage(dormantInputs({ confirmedRecruitmentCount: 0 }), NOW)).toBe("beforeStart");
    expect(classifyShopStage(dormantInputs({ confirmedRecruitmentCount: 0, hadRetainedStage: true }), NOW)).toBe(
      "beforeStart",
    );
  });

  it("過去ステージ履歴がなければ、活動が止まっていても開始前", () => {
    expect(classifyShopStage(dormantInputs({ hadActiveOrRetainedStage: false }), NOW)).toBe("beforeStart");
  });

  it("現在/未来シフトがあれば、過去シフトがあっても休眠ではなく利用中として扱う", () => {
    expect(classifyShopStage(dormantInputs({ hasOpenRecruitment: true }), NOW)).toBe("activeTrial");
    expect(
      classifyShopStage(
        dormantInputs({
          hasCurrentConfirmedShift: true,
          hasCurrentOrFutureConfirmedShift: true,
          hasFutureOpenRecruitment: true,
        }),
        NOW,
      ),
    ).toBe("retained");
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
    expect(lastReachedOnboardingStep(inputs({ realStaffCount: 2, recruitmentCount: 2 }))).toBe(
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
    expect(lastReachedOnboardingStep(activeTrialInputs())).toBe("activated");
    expect(lastReachedOnboardingStep(retainedInputs())).toBe("activated");
  });
});

describe("shopStageAlerts", () => {
  it("順調な店舗にはアラートを出さない", () => {
    const alerts = shopStageAlerts({
      inputs: retainedInputs({
        hasOpenRecruitment: false,
        hasFutureOpenRecruitment: false,
        hasFutureConfirmedShift: true,
      }),
      stage: "retained",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it("募集中なのに提出0件を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: activeTrialInputs({ hasOpenRecruitment: true }),
      stage: "activeTrial",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("募集中・提出0件");
  });

  it("提出があるのに一度も確定していない店舗を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: activeTrialInputs({ confirmedRecruitmentCount: 0, hasSubmission: true, hasOpenRecruitment: true }),
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
      inputs: dormantInputs({ hadRetainedStage: true, lastActivityAt: NOW - 40 * DAY_MS }),
      stage: "retainedDormant",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("現在/未来シフトなし");
    expect(alerts).toContain("30日以上活動なし");
  });

  it("運用中で次シフトが未設定の店舗を検出する", () => {
    const alerts = shopStageAlerts({
      inputs: retainedInputs({
        hasFutureConfirmedShift: false,
        hasFutureOpenRecruitment: false,
        hasOpenRecruitment: false,
      }),
      stage: "retained",
      openRecruitmentSubmittedCount: 0,
      openNotificationFailureCount: 0,
      nowMs: NOW,
    });
    expect(alerts).toContain("次シフト未設定");
    expect(alerts).not.toContain("現在/未来シフトなし");
  });
});

describe("daysSince", () => {
  it("経過日数を切り捨てで返し、未来時刻は0に丸める", () => {
    expect(daysSince(NOW - 1.5 * DAY_MS, NOW)).toBe(1);
    expect(daysSince(NOW + DAY_MS, NOW)).toBe(0);
  });
});
