import { createLandingFaqPageJsonLd } from "@/src/components/features/FaqSite/landingFaqContent";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEでシフト希望を集めるシフト管理｜シフトリ",
        description:
          "LINEやメールのリンクから、スタッフはアプリ登録なしでシフト希望を提出できます。\n初回登録は1組織・1店舗・1管理者の支払い不要Businessで、支払い情報を登録せずに始められます。",
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
