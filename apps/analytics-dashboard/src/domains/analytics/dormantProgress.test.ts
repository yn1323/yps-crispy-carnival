import { describe, expect, it } from "vitest";
import type { ShopStageRowDto } from "@/api/analyticsTypes";
import {
  getAverageDaysSinceLastShift,
  getAverageLastSubmissionRate,
  getDaysSinceLastShift,
  getDaysSinceLastShiftCreated,
  getDormantDays,
  getDormantRows,
  getLastSubmissionRate,
  getShopLineLinkedRate,
} from "./dormantProgress";

const BASE_CREATED_AT = Date.UTC(2026, 6, 1);
const BASE_REFERENCE_AT = Date.UTC(2026, 6, 7, 14, 59, 59); // 2026-07-07 JST end

function shopStageRow(overrides: Partial<ShopStageRowDto> = {}): ShopStageRowDto {
  return {
    alerts: [],
    averageConfirmationLeadTimeMs: null,
    averageDeadlineToConfirmationDays: null,
    averageFirstSubmissionLeadTimeMs: null,
    averageRecruitmentOpenDays: null,
    computedAt: BASE_REFERENCE_AT,
    confirmedSubmissionRate: null,
    confirmedRecruitmentCount: 1,
    emailNotificationSentCount: null,
    firstRecruitmentCreatedAt: null,
    firstRecruitmentDeadline: null,
    hadActiveOrRetainedStage: true,
    hadRetainedStage: true,
    hasCurrentConfirmedShift: false,
    hasCurrentOrFutureConfirmedShift: false,
    hasFutureConfirmedShift: false,
    hasFutureOpenRecruitment: false,
    hasNotificationSent: true,
    hasSubmission: true,
    lastActivityAt: Date.UTC(2026, 5, 1),
    lastConfirmedRecruitmentLeadTimeMs: null,
    lastRecruitmentConfirmedAt: null,
    lastRecruitmentCreatedAt: null,
    lastRecruitmentSubmissionRate: null,
    lastShiftCreatedAt: Date.UTC(2026, 5, 1),
    lastShiftPeriodEnd: "2026-06-07",
    lastShiftPeriodStart: "2026-06-01",
    lastShiftSubmissionRate: null,
    lineLinkedStaffCount: 0,
    lineNotificationSentCount: null,
    notificationLineSentRate: null,
    onboardingStepLabel: null,
    openNotificationFailureCount: 0,
    openRecruitmentCount: 0,
    openRecruitmentSubmittedCount: null,
    planKey: "standard",
    postReminderSubmissionRate: null,
    recruitmentCount: 1,
    recruitmentCreatedLast30Days: null,
    reminderSentStaffRate: null,
    resubmissionRate: null,
    shiftTargetStaffCount: 0,
    shopCreatedAt: BASE_CREATED_AT,
    shopId: "shop1",
    shopName: "テスト店舗",
    staffCount: 0,
    stage: "retainedDormant",
    stageReferenceAt: BASE_REFERENCE_AT,
    stalledDays: 36,
    submittedRecruitmentCount: null,
    submissionRate: null,
    ...overrides,
  };
}

describe("dormantProgress", () => {
  it("休眠店舗を休眠日数の長い順に並べる", () => {
    const shorter = shopStageRow({ shopId: "short", stalledDays: 31 });
    const longer = shopStageRow({ shopId: "long", stalledDays: 48 });
    const sameDaysNewerShift = shopStageRow({
      lastShiftPeriodEnd: "2026-06-10",
      shopId: "same-new-shift",
      stalledDays: 31,
    });

    expect(
      getDormantRows({
        date: "2026-07-07",
        kind: "shopStages",
        rows: [shorter, shopStageRow({ shopId: "retained", stage: "retained" }), longer, sameDaysNewerShift],
        stageCounts: { activeTrial: 0, activeTrialDormant: 0, beforeStart: 0, retained: 1, retainedDormant: 3 },
        unclassifiedCount: 0,
      }).map((row) => row.shopId),
    ).toEqual(["long", "same-new-shift", "short"]);
  });

  it("休眠日数と最終シフトからの日数を算出する", () => {
    const row = shopStageRow();

    expect(getDormantDays(row)).toBe(36);
    expect(getDaysSinceLastShift(row)).toBe(30);
    expect(getDaysSinceLastShiftCreated(row)).toBe(36);
  });

  it("カードに使う平均値と行ごとの率を集計する", () => {
    const rows = [
      shopStageRow({
        lastShiftPeriodEnd: "2026-06-07",
        lastShiftSubmissionRate: 0.5,
      }),
      shopStageRow({
        lastRecruitmentSubmissionRate: 0.75,
        lastShiftPeriodEnd: "2026-06-17",
        lastShiftSubmissionRate: null,
      }),
      shopStageRow({ lastShiftPeriodEnd: null, lastShiftSubmissionRate: null }),
    ];

    expect(getAverageDaysSinceLastShift(rows)).toBe(25);
    expect(getAverageLastSubmissionRate(rows)).toBe(0.625);
    expect(getLastSubmissionRate(rows[1])).toBe(0.75);
    expect(getShopLineLinkedRate(shopStageRow({ lineLinkedStaffCount: 2, shiftTargetStaffCount: 5 }))).toBe(0.4);
    expect(getShopLineLinkedRate(shopStageRow({ shiftTargetStaffCount: 0 }))).toBeNull();
  });
});
