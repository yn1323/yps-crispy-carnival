import { describe, expect, it } from "vitest";
import { PUBLIC_PLAN_PRICE_FIXTURE } from "./fixture";

describe("publicPricing", () => {
  it("公開用fixtureはStandardとProの公開項目だけを完全一致で持つ", () => {
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
});
