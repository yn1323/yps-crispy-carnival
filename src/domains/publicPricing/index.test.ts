import { describe, expect, it } from "vitest";
import { formatPublicPlanPrice, formatPublicPlanPriceLine } from ".";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "./fixture";

describe("publicPricing", () => {
  it("公開用fixtureはProとBusinessの公開項目だけを完全一致で持つ", () => {
    expect(PUBLIC_PLAN_PRICE_FIXTURE).toEqual({
      pro: {
        currency: "jpy",
        unitAmount: 3_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
      business: {
        currency: "jpy",
        unitAmount: 6_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
    });
  });

  it("JPYの月額料金を半角の円記号と税込表記へ整形する", () => {
    expect(formatPublicPlanPrice(PUBLIC_PLAN_PRICE_FIXTURE.pro)).toEqual({
      amount: "¥3,000",
      interval: "1か月ごと",
      tax: "税込",
    });
    expect(formatPublicPlanPriceLine(PUBLIC_PLAN_PRICE_FIXTURE.pro)).toBe("¥3,000／1か月（税込）");
  });

  it("小数単位のある通貨と複数年周期、税別を整形する", () => {
    const price = {
      currency: "usd",
      unitAmount: 1_234,
      interval: "year",
      intervalCount: 2,
      taxBehavior: "exclusive",
    } as const;

    expect(formatPublicPlanPrice(price)).toEqual({
      amount: expect.stringMatching(/USD.*12\.34/),
      interval: "2年ごと",
      tax: "税別",
    });
    expect(formatPublicPlanPriceLine(price)).toMatch(/^USD.*12\.34／2年（税別）$/);
  });
});
