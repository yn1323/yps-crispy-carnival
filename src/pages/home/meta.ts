import { createLandingFaqPageJsonLd } from "@/src/components/features/FaqSite/landingFaqContent";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEでシフト希望を集める無料シフト管理｜シフトリ",
        description:
          "LINEやメールのリンクからスタッフはアプリ登録なしでシフト希望を提出。自動集計・未提出リマインド・確定シフトの共有まで無料で使えます。",
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
