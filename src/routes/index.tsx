import { createFileRoute } from "@tanstack/react-router";
import { faqs } from "@/src/components/features/LandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";
import { HomePage } from "@/src/pages/home";

export const Route = createFileRoute("/")({
  head: () => ({
    links: buildLinks({ canonical: "/" }),
    meta: [
      // 採用案: シフトリ｜LINEで届くアプリ不要のシフト管理
      //   狙い: ブランド名を先頭に置き、検索結果やSNS共有で自然に見えるタイトルにする
      // 候補A: 少人数店向けシフト管理｜メールでシフト希望を回収（検索寄り）
      // 候補B: シフトリ｜少人数のお店のシフト管理（ブランド寄り）
      ...buildMeta({
        title: "シフトリ｜LINEで届くアプリ不要のかんたんシフト管理",
        description:
          "スタッフ登録なしでシフト希望を集められる少人数店舗向けのシフト管理ツールです。かんたん設定でLINE・メールで届くリンクから希望シフトを提出できます。",
        canonical: "/",
      }),
      ...jsonLdMeta({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }),
    ],
  }),
  component: HomePage,
});
