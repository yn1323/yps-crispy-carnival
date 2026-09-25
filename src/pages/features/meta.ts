import { PRODUCT_FEATURES_HREF } from "@/src/components/features/ProductFeatures/productFeatureRoutes";
import { buildLinks, buildMeta, jsonLdMeta, SITE_URL } from "@/src/lib/seo";

export function buildFeaturesPageHead() {
  return {
    links: buildLinks({ canonical: PRODUCT_FEATURES_HREF }),
    meta: [
      ...buildMeta({
        title: "機能一覧｜希望シフトの回収から確定シフトの共有まで",
        description:
          "シフトリでできることを紹介します。\nLINEやメールでの希望シフトの回収、未提出者への自動催促、PC・スマホでのシフト表作成、確定シフトの共有までを一つの流れで進められます。複数店舗や複数のシフト担当者にも対応しています。",
        canonical: PRODUCT_FEATURES_HREF,
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "シフトリ", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "機能一覧" },
        ],
      }),
    ],
  };
}
