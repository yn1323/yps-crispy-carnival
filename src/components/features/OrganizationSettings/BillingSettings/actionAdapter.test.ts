import { describe, expect, it } from "vitest";
import {
  asBillingAcceptedActionResult,
  asBillingUrlActionResult,
  toPlanPriceState,
  toProrationPreviewState,
} from "./actionAdapter";

describe("billing action adapter", () => {
  it("Stripe Priceを表示用の月額料金へ変換する", () => {
    expect(
      toPlanPriceState({
        status: "available",
        currency: "jpy",
        unitAmount: 12_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      }),
    ).toEqual({
      status: "available",
      value: {
        currency: "jpy",
        unitAmount: 12_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
    });
  });

  it("税区分が不明なPriceを契約確認へ渡さない", () => {
    expect(
      toPlanPriceState({
        status: "available",
        currency: "jpy",
        unitAmount: 12_000,
        interval: "month",
        intervalCount: 1,
      }),
    ).toEqual({ status: "error" });
  });

  it("料金のunknown shapeを表示可能として扱わない", () => {
    expect(toPlanPriceState({ status: "available", currency: "jpy", unitAmount: 12_000 })).toEqual({
      status: "error",
    });
  });

  it("日割り見積もりはproviderの金額とproration dateをそのまま保持する", () => {
    expect(
      toProrationPreviewState({
        status: "available",
        currency: "jpy",
        amountDue: 4_200,
        currentPeriodEnd: 1_800_000_000_000,
        prorationDate: 1_700_000_000_000,
      }),
    ).toEqual({
      status: "available",
      value: {
        currency: "jpy",
        amountDue: 4_200,
        currentPeriodEnd: 1_800_000_000_000,
        prorationDate: 1_700_000_000_000,
      },
    });
  });

  it("URL・受付結果は許可したstatusだけを通す", () => {
    expect(asBillingUrlActionResult({ status: "available", url: "https://billing.example.com" })).toEqual({
      status: "available",
      url: "https://billing.example.com",
    });
    expect(asBillingAcceptedActionResult({ status: "accepted" })).toEqual({ status: "accepted" });
    expect(asBillingUrlActionResult({ status: "redirect", url: "https://portal.example.com" })).toEqual({
      status: "available",
      url: "https://portal.example.com",
    });
    expect(asBillingUrlActionResult({ status: "available", url: 42 })).toBeNull();
    expect(asBillingAcceptedActionResult({ status: "completed" })).toBeNull();
  });

  it("provider unavailableを再試行可能な結果として保持する", () => {
    expect(toProrationPreviewState({ status: "unavailable", reason: "provider_unavailable" })).toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
    expect(asBillingUrlActionResult({ status: "unavailable", reason: "provider_unavailable" })).toEqual({
      status: "unavailable",
      reason: "provider_unavailable",
    });
  });
});
