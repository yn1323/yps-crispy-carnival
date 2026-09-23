import { describe, expect, it } from "vitest";
import { formatPublicPlanStartingPrice } from ".";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "./fixture";

describe("publicPricing", () => {
  it("有料プランの最安料金を請求単位・金額・税区分の順で示す", () => {
    expect(formatPublicPlanStartingPrice(PUBLIC_PLAN_PRICE_FIXTURE)).toBe("1か月¥3,000(税込)から");
    expect(
      formatPublicPlanStartingPrice({
        standard: { ...PUBLIC_PLAN_PRICE_FIXTURE.standard, unitAmount: 5_000 },
        pro: { ...PUBLIC_PLAN_PRICE_FIXTURE.pro, unitAmount: 4_000 },
      }),
    ).toBe("1か月¥4,000(税込)から");
  });

  it("公開用fixtureはStandardとProの公開項目だけを完全一致で持つ", () => {
    expect(PUBLIC_PLAN_PRICE_FIXTURE).toEqual({
      standard: {
        currency: "jpy",
        unitAmount: 3_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
      pro: {
        currency: "jpy",
        unitAmount: 6_000,
        interval: "month",
        intervalCount: 1,
        taxBehavior: "inclusive",
      },
    });
  });
});
