import { createLandingFaqPageJsonLd } from "@/src/components/features/FaqSite/landingFaqContent";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildHomePageHead() {
  return {
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEでシフト希望を集めるシフト管理｜シフトリ",
        description:
          "LINEやメールのリンクから、スタッフはアプリ登録なしでシフト希望を提出できます。\n最初の組織は支払い不要のBusinessで始まり、複数組織・複数店舗・複数管理者へ拡張できます。",
        canonical: "/",
      }),
      ...jsonLdMeta(createLandingFaqPageJsonLd()),
    ],
  };
}
