import { createFileRoute } from "@tanstack/react-router";
import { landingFaqs } from "@/src/components/features/LandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";
import { HomePage } from "@/src/pages/home";

export const Route = createFileRoute("/")({
  head: () => ({
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "LINEでシフト希望を集める無料シフト管理｜シフトリ",
        description:
          "LINEやメールのリンクからスタッフはアプリ登録なしでシフト希望を提出。自動集計・未提出リマインド・確定シフトの共有まで無料。5〜30名の小規模店舗向けシフト管理ツール。",
        canonical: "/",
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: landingFaqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    ],
  }),
  component: HomePage,
});
