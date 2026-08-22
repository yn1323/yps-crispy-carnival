import type { PublicPlanPriceCatalog } from "@/src/domains/publicPricing";

/** Build時に検証され、公開可能な項目だけへ正規化された料金snapshot。 */
export const publicPlanPrices: PublicPlanPriceCatalog = __PUBLIC_PLAN_PRICES__;
