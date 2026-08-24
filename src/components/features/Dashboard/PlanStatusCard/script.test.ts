import { describe, expect, it } from "vitest";
import {
  buildPlanStatusCardData,
  formatJstDate,
  formatJstDateWithWeekday,
  getPlanStatusNextTimeBoundary,
  getPlanStatusTimerDelay,
  MAX_PLAN_STATUS_TIMER_DELAY_MS,
  remainingJstDays,
} from "./script";

const now = Date.parse("2026-08-10T03:00:00.000Z");
const trialEndsAt = Date.parse("2026-08-16T15:00:00.000Z");
const actions = { canManagePlan: true, canUpdatePaymentMethod: true };

describe("buildPlanStatusCardData", () => {
  it("未選択のトライアルを選択導線とJST基準の残日数へ変換する", () => {
    expect(buildPlanStatusCardData({ kind: "trial", trialEndsAt, ...actions }, now)).toEqual({
      kind: "trial",
      remainingDays: 7,
      trialEndsOnLabel: "8/16(日)",
      continuationPlanName: undefined,
      description:
        "未選択のまま終了するとFreeプランへ移行します。Freeプランの上限を超えている場合は、上限内に減らすまで業務操作が制限されます。",
      primaryAction: { action: "choosePlan", label: "プランを選ぶ" },
      showRemindLater: true,
    });
  });

  it("選択済みトライアルと操作権限がないトライアルを変更操作として見せない", () => {
    const selectedTrial = buildPlanStatusCardData(
      { kind: "trial", trialEndsAt, selectedPaidPlan: "business", ...actions },
      now,
    );
    expect(selectedTrial).toMatchObject({
      continuationPlanName: "Pro",
      description: "トライアル終了後はProプランへ移行します。",
      showRemindLater: false,
    });
    expect(selectedTrial).not.toHaveProperty("primaryAction");

    const readOnlyTrial = buildPlanStatusCardData(
      { kind: "trial", trialEndsAt, canManagePlan: false, canUpdatePaymentMethod: false },
      now,
    );
    expect(readOnlyTrial).toMatchObject({
      description:
        "未選択のまま終了するとFreeプランへ移行します。Freeプランの上限を超えている場合は、上限内に減らすまで業務操作が制限されます。",
      showRemindLater: false,
    });
    expect(readOnlyTrial).not.toHaveProperty("primaryAction");
  });

  it("Freeを操作権限に応じた表示へ変換する", () => {
    expect(buildPlanStatusCardData({ kind: "freePlan", ...actions })).toMatchObject({
      kind: "freePlan",
      primaryAction: { action: "choosePlan", label: "プランを選ぶ" },
    });
    expect(
      buildPlanStatusCardData({ kind: "freePlan", canManagePlan: false, canUpdatePaymentMethod: false }),
    ).not.toHaveProperty("primaryAction");
  });

  it("有料プランの次回更新日を反映する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paidPlan",
        plan: "pro",
        isComplimentary: false,
        currentPeriodEndsAt: Date.parse("2026-08-31T15:00:00.000Z"),
        ...actions,
      }),
    ).toEqual({
      kind: "paidPlan",
      planName: "Standard",
      badgeLabel: "利用中",
      description: undefined,
      nextEventLabel: "次回更新日：2026/9/1",
    });
  });

  it("支払い不要Proでは請求情報を表示しない", () => {
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
      planName: "Pro",
      badgeLabel: "支払い不要",
      description: "早期登録特典によりProプラン相当の機能をずっと無料で利用できます。",
      nextEventLabel: undefined,
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

  it("新しい期間末解約はFree変更ではなく解約予定とデータ保持を表示する", () => {
    expect(
      buildPlanStatusCardData({
        kind: "paidPlan",
        plan: "pro",
        isComplimentary: false,
        scheduledChange: {
          targetPlan: "free",
          effectiveAt: Date.parse("2026-08-31T15:00:00.000Z"),
          restrictAtPeriodEnd: true,
        },
        ...actions,
      }),
    ).toMatchObject({
      badgeLabel: "解約予定",
      description: "2026/9/1をもって解約します。解約後は契約制限中になります。データは削除されません。",
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
      targetPlanName: "Standard",
      description: "Standardプランへの変更結果を確認しています。確認中はFreeプランが適用されます。",
    });
    expect(
      buildPlanStatusCardData({
        kind: "paymentPending",
        currentPlan: null,
        targetPlan: "business",
        canManagePlan: false,
        canUpdatePaymentMethod: false,
      }),
    ).toMatchObject({ currentPlanName: undefined, targetPlanName: "Pro" });
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
      planName: "Standard",
      phase: "grace",
      recoveryDeadlineLabel: "支払い期限：2026/8/17",
      primaryAction: { action: "updatePaymentMethod", label: "支払い方法を更新する" },
    });
    const readOnlyIssue = buildPlanStatusCardData({
      kind: "paymentIssue",
      phase: "restricted",
      canManagePlan: false,
      canUpdatePaymentMethod: false,
    });
    expect(readOnlyIssue).toMatchObject({
      phase: "restricted",
      description: "データは削除されていません。StandardまたはProの契約は、契約を管理できる管理者が行えます。",
    });
    expect(readOnlyIssue).not.toHaveProperty("primaryAction");

    expect(
      buildPlanStatusCardData({
        kind: "paymentIssue",
        phase: "restricted",
        canManagePlan: true,
        canUpdatePaymentMethod: false,
      }),
    ).toMatchObject({
      description: "データは削除されていません。利用を再開するには、StandardまたはProを契約してください。",
      primaryAction: { action: "choosePlan", label: "プランを選んで再開する" },
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
      planName: "Standard",
      description: "契約を管理できる管理者に、利用状況または契約状態の確認を依頼してください。",
    });
  });
});

describe("JSTの日付表示", () => {
  it("UTCでは前日でもJSTの日付で表示する", () => {
    expect(formatJstDate(Date.parse("2026-08-16T15:00:00.000Z"))).toBe("2026/8/17");
  });

  it("JSTの日付を月日と曜日1文字で表示する", () => {
    expect(formatJstDateWithWeekday(Date.parse("2026-08-16T15:00:00.000Z"))).toBe("8/17(月)");
  });

  it("時刻差ではなくJSTの暦日差を残日数にする", () => {
    expect(remainingJstDays(Date.parse("2026-08-16T15:00:00.000Z"), Date.parse("2026-08-10T14:59:59.000Z"))).toBe(7);
    expect(remainingJstDays(Date.parse("2026-08-16T23:00:00.000Z"), Date.parse("2026-08-16T15:01:00.000Z"))).toBe(0);
  });

  it("トライアル終了境界でカードを非表示にする", () => {
    const source = { kind: "trial", trialEndsAt, ...actions } as const;
    expect(buildPlanStatusCardData(source, trialEndsAt - 1)).not.toBeNull();
    expect(buildPlanStatusCardData(source, trialEndsAt)).toBeNull();
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
