import { createFileRoute } from "@tanstack/react-router";
import { landingFaqs } from "@/src/components/features/LandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";
import { FaqPage } from "@/src/pages/faq";

export const Route = createFileRoute("/faq")({
  head: () => ({
    links: buildLinks({ canonical: "/faq" }),
    meta: [
      ...buildMeta({
        title: "よくある質問｜シフトリの使い方と導入前の確認",
        description:
          "シフトリの導入前によくある質問をまとめました。LINEでのシフト提出、無料利用、スタッフのアプリ登録、メール通知、スマホ利用、自動リマインドについて確認できます。",
        canonical: "/faq",
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
  component: FaqPage,
});
