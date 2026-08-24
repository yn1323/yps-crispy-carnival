import type { PublicPlanPriceCatalog } from ".";

/** Storybookとtestで外部サービスへ接続せず表示契約を確認するための決定的な料金。 */
export const PUBLIC_PLAN_PRICE_FIXTURE: PublicPlanPriceCatalog = Object.freeze({
  standard: Object.freeze({
    currency: "jpy",
    unitAmount: 3_000,
    interval: "month",
    intervalCount: 1,
    taxBehavior: "inclusive",
  }),
  pro: Object.freeze({
    currency: "jpy",
    unitAmount: 6_000,
    interval: "month",
    intervalCount: 1,
    taxBehavior: "inclusive",
  }),
});
