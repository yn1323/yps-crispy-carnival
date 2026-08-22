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
        title: "料金・プラン｜2か月無料・カード登録不要",
        description:
          "シフトリは2か月無料・クレジットカード登録不要で始められます。無料トライアル、複数店舗・複数管理者、Free・Pro・Businessの利用条件を確認できます。",
        canonical: "/pricing",
      }),
      ...jsonLdMeta(pricingBreadcrumbJsonLd),
    ],
  };
}
