import { describe, expect, it } from "vitest";
import type { ShopStageRowDto } from "@/api/analyticsTypes";
import { filterShopRows, getShopLineLinkedRate, getShopListRows, getShopStageLabel, sortShopRows } from "./shopList";

const BASE_CREATED_AT = Date.UTC(2026, 6, 1);

function shopStageRow(overrides: Partial<ShopStageRowDto> = {}): ShopStageRowDto {
  return {
    alerts: [],
    averageConfirmationLeadTimeMs: null,
    averageDeadlineToConfirmationDays: null,
    averageFirstSubmissionLeadTimeMs: null,
    averageRecruitmentOpenDays: null,
    computedAt: BASE_CREATED_AT,
    confirmedSubmissionRate: null,
    confirmedRecruitmentCount: 0,
    emailNotificationSentCount: null,
    firstRecruitmentCreatedAt: null,
    firstRecruitmentDeadline: null,
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
    lastShiftCreatedAt: null,
    lastShiftPeriodEnd: null,
    lastShiftPeriodStart: null,
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
    stageReferenceAt: BASE_CREATED_AT,
    stalledDays: null,
    submittedRecruitmentCount: null,
    submissionRate: null,
    ...overrides,
  };
}

describe("shopList", () => {
  it("ステージフィルターは選択したステージのOR条件で絞り込む", () => {
    const rows = [
      shopStageRow({ shopId: "before", stage: "beforeStart" }),
      shopStageRow({ shopId: "activation", stage: "activeTrial" }),
      shopStageRow({ shopId: "retained", stage: "retained" }),
      shopStageRow({ shopId: "dormant", stage: "retainedDormant" }),
      shopStageRow({ shopId: "unclassified", stage: null }),
    ];

    expect(filterShopRows(rows, ["beforeStart", "dormant"]).map((row) => row.shopId)).toEqual(["before", "dormant"]);
    expect(filterShopRows(rows, []).map((row) => row.shopId)).toEqual([]);
  });

  it("登録日時の新しい順を初期ソートとして使える", () => {
    const stages = {
      date: "2026-07-08",
      kind: "shopStages" as const,
      rows: [
        shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 1, shopId: "old" }),
        shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 3, shopId: "new" }),
        shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 2, shopId: "middle" }),
      ],
      stageCounts: { activeTrial: 0, activeTrialDormant: 0, beforeStart: 3, retained: 0, retainedDormant: 0 },
      unclassifiedCount: 0,
    };

    expect(
      getShopListRows(stages, ["beforeStart"], { direction: "desc", key: "registeredAt" }).map((row) => row.shopId),
    ).toEqual(["new", "middle", "old"]);
  });

  it("LINE連携率でソートし、分母がない店舗は末尾に置く", () => {
    const rows = [
      shopStageRow({ lineLinkedStaffCount: 1, shiftTargetStaffCount: 2, shopId: "half" }),
      shopStageRow({ lineLinkedStaffCount: 4, shiftTargetStaffCount: 4, shopId: "full" }),
      shopStageRow({ lineLinkedStaffCount: 0, shiftTargetStaffCount: 0, shopId: "none" }),
    ];

    expect(sortShopRows(rows, { direction: "desc", key: "lineLinkedRate" }).map((row) => row.shopId)).toEqual([
      "full",
      "half",
      "none",
    ]);
  });

  it("ソート値が同じ場合は登録日時の新しい順にし、登録日時なしは末尾に置く", () => {
    const rows = [
      shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 1, shopId: "old", staffCount: 1 }),
      shopStageRow({ shopCreatedAt: null, shopId: "unknown", staffCount: 1 }),
      shopStageRow({ shopCreatedAt: BASE_CREATED_AT + 2, shopId: "new", staffCount: 1 }),
    ];

    expect(sortShopRows(rows, { direction: "desc", key: "staffCount" }).map((row) => row.shopId)).toEqual([
      "new",
      "old",
      "unknown",
    ]);
  });

  it("表示用のステージ名とLINE連携率を返す", () => {
    expect(getShopStageLabel("retained")).toBe("運用中");
    expect(getShopStageLabel("retainedDormant")).toBe("休眠");
    expect(getShopStageLabel(null)).toBe("未分類");
    expect(getShopLineLinkedRate(shopStageRow({ lineLinkedStaffCount: 3, shiftTargetStaffCount: 4 }))).toBe(0.75);
    expect(getShopLineLinkedRate(shopStageRow({ shiftTargetStaffCount: 0 }))).toBeNull();
  });
});
