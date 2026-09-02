export type PricePresentationInput = Readonly<{
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  taxBehavior: "inclusive" | "exclusive";
}>;

export type PricePresentation = Readonly<{
  amount: string;
  interval: string;
  tax: string;
}>;

export function formatPricePresentation(price: PricePresentationInput): PricePresentation {
  return {
    amount: formatCurrencyAmount(price.currency, price.unitAmount),
    interval: `${formatBillingUnit(price.interval, price.intervalCount)}ごと`,
    tax: price.taxBehavior === "inclusive" ? "税込" : "税別",
  };
}

export function formatPricePresentationLine(price: PricePresentationInput): string {
  const formatted = formatPricePresentation(price);
  return `${formatted.amount}(${formatted.tax}) / ${formatBillingUnit(price.interval, price.intervalCount)}`;
}

export function formatCurrencyAmount(currencyValue: string, amountInMinorUnit: number): string {
  const currency = currencyValue.toUpperCase();
  const formatter = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    currencyDisplay: currency === "JPY" ? "symbol" : "code",
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const formatted = formatter.format(amountInMinorUnit / 10 ** fractionDigits);
  return currency === "JPY" ? formatted.replace("￥", "¥") : formatted;
}

function formatBillingUnit(interval: PricePresentationInput["interval"], intervalCount: number): string {
  return `${intervalCount}${intervalUnit(interval)}`;
}

function intervalUnit(interval: PricePresentationInput["interval"]): string {
  switch (interval) {
    case "day":
      return "日";
    case "week":
      return "週間";
    case "month":
      return "か月";
    case "year":
      return "年";
  }
}
