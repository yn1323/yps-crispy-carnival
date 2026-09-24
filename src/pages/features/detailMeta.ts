import {
  createProductFeatureFaqPageJsonLd,
  getProductFeature,
} from "@/src/components/features/ProductFeatures/productFeatureContent";
import { PRODUCT_FEATURES_HREF } from "@/src/components/features/ProductFeatures/productFeatureRoutes";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildFeatureDetailPageHead(slug: string) {
  const feature = getProductFeature(slug);
  if (!feature) {
    return {
      meta: buildMeta({ title: "機能のページが見つかりません", noindex: true }),
    };
  }

  return {
    links: buildLinks({ canonical: feature.href }),
    meta: [
      ...buildMeta({
        title: feature.metaTitle,
        description: feature.metaDescription,
        canonical: feature.href,
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "シフトリ", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "機能一覧", item: `${SITE_URL}${PRODUCT_FEATURES_HREF}` },
          { "@type": "ListItem", position: 3, name: feature.name },
        ],
      }),
      ...jsonLdMeta(createProductFeatureFaqPageJsonLd(feature)),
    ],
  };
}
