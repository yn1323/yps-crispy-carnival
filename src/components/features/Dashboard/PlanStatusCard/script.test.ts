import { describe, expect, it } from "vitest";
import {
  buildPlanStatusCardData,
  formatCurrentSubscriptionPrice,
  formatJstDate,
  getPlanStatusNextTimeBoundary,
  getPlanStatusTimerDelay,
  MAX_PLAN_STATUS_TIMER_DELAY_MS,
  remainingJstDays,
  toCurrentSubscriptionPriceState,
} from "./script";

const now = Date.parse("2026-08-10T03:00:00.000Z");
const trialEndsAt = Date.parse("2026-08-16T15:00:00.000Z");
const actions = { canManagePlan: true, canUpdatePaymentMethod: true };

describe("buildPlanStatusCardData", () => {
  it("未選択のトライアルを選択導線とJST基準の残日数へ変換する", () => {
    expect(buildPlanStatusCardData({ kind: "trial", trialEndsAt, ...actions }, { status: "idle" }, now)).toEqual({
      kind: "trial",
      remainingDays: 7,
      trialEndsOnLabel: "2026/8/16",
      continuationPlanName: undefined,
      description: "継続して利用するには、プランの選択が必要です。",
      primaryAction: "choosePlan",
      primaryActionLabel: "プランを選ぶ",
      showRemindLater: true,
    });
  });

  it("選択済みトライアルと操作権限がないトライアルを変更操作として見せない", () => {
    expect(
      buildPlanStatusCardData(
        { kind: "trial", trialEndsAt, selectedPaidPlan: "business", ...actions },
        { status: "idle" },
        now,
      ),
    ).toMatchObject({
      continuationPlanName: "Business",
      description: "トライアル終了後はBusinessプランへ移行します。",
      primaryAction: "openPlanAndPayment",
      showRemindLater: false,
    });
    expect(
      buildPlanStatusCardData(
        { kind: "trial", trialEndsAt, canManagePlan: false, canUpdatePaymentMethod: false },
        { status: "idle" },
        now,
      ),
    ).toMatchObject({
      description: "プランの選択は、契約を管理できる管理者が行えます。",
      primaryAction: "openPlanAndPayment",
      showRemindLater: false,
    });
  });

  it("Freeを操作権限に応じた表示へ変換する", () => {
    expect(buildPlanStatusCardData({ kind: "freePlan", ...actions })).toMatchObject({
      kind: "freePlan",
      primaryAction: "choosePlan",
      primaryActionLabel: "プランを選ぶ",
    });
    expect(
      buildPlanStatusCardData({ kind: "freePlan", canManagePlan: false, canUpdatePaymentMethod: false }),
    ).toMatchObject({
      primaryAction: "openPlanAndPayment",
      primaryActionLabel: "プランと支払いを確認する",
    });
  });

  it("有料プランへ実契約価格と次回更新日を反映する", () => {
    expect(
      buildPlanStatusCardData(
        {
          kind: "paidPlan",
          plan: "pro",
          isComplimentary: false,
          currentPeriodEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
          ...actions,
        },
        {
          status: "available",
          value: {
            currency: "jpy",
            unitAmount: 1_480,
            interval: "month",
            intervalCount: 1,
            taxBehavior: "exclusive",
          },
        },
      ),
    ).toEqual({
      kind: "paidPlan",
      planName: "Pro",
      badgeLabel: "利用中",
      description: undefined,
      nextEventLabel: "次回更新日：2026/9/1",
      price: { status: "available", label: "月額 1,480円（税抜）" },
      primaryActionLabel: "プランと支払いへ",
    });
  });

  it("現在料金を取得できない理由と操作権限を局所表示へ変換する", () => {
    expect(
      buildPlanStatusCardData(
        { ...paidPlanSource(), canManagePlan: false },
        { status: "unavailable", reason: "not_allowed" },
      ),
    ).toMatchObject({
      price: {
        status: "unavailable",
        message: "現在の料金を表示する権限がありません。",
        canRetry: false,
      },
      primaryActionLabel: "プランと支払いを確認する",
    });
    expect(
      buildPlanStatusCardData(paidPlanSource(), { status: "unavailable", reason: "provider_unavailable" }),
    ).toMatchObject({
      price: { status: "unavailable", message: "現在の料金を取得できませんでした。", canRetry: true },
    });
  });

  it("支払い不要Businessでは請求情報を表示しない", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paidPlan",
        plan: "business",
        isComplimentary: true,
        currentPeriodEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toEqual({
      kind: "paidPlan",
      planName: "Business",
      badgeLabel: "支払い不要",
      description: "Businessプランの機能を料金なしで利用できます。",
      nextEventLabel: undefined,
      price: null,
      primaryActionLabel: "プランと支払いを確認する",
    });
  });

  it("変更予定では次回請求日と誤認させず変更先と適用日を表示する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paidPlan",
        plan: "business",
        isComplimentary: false,
        currentPeriodEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
        scheduledChange: { targetPlan: "free", effectiveAt: Date.parse("2026-08-31T15:00:00.000Z") },
        ...actions,
      }),
    ).toMatchObject({
      badgeLabel: "変更予定",
      description: "2026/9/1にFreeプランへ変更します。",
      nextEventLabel: undefined,
    });
  });

  it("支払い確認中を現在プランの有無に応じて説明する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paymentPending",
        currentPlan: "free",
        targetPlan: "pro",
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toMatchObject({
      kind: "paymentPending",
      currentPlanName: "Free",
      targetPlanName: "Pro",
      description: "Proプランへの変更結果を確認しています。確認中はFreeプランが適用されます。",
    });
    expect(
      buildPlanStatusCardData({
        kind: "paymentPending",
        currentPlan: null,
        targetPlan: "business",
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toMatchObject({ currentPlanName: undefined, targetPlanName: "Business" });
  });

  it("支払い問題をphase・支払い更新権限・期限に応じて変換する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paymentIssue",
        plan: "pro",
        phase: "grace",
        recoveryDeadlineAt: trialEndsAt,
        ...actions,
      }),
    ).toMatchObject({
      planName: "Pro",
      phase: "grace",
      recoveryDeadlineLabel: "支払い期限：2026/8/17",
      primaryAction: "updatePaymentMethod",
      showDetailsAction: true,
    });
    expect(
      buildPlanStatusCardData({
        kind: "paymentIssue",
        phase: "restricted",
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toMatchObject({
      phase: "restricted",
      primaryAction: "viewPaymentIssueDetails",
      showDetailsAction: false,
    });
  });

  it("契約制限中を表示プランと操作権限に応じて変換する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "restricted",
        displayPlan: "pro",
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toEqual({
      kind: "restricted",
      planName: "Pro",
      description: "契約を管理できる管理者に、利用状況または契約状態の確認を依頼してください。",
      primaryActionLabel: "プランと支払いを確認する",
    });
  });
});

