import { describe, expect, it } from "vitest";
import type { ShopStageRowDto } from "@/api/analyticsTypes";
import {
  BEFORE_START_DROPOFF_STEPS,
  getBeforeStartAverageElapsedDays,
  getBeforeStartDropoffStepCounts,
  getBeforeStartElapsedDays,
  getBeforeStartRows,
  getShopCreatedAt,
  resolveBeforeStartTutorialStep,
} from "./beforeStartOnboarding";

const BASE_CREATED_AT = Date.UTC(2026, 6, 1);
const BASE_REFERENCE_AT = BASE_CREATED_AT + 3 * 24 * 60 * 60 * 1000;

function shopStageRow(overrides: Partial<ShopStageRowDto> = {}): ShopStageRowDto {
  return {
    alerts: [],
    averageConfirmationLeadTimeMs: null,
    averageDeadlineToConfirmationDays: null,
    averageFirstSubmissionLeadTimeMs: null,
    averageRecruitmentOpenDays: null,
    computedAt: BASE_REFERENCE_AT,
    confirmedSubmissionRate: null,
    confirmedRecruitmentCount: 0,
    emailNotificationSentCount: null,
    hadActiveOrRetainedStage: false,
    hadRetainedStage: false,
    firstRecruitmentCreatedAt: null,
    firstRecruitmentDeadline: null,
    lastShiftCreatedAt: null,
    lastShiftPeriodEnd: null,
    lastShiftPeriodStart: null,
    lastShiftSubmissionRate: null,
    hasCurrentConfirmedShift: false,
    hasCurrentOrFutureConfirmedShift: false,
    hasFutureConfirmedShift: false,
    hasFutureOpenRecruitment: false,
    hasNotificationSent: false,
    hasSubmission: false,
    lastActivityAt: null,
    lastConfirmedRecruitmentLeadTimeMs: null,
    lastRecruitmentConfirmedAt: null,
    lastRecruitmentCreatedAt: null,
    lastRecruitmentSubmissionRate: null,
    lineLinkedStaffCount: 0,
    lineNotificationSentCount: null,
    notificationLineSentRate: null,
    onboardingStepLabel: null,
    openNotificationFailureCount: 0,
    openRecruitmentCount: 0,
    openRecruitmentSubmittedCount: 0,
    planKey: "standard",
    postReminderSubmissionRate: null,
    recruitmentCount: 0,
    recruitmentCreatedLast30Days: null,
    reminderSentStaffRate: null,
    resubmissionRate: null,
    shiftTargetStaffCount: 0,
    shopCreatedAt: BASE_CREATED_AT,
    shopId: "shop1",
    shopName: "テスト店舗",
    staffCount: 0,
    stage: "beforeStart",
    stageReferenceAt: BASE_REFERENCE_AT,
    stalledDays: null,
    submittedRecruitmentCount: null,
    submissionRate: null,
    ...overrides,
  };
}

describe("beforeStartOnboarding", () => {
  it("開始前チュートリアルの到達ステップを順番に判定する", () => {
    expect(resolveBeforeStartTutorialStep(shopStageRow()).label).toBe("店舗登録");
    expect(resolveBeforeStartTutorialStep(shopStageRow({ recruitmentCount: 1 })).label).toBe("テスト用シフト作成");
    expect(resolveBeforeStartTutorialStep(shopStageRow({ hasSubmission: true, recruitmentCount: 1 })).label).toBe(
      "自分でシフト申請",
    );
    expect(
      resolveBeforeStartTutorialStep(
        shopStageRow({ confirmedRecruitmentCount: 1, hasSubmission: true, recruitmentCount: 1 }),
      ).label,
    ).toBe("テストシフト確定");
    expect(
      resolveBeforeStartTutorialStep(
        shopStageRow({
          confirmedRecruitmentCount: 1,
          hasSubmission: true,
          recruitmentCount: 1,
          shiftTargetStaffCount: 2,
        }),
      ).label,
    ).toBe("スタッフ追加");
  });

  it("ドロップアウト集計では店舗登録直後で止まった店舗も含める", () => {
    expect(BEFORE_START_DROPOFF_STEPS.map((step) => step.label)).toEqual([
      "店舗登録",
      "テスト用シフト作成",
      "自分でシフト申請",
      "テストシフト確定",
      "スタッフ追加",
    ]);
  });

  it("ドロップアウト集計は最後に到達したステップ別に店舗数と割合を出す", () => {
    const counts = getBeforeStartDropoffStepCounts([
      shopStageRow({ shopId: "shop-created" }),
      shopStageRow({ recruitmentCount: 1, shopId: "recruitment-created" }),
      shopStageRow({ hasSubmission: true, recruitmentCount: 1, shopId: "submitted" }),
    ]);

    expect(
      counts.map((item) => ({
        count: item.count,
        displayIndex: item.displayIndex,
        percentage: item.percentage,
        shortLabel: item.shortLabel,
      })),
    ).toEqual([
      { count: 1, displayIndex: 1, percentage: 1 / 3, shortLabel: "店舗登録" },
      { count: 1, displayIndex: 2, percentage: 1 / 3, shortLabel: "シフト作成" },
      { count: 1, displayIndex: 3, percentage: 1 / 3, shortLabel: "シフト申請" },
      { count: 0, displayIndex: 4, percentage: 0, shortLabel: "シフト確定" },
      { count: 0, displayIndex: 5, percentage: 0, shortLabel: "スタッフ追加" },
    ]);
  });

  it("前のステップが未達なら後続データがあっても途中で止める", () => {
    const row = shopStageRow({ confirmedRecruitmentCount: 1, recruitmentCount: 1, shiftTargetStaffCount: 2 });

    expect(resolveBeforeStartTutorialStep(row).label).toBe("テスト用シフト作成");
  });

  it("開始前店舗を登録日の新しい順に並べる", () => {
    const older = shopStageRow({ shopCreatedAt: BASE_CREATED_AT, shopId: "old" });
    const newer = shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 1000, shopId: "new" });
    const unknownCreatedAt = shopStageRow({ shopCreatedAt: null, shopId: "unknown" });

    expect(
      getBeforeStartRows({
        date: "2026-07-04",
        kind: "shopStages",
        rows: [older, shopStageRow({ shopId: "active", stage: "activeTrial" }), unknownCreatedAt, newer],
        stageCounts: { activeTrial: 1, activeTrialDormant: 0, beforeStart: 3, retained: 0, retainedDormant: 0 },
        unclassifiedCount: 0,
      }).map((row) => row.shopId),
    ).toEqual(["new", "old", "unknown"]);
  });

  it("登録日からの経過日数と平均を算出し、登録日未取得の行は除く", () => {
    const row = shopStageRow();
    const secondRow = shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 24 * 60 * 60 * 1000 });
    const unknownCreatedAt = shopStageRow({ shopCreatedAt: null });

    expect(getBeforeStartElapsedDays(row)).toBe(3);
    expect(getBeforeStartElapsedDays(unknownCreatedAt)).toBeNull();
    expect(getShopCreatedAt(unknownCreatedAt)).toBeNull();
    expect(getBeforeStartAverageElapsedDays([row, secondRow, unknownCreatedAt])).toBe(2.5);
    expect(getBeforeStartAverageElapsedDays([])).toBeNull();
  });
});
