import {
  formatBillingUnit,
  formatPricePresentation,
  formatPricePresentationLine,
} from "../organizationBilling/pricePresentation";

export const PUBLIC_PAID_PLANS = ["standard", "pro"] as const;

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
  return formatPricePresentation(price);
}

/** 特商法ページやLPで共通利用する、金額・請求単位・税区分を含む一行表示。 */
export function formatPublicPlanPriceLine(price: PublicPlanPrice): string {
  return formatPricePresentationLine(price);
}

/**
 * 有料プランのうち最も安い料金を「1か月¥1,880(税込)から」の形で返す。
 * Build時にStandard・Proの通貨と請求周期の一致を検証しているため、金額だけで比較する。
 */
export function formatPublicPlanStartingPrice(prices: PublicPlanPriceCatalog): string {
  const lowest = PUBLIC_PAID_PLANS.map((plan) => prices[plan]).reduce((min, price) =>
    price.unitAmount < min.unitAmount ? price : min,
  );
  const formatted = formatPublicPlanPrice(lowest);
  return `${formatBillingUnit(lowest.interval, lowest.intervalCount)}${formatted.amount}(${formatted.tax})から`;
}