function paidPlanSource() {
  return {
    kind: "paidPlan",
    plan: "pro",
    isComplimentary: false,
    ...actions,
  } as const;
}

describe("JSTの日付表示", () => {
  it("UTCでは前日でもJSTの日付で表示する", () => {
    expect(formatJstDate(Date.parse("2026-08-16T15:00:00.000Z"))).toBe("2026/8/17");
  });

  it("時刻差ではなくJSTの暦日差を残日数にする", () => {
    expect(remainingJstDays(Date.parse("2026-08-16T15:00:00.000Z"), Date.parse("2026-08-10T14:59:59.000Z"))).toBe(7);
    expect(remainingJstDays(Date.parse("2026-08-16T23:00:00.000Z"), Date.parse("2026-08-16T15:01:00.000Z"))).toBe(0);
  });

  it("トライアル終了境界でカードを非表示にする", () => {
    const source = { kind: "trial", trialEndsAt, ...actions } as const;
    expect(buildPlanStatusCardData(source, { status: "idle" }, trialEndsAt - 1)).not.toBeNull();
    expect(buildPlanStatusCardData(source, { status: "idle" }, trialEndsAt)).toBeNull();
  });

  it("JSTの日付境界とトライアル終了境界の早い方で再評価する", () => {
    const source = { kind: "trial", trialEndsAt, ...actions } as const;
    const beforeJstMidnight = Date.parse("2026-08-10T14:59:00.000Z");
    expect(getPlanStatusNextTimeBoundary(source, beforeJstMidnight)).toBe(Date.parse("2026-08-10T15:00:00.000Z"));
    expect(getPlanStatusNextTimeBoundary(source, trialEndsAt - 1)).toBe(trialEndsAt);
    expect(getPlanStatusNextTimeBoundary(source, trialEndsAt)).toBeNull();
  });

  it("timerの待機時間をブラウザ上限内に収める", () => {
    expect(getPlanStatusTimerDelay(MAX_PLAN_STATUS_TIMER_DELAY_MS + 1, 0)).toBe(MAX_PLAN_STATUS_TIMER_DELAY_MS);
    expect(getPlanStatusTimerDelay(99, 100)).toBe(0);
  });
});

describe("実契約価格", () => {
  it("期間と税込・税抜を含めて表示する", () => {
    expect(
      formatCurrentSubscriptionPrice({
        currency: "jpy",
        unitAmount: 1_480,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "exclusive",
      }),
    ).toBe("月額 1,480円（税抜）");
    expect(
      formatCurrentSubscriptionPrice({
        currency: "jpy",
        unitAmount: 12_000,
        interval: "year",
        intervalCount: 1,
        taxBehavior: "inclusive",
      }),
    ).toBe("年額 12,000円（税込）");
  });

  it("Action結果を防御的に表示状態へ変換する", () => {
    expect(
      toCurrentSubscriptionPriceState({
        status: "available",
        currency: "jpy",
        unitAmount: 1_480,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "exclusive",
      }),
    ).toEqual({
      status: "available",
      value: {
        currency: "jpy",
        unitAmount: 1_480,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "exclusive",
      },
    });
    expect(toCurrentSubscriptionPriceState({ status: "unavailable", reason: "not_allowed" })).toEqual({
      status: "unavailable",
      reason: "not_allowed",
    });
    expect(toCurrentSubscriptionPriceState({ status: "available", currency: "jpy" })).toEqual({ status: "error" });
  });
});
