export const PUBLIC_PAID_PLANS = ["pro", "business"] as const;

export type PublicPaidPlan = (typeof PUBLIC_PAID_PLANS)[number];

export type PublicPlanPrice = Readonly<{
  currency: string;
  unitAmount: number;
  interval: "day" | "week" | "month" | "year";
  intervalCount: number;
  taxBehavior: "inclusive" | "exclusive";
}>;

export type PublicPlanPriceCatalog = Readonly<Record<PublicPaidPlan, PublicPlanPrice>>;

export type FormattedPublicPlanPrice = Readonly<{
  amount: string;
  interval: string;
  tax: string;
}>;

export function formatPublicPlanPrice(price: PublicPlanPrice): FormattedPublicPlanPrice {
  return {
    amount: formatCurrencyAmount(price.currency, price.unitAmount),
    interval: `${price.intervalCount}${intervalUnit(price.interval)}ごと`,
    tax: price.taxBehavior === "inclusive" ? "税込" : "税別",
  };
}

/** 特商法ページやLPで共通利用する、金額・請求単位・税区分を含む一行表示。 */
export function formatPublicPlanPriceLine(price: PublicPlanPrice): string {
  const formatted = formatPublicPlanPrice(price);
  return `${formatted.amount}／${billingUnit(price.interval, price.intervalCount)}（${formatted.tax}）`;
}

function formatCurrencyAmount(currencyValue: string, amountInMinorUnit: number): string {
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

function billingUnit(interval: PublicPlanPrice["interval"], intervalCount: number): string {
  return `${intervalCount}${intervalUnit(interval)}`;
}

function intervalUnit(interval: PublicPlanPrice["interval"]): string {
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
