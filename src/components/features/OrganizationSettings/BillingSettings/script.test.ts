import { describe, expect, it } from "vitest";
import type { OrganizationBillingView } from "../types";
import {
  billingUnavailableMessage,
  formatBillingBoundaryDate,
  formatProPrice,
  resolveBillingPlanAction,
} from "./script";

const baseBilling: OrganizationBillingView = {
  state: "pro",
  currentPlan: "pro",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 30 },
  shopUsage: { current: 1, max: 5 },
  billingEmail: "billing@example.com",
  canManagePlan: true,
  canUpdatePaymentMethod: true,
  canUpdateBillingEmail: true,
  canScheduleFree: true,
};

describe("OrganizationSettings BillingSettings", () => {
  it.each([
    [{ state: "free", currentPlan: "free", canScheduleFree: false }, "startPro"],
    [{ state: "restricted", currentPlan: null, canScheduleFree: false }, "startPro"],
    [
      {
        state: "trial",
        currentPlan: "trial",
        hasTrialContinuation: false,
        canScheduleFree: false,
      },
      "startPro",
    ],
    [
      {
        state: "trial",
        currentPlan: "trial",
        hasTrialContinuation: true,
        canScheduleFree: false,
      },
      "cancelTrialContinuation",
    ],
    [{ state: "pro", currentPlan: "pro", canScheduleFree: true }, "scheduleFree"],
    [{ state: "scheduledFree", currentPlan: "pro", canScheduleFree: false }, "cancelScheduledFree"],
    [{ state: "grace", currentPlan: "pro", canScheduleFree: false }, "openPortal"],
  ] as const)("契約状態%oを操作%sへ対応付ける", (overrides, expected) => {
    expect(resolveBillingPlanAction({ ...baseBilling, ...overrides })).toBe(expected);
  });

  it("支払い不要Proは課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, isComplimentary: true })).toBeNull();
  });

  it("Stripe課金が未準備なら課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, stripeBillingAvailable: false })).toBeNull();
  });

  it("トライアル終了境界をJSTの請求開始日へ整形する", () => {
    expect(formatBillingBoundaryDate(Date.parse("2026-09-01T00:00:00+09:00"))).toBe("2026年9月1日");
  });

  it("Stripeの最小単位を通貨コード付きの料金と請求間隔へ整形する", () => {
    const yen = formatProPrice({
      currency: "jpy",
      unitAmount: 3000,
      interval: "month",
      intervalCount: 1,
    });
    const dollars = formatProPrice({
      currency: "usd",
      unitAmount: 1234,
      interval: "year",
      intervalCount: 2,
    });

    expect(yen.amount).toContain("JPY");
    expect(yen.amount).toContain("3,000");
    expect(yen.interval).toBe("1か月ごと");
    expect(dollars.amount).toContain("USD");
    expect(dollars.amount).toContain("12.34");
    expect(dollars.interval).toBe("2年ごと");
  });

  it("mode offと価格未設定を内部設定値を含まない案内へ変換する", () => {
    expect(billingUnavailableMessage("billing_off")).toEqual({
      title: "決済機能は現在停止中です",
      description: "再開までお待ちください。現在の利用状態は変わりません。",
      type: "info",
    });
    expect(billingUnavailableMessage("price_unavailable")).toEqual({
      title: "決済機能は準備中です",
      description: "料金または決済設定の確認が完了してから、もう一度お試しください。",
      type: "info",
    });
  });
});
