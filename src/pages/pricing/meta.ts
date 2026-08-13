import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

const pricingBreadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "TOP", item: "https://shiftori.app/" },
    { "@type": "ListItem", position: 2, name: "料金・プラン" },
  ],
};

export function buildPricingPageHead() {
  return {
    links: buildLinks({ canonical: "/pricing" }),
    meta: [
      ...buildMeta({
        title: "料金・プラン｜2暦月トライアルとPro・Business",
        description:
          "シフトリは、新しい組織を作成日から2暦月のトライアルで利用できます。Pro・Businessの利用人数、店舗数、管理者数の上限と契約単位を確認できます。",
        canonical: "/pricing",
      }),
      ...jsonLdMeta(pricingBreadcrumbJsonLd),
    ],
  };
}
