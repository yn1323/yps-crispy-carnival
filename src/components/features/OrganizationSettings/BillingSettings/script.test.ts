import { describe, expect, it } from "vitest";
import type { BillingProductPlan, OrganizationBillingView } from "../types";
import {
  billingUnavailableMessage,
  formatBillingBoundaryDate,
  formatPlanPrice,
  getRequiredReductions,
  resolveBillingPlanAction,
} from "./script";

const baseBilling: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 20 },
  shopUsage: { current: 1, max: 5 },
  managerUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

describe("OrganizationSettings BillingSettings", () => {
  it.each([
    [{ state: "free", currentPlan: "free" }, "pro", "startPaidPlan"],
    [{ state: "free", currentPlan: "free" }, "business", "startPaidPlan"],
    [{ state: "trial", currentPlan: "trial" }, "business", "startPaidPlan"],
    [{ state: "pro", currentPlan: "pro" }, "business", "changePaidPlanNow"],
    [{ state: "pro", currentPlan: "pro" }, "free", "scheduleServiceStop"],
    [{ state: "business", currentPlan: "business" }, "pro", "schedulePlanChange"],
    [{ state: "business", currentPlan: "business" }, "free", "scheduleServiceStop"],
    [{ state: "scheduledChange", currentPlan: "business", targetPlan: "pro" }, "business", "cancelScheduledPlanChange"],
    [{ state: "grace", currentPlan: "business", canScheduleFree: false }, "business", "openPortal"],
  ] as const)("契約状態%oから%sへの操作を%sへ対応付ける", (overrides, targetPlan, expected) => {
    expect(
      resolveBillingPlanAction(
        { ...baseBilling, ...overrides } as OrganizationBillingView,
        targetPlan as BillingProductPlan,
      )?.kind,
    ).toBe(expected);
  });

  it("上限超過によるrestrictedでは別の課金操作を開始しない", () => {
    expect(
      resolveBillingPlanAction(
        { ...baseBilling, state: "restricted", currentPlan: null, limitPlan: "pro" },
        "business",
      ),
    ).toBeNull();
  });

  it("支払い不要Businessは課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, isComplimentary: true }, "free")).toBeNull();
  });

  it("Stripe課金が未準備なら課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, stripeBillingAvailable: false }, "business")).toBeNull();
  });

  it("トライアル終了境界をJSTの請求開始日へ整形する", () => {
    expect(formatBillingBoundaryDate(Date.parse("2026-09-01T00:00:00+09:00"))).toBe("2026年9月1日");
  });

  it("Stripeの最小単位を通貨記号付きの料金と請求間隔へ整形する", () => {
    const yen = formatPlanPrice({
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    });
    const dollars = formatPlanPrice({
      currency: "usd",
      unitAmount: 1234,
      interval: "year",
      intervalCount: 2,
      taxBehavior: "exclusive",
    });

    expect(yen.amount).toBe("¥3,000");
    expect(yen.interval).toBe("1か月ごと");
    expect(yen.tax).toBe("税込");
    expect(dollars.amount).toContain("USD");
    expect(dollars.amount).toContain("12.34");
    expect(dollars.interval).toBe("2年ごと");
    expect(dollars.tax).toBe("税別");
  });

  it("serverの削減数がなければ利用数と現在上限から安全側に導出する", () => {
    expect(
      getRequiredReductions({
        ...baseBilling,
        peopleUsage: { current: 21, max: 20 },
        shopUsage: { current: 5, max: 5 },
        managerUsage: { current: 6, max: 5 },
      }),
    ).toEqual({ people: 1, shops: 0, managers: 1 });
  });

  it("BusinessからProへの変更前は現在のBusiness上限ではなく変更先上限で削減数を出す", () => {
    expect(
      getRequiredReductions(
        {
          ...baseBilling,
          state: "business",
          currentPlan: "business",
          peopleUsage: { current: 21, max: 40 },
          requiredReductions: { people: 0, shops: 0, managers: 0 },
        },
        "pro",
      ),
    ).toEqual({ people: 1, shops: 0, managers: 0 });
  });

  it("価格未設定を内部設定値を含まない案内へ変換する", () => {
    expect(billingUnavailableMessage("price_unavailable")).toEqual({
      title: "決済機能は準備中です",
      description: "料金または決済設定の確認が完了してから、もう一度お試しください。",
      type: "info",
    });
  });
});
