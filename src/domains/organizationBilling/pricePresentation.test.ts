import { describe, expect, it } from "vitest";
import { formatCurrencyAmount, formatPricePresentation, formatPricePresentationLine } from "./pricePresentation";

describe("pricePresentation", () => {
  it("JPYの月額料金を半角の円記号と税込表記へ整形する", () => {
    const price = {
      currency: "jpy",
      unitAmount: 3_000,
      interval: "month",
      intervalCount: 1,
      taxBehavior: "inclusive",
    } as const;

    expect(formatPricePresentation(price)).toEqual({
      amount: "¥3,000",
      interval: "1か月ごと",
      tax: "税込",
    });
    expect(formatPricePresentationLine(price)).toBe("¥3,000/1か月（税込）");
  });

  it("小数単位のある通貨と複数年周期、税別を整形する", () => {
    const price = {
      currency: "usd",
      unitAmount: 1_234,
      interval: "year",
      intervalCount: 2,
      taxBehavior: "exclusive",
    } as const;

    expect(formatPricePresentation(price)).toEqual({
      amount: expect.stringMatching(/USD.*12\.34/),
      interval: "2年ごと",
      tax: "税別",
    });
    expect(formatPricePresentationLine(price)).toMatch(/^USD.*12\.34\/2年（税別）$/);
  });

  it.each([
    ["day", "3日ごと"],
    ["week", "3週間ごと"],
    ["month", "3か月ごと"],
    ["year", "3年ごと"],
  ] as const)("%s周期を日本語の請求間隔へ整形する", (interval, expected) => {
    expect(
      formatPricePresentation({
        currency: "jpy",
        unitAmount: 0,
        interval,
        intervalCount: 3,
        taxBehavior: "inclusive",
      }).interval,
    ).toBe(expected);
  });

  it("Stripeの最小通貨単位だけを日本語の金額表示へ整形する", () => {
    expect(formatCurrencyAmount("jpy", 3_000)).toBe("¥3,000");
    expect(formatCurrencyAmount("usd", 1_234)).toMatch(/USD.*12\.34/);
  });
});
