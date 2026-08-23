import {
  formatPricePresentation,
  formatPricePresentationLine,
} from "../organizationBilling/pricePresentation";

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
  return formatPricePresentation(price);
}

/** 特商法ページやLPで共通利用する、金額・請求単位・税区分を含む一行表示。 */
export function formatPublicPlanPriceLine(price: PublicPlanPrice): string {
  return formatPricePresentationLine(price);
}
