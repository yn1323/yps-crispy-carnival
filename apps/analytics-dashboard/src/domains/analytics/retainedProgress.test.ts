import { describe, expect, it } from "vitest";
import type { ShopStageRowDto } from "@/api/analyticsTypes";
import {
  getAverageDeadlineToConfirmationDays,
  getAverageMissingSubmissionRate,
  getAverageRecruitmentOpenDays,
  getAverageStaffCount,
  getLineLinkedRate,
  getMissingSubmissionRate,
  getNextShiftMissingCount,
  getReminderSentStaffRate,
  getRetainedRows,
  getShopLineLinkedRate,
} from "./retainedProgress";

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
    firstRecruitmentCreatedAt: null,
    firstRecruitmentDeadline: null,
    lastShiftCreatedAt: null,
    lastShiftPeriodEnd: null,
    lastShiftPeriodStart: null,
    lastShiftSubmissionRate: null,
    hadActiveOrRetainedStage: true,
    hadRetainedStage: true,
    hasCurrentConfirmedShift: true,
    hasCurrentOrFutureConfirmedShift: true,
    hasFutureConfirmedShift: true,
    hasFutureOpenRecruitment: false,
    hasNotificationSent: true,
    hasSubmission: true,
    lastActivityAt: BASE_REFERENCE_AT,
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
    stage: "retained",
    stageReferenceAt: BASE_REFERENCE_AT,
    stalledDays: null,
    submittedRecruitmentCount: null,
    submissionRate: null,
    ...overrides,
  };
}

describe("retainedProgress", () => {
  it("運用中店舗を最終確定日の新しい順に並べ、同日の場合は登録日の新しい順にする", () => {
    const olderConfirmed = shopStageRow({ lastRecruitmentConfirmedAt: BASE_CREATED_AT + 1000, shopId: "old" });
    const newerConfirmed = shopStageRow({ lastRecruitmentConfirmedAt: BASE_CREATED_AT + 2000, shopId: "new" });
    const sameConfirmedNewerShop = shopStageRow({
      lastRecruitmentConfirmedAt: BASE_CREATED_AT + 1000,
      shopCreatedAt: BASE_CREATED_AT + 3000,
      shopId: "same-new-shop",
    });

    expect(
      getRetainedRows({
        date: "2026-07-04",
        kind: "shopStages",
        rows: [
          olderConfirmed,
          shopStageRow({ shopId: "active", stage: "activeTrial" }),
          newerConfirmed,
          sameConfirmedNewerShop,
        ],
        stageCounts: { activeTrial: 1, activeTrialDormant: 0, beforeStart: 0, retained: 3, retainedDormant: 0 },
        unclassifiedCount: 0,
      }).map((row) => row.shopId),
    ).toEqual(["new", "same-new-shop", "old"]);
  });

  it("カードに使う平均値と率を集計する", () => {
    const rows = [
      shopStageRow({
        averageDeadlineToConfirmationDays: 2,
        averageRecruitmentOpenDays: 8,
        lineLinkedStaffCount: 3,
        reminderSentStaffRate: 0.25,
        shiftTargetStaffCount: 4,
        staffCount: 6,
        confirmedSubmissionRate: 0.75,
        submissionRate: 0.25,
      }),
      shopStageRow({
        averageDeadlineToConfirmationDays: 4,
        averageRecruitmentOpenDays: 10,
        lineLinkedStaffCount: 1,
        reminderSentStaffRate: 0.5,
        shiftTargetStaffCount: 2,
        staffCount: 8,
        confirmedSubmissionRate: 0.5,
        submissionRate: 0,
      }),
      shopStageRow({ staffCount: 10 }),
    ];

    expect(getAverageStaffCount(rows)).toBe(8);
    expect(getLineLinkedRate(rows)).toBeCloseTo(4 / 6);
    expect(getReminderSentStaffRate(rows)).toBeCloseTo(1 / 3);
    expect(getAverageMissingSubmissionRate(rows)).toBe(0.375);
    expect(getAverageRecruitmentOpenDays(rows)).toBe(9);
    expect(getAverageDeadlineToConfirmationDays(rows)).toBe(3);
  });

  it("未来の募集または確定がない運用中店舗を次回シフト未作成として数える", () => {
    const rows = [
      shopStageRow({ hasFutureConfirmedShift: false, hasFutureOpenRecruitment: false }),
      shopStageRow({ hasFutureConfirmedShift: true, hasFutureOpenRecruitment: false }),
      shopStageRow({ hasFutureConfirmedShift: false, hasFutureOpenRecruitment: true }),
    ];

    expect(getNextShiftMissingCount(rows)).toBe(1);
  });

  it("行ごとのLINE連携率と確定シフトに対する未提出率を算出する", () => {
    const row = shopStageRow({
      confirmedSubmissionRate: 0.8,
      lineLinkedStaffCount: 2,
      shiftTargetStaffCount: 5,
      submissionRate: 0.2,
    });

    expect(getShopLineLinkedRate(row)).toBe(0.4);
    expect(getMissingSubmissionRate(row)).toBeCloseTo(0.2);
    expect(getShopLineLinkedRate(shopStageRow({ shiftTargetStaffCount: 0 }))).toBeNull();
    expect(getMissingSubmissionRate(shopStageRow({ confirmedSubmissionRate: null, submissionRate: 1 }))).toBeNull();
  });
});
