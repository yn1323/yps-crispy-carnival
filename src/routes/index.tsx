import { createFileRoute } from "@tanstack/react-router";
import { newLandingFaqs } from "@/src/components/features/NewLandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";
import { HomePage } from "@/src/pages/home";

export const Route = createFileRoute("/")({
  head: () => ({
    links: buildLinks({ canonical: "/" }),
    meta: [
      ...buildMeta({
        title: "シフトリ｜LINEでシフト希望を集める無料シフト管理ツール",
        description:
          "LINEでスタッフにシフト希望を依頼し、提出状況の確認からシフト作成・確定共有まで進められます。アプリ不要で、小さなお店でもかんたんに始められるシフト管理ツールです。",
        canonical: "/",
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: newLandingFaqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    ],
  }),
  component: HomePage,
});
