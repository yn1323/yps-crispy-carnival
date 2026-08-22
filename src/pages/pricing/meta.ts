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
        title: "料金・プラン｜支払い登録なしで始めるBusiness",
        description:
          "シフトリの最初の組織は支払い不要のBusiness、追加組織はFreeで始まります。複数店舗・複数管理者とPro・Businessの利用条件を確認できます。",
        canonical: "/pricing",
      }),
      ...jsonLdMeta(pricingBreadcrumbJsonLd),
    ],
  };
}
