/** 機能ページのURL。静的生成のscriptからも読むため、画像やReactを持たない。 */
export const PRODUCT_FEATURES_HREF = "/features";

export const PRODUCT_FEATURE_SLUGS = [
  "shift-request-collection",
  "submission-reminder",
  "shift-schedule",
  "shift-sharing",
  "multi-store",
] as const;

export type ProductFeatureSlug = (typeof PRODUCT_FEATURE_SLUGS)[number];

export function isProductFeatureSlug(value: string): value is ProductFeatureSlug {
  return (PRODUCT_FEATURE_SLUGS as readonly string[]).includes(value);
}

export function getProductFeatureHref(slug: ProductFeatureSlug): string {
  return `${PRODUCT_FEATURES_HREF}/${slug}`;
}
