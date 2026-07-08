import { describe, expect, it } from "vitest";
import type { ShopStageRowDto } from "@/api/analyticsTypes";
import {
  getActiveTrialRows,
  getAverageSubmissionRate,
  getFirstConfirmedShopCount,
  getFirstConfirmedShopNames,
  getFirstRecruitmentDurationDays,
  getLineLinkedRate,
  getNotificationFailureShopCount,
} from "./activeTrialProgress";

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
    firstRecruitmentCreatedAt: Date.UTC(2026, 6, 1, 1),
    firstRecruitmentDeadline: "2026-07-05",
    lastShiftCreatedAt: null,
    lastShiftPeriodEnd: null,
    lastShiftPeriodStart: null,
    lastShiftSubmissionRate: null,
    hadActiveOrRetainedStage: false,
    hadRetainedStage: false,
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
    openRecruitmentSubmittedCount: null,
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
    stage: "activeTrial",
    stageReferenceAt: BASE_REFERENCE_AT,
    stalledDays: null,
    submittedRecruitmentCount: null,
    submissionRate: null,
    ...overrides,
  };
}

describe("activeTrialProgress", () => {
  it("立ち上げ店舗を登録日の新しい順に並べる", () => {
    const older = shopStageRow({ shopCreatedAt: BASE_CREATED_AT, shopId: "old" });
    const newer = shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 1000, shopId: "new" });
    const unknownCreatedAt = shopStageRow({ shopCreatedAt: null, shopId: "unknown" });

    expect(
      getActiveTrialRows({
        date: "2026-07-04",
        kind: "shopStages",
        rows: [older, shopStageRow({ shopId: "before", stage: "beforeStart" }), unknownCreatedAt, newer],
        stageCounts: { activeTrial: 3, activeTrialDormant: 0, beforeStart: 1, retained: 0, retainedDormant: 0 },
        unclassifiedCount: 0,
      }).map((row) => row.shopId),
    ).toEqual(["new", "old", "unknown"]);
  });

  it("提出率平均、LINE連携率、通知失敗店舗数、初回確定済み店舗数を集計する", () => {
    const rows = [
      shopStageRow({
        confirmedRecruitmentCount: 1,
        lineLinkedStaffCount: 1,
        openNotificationFailureCount: 2,
        shiftTargetStaffCount: 2,
        shopName: "TeamA&A",
        submissionRate: 0.5,
      }),
      shopStageRow({
        confirmedRecruitmentCount: 0,
        lineLinkedStaffCount: 2,
        openNotificationFailureCount: 0,
        shiftTargetStaffCount: 4,
        submissionRate: 1,
      }),
      shopStageRow({
        confirmedRecruitmentCount: 2,
        openNotificationFailureCount: null,
        shopName: "こども食堂せかい",
        submissionRate: null,
      }),
      shopStageRow({ confirmedRecruitmentCount: null, shopName: "未確定店舗" }),
    ];

    expect(getAverageSubmissionRate(rows)).toBe(0.75);
    expect(getLineLinkedRate(rows)).toBe(0.5);
    expect(getLineLinkedRate([shopStageRow({ lineLinkedStaffCount: 0, shiftTargetStaffCount: 0 })])).toBeNull();
    expect(getNotificationFailureShopCount(rows)).toBe(1);
    expect(getFirstConfirmedShopCount(rows)).toBe(2);
    expect(getFirstConfirmedShopNames(rows)).toEqual(["TeamA&A", "こども食堂せかい"]);
  });

  it("初回募集の開始日から締切日までの期間日数を算出する", () => {
    expect(getFirstRecruitmentDurationDays(shopStageRow())).toBe(5);
    expect(getFirstRecruitmentDurationDays(shopStageRow({ firstRecruitmentCreatedAt: null }))).toBeNull();
    expect(getFirstRecruitmentDurationDays(shopStageRow({ firstRecruitmentDeadline: null }))).toBeNull();
  });
});
