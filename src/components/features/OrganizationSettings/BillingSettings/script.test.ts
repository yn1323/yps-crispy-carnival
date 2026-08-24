import { describe, expect, it } from "vitest";
import type { BillingProductPlan, OrganizationBillingView } from "../types";
import {
  billingUnavailableMessage,
  formatBillingBoundaryDate,
  formatTrialBillingDates,
  getRequiredReductions,
  resolveBillingPlanAction,
} from "./script";

const baseBilling: OrganizationBillingView = {
  state: "standard",
  currentPlan: "standard",
  isComplimentary: false,
  hasTrialContinuation: false,
  stripeBillingAvailable: true,
  hasStripeCustomer: true,
  peopleUsage: { current: 4, max: 25 },
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
    [{ state: "free", currentPlan: "free" }, "standard", "startPaidPlan"],
    [{ state: "free", currentPlan: "free" }, "pro", "startPaidPlan"],
    [{ state: "trial", currentPlan: "trial" }, "pro", "startPaidPlan"],
    [{ state: "standard", currentPlan: "standard" }, "pro", "changePaidPlanNow"],
    [{ state: "standard", currentPlan: "standard" }, "free", "scheduleServiceStop"],
    [{ state: "pro", currentPlan: "pro" }, "standard", "schedulePlanChange"],
    [{ state: "pro", currentPlan: "pro" }, "free", "scheduleServiceStop"],
    [{ state: "scheduledChange", currentPlan: "pro", targetPlan: "standard" }, "pro", "cancelScheduledPlanChange"],
    [{ state: "grace", currentPlan: "pro", canScheduleFree: false }, "pro", "openPortal"],
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
        { ...baseBilling, state: "restricted", currentPlan: null, limitPlan: "standard" },
        "pro",
      ),
    ).toBeNull();
  });

  it("支払い不要Proは課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, isComplimentary: true }, "free")).toBeNull();
  });

  it("Stripe課金が未準備なら課金操作を返さない", () => {
    expect(resolveBillingPlanAction({ ...baseBilling, stripeBillingAvailable: false }, "pro")).toBeNull();
  });

  it("トライアル終了境界をJSTの請求開始日へ整形する", () => {
    expect(formatBillingBoundaryDate(Date.parse("2026-09-01T00:00:00+09:00"))).toBe("2026年9月1日");
    expect(formatTrialBillingDates(Date.parse("2026-09-01T00:00:00+09:00"))).toEqual({
      trialEndsOn: "2026年8月31日",
      billingStartsOn: "2026年9月1日",
    });
  });

  it("serverの削減数がなければ利用数と現在上限から安全側に導出する", () => {
    expect(
      getRequiredReductions({
        ...baseBilling,
        peopleUsage: { current: 26, max: 25 },
        shopUsage: { current: 5, max: 5 },
        managerUsage: { current: 6, max: 5 },
      }),
    ).toEqual({ people: 1, shops: 0, managers: 1 });
  });

  it("ProからStandardへの変更前は現在のPro上限ではなく変更先上限で削減数を出す", () => {
    expect(
      getRequiredReductions(
        {
          ...baseBilling,
          state: "pro",
          currentPlan: "pro",
          peopleUsage: { current: 26, max: 50 },
          requiredReductions: { people: 0, shops: 0, managers: 0 },
        },
        "standard",
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
