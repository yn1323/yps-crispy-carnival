import { createLandingFaqPageJsonLd } from "@/src/components/features/HelpCenter/helpMeta";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEで希望シフトを集めるシフト管理｜シフトリ",
        description:
          "LINEやメールのリンクから、スタッフはアプリ登録なしで希望シフトを提出できます。\n複数店舗・複数担当者に対応し、2か月無料・クレジットカード登録不要で始められます。",
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
