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
          "シフトリの初回登録は、1組織・1店舗・1管理者の支払い不要Businessです。支払い情報を登録せずに始められる範囲を確認できます。",
        canonical: "/pricing",
      }),
      ...jsonLdMeta(pricingBreadcrumbJsonLd),
    ],
  };
}
