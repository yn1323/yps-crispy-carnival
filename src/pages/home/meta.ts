import { createLandingFaqPageJsonLd } from "@/src/components/features/FaqSite/landingFaqContent";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEでシフト希望を集めるシフト管理｜シフトリ",
        description:
          "LINEやメールのリンクから、スタッフはアプリ登録なしでシフト希望を提出できます。\n希望回収、未提出リマインド、確定共有、複数店舗・管理者の運用を2暦月トライアルで試せます。",
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
