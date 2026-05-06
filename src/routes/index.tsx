import { useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LandingPage } from "@/src/components/features/LandingPage";
import { faqs } from "@/src/components/features/LandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    links: buildLinks({ canonical: "/" }),
    meta: [
      // 採用案: シフトリ｜LINEで届くアプリ不要のシフト管理
      //   狙い: ブランド名を先頭に置き、検索結果やSNS共有で自然に見えるタイトルにする
      // 候補A: 少人数店向けシフト管理｜メールでシフト希望を回収（検索寄り）
      // 候補B: シフトリ｜少人数のお店のシフト管理（ブランド寄り）
      ...buildMeta({
        title: "シフトリ｜LINEで届くアプリ不要のシフト管理",
        description:
          "シフトリは、スタッフ登録なしでシフト希望を集められる少人数店向けのシフト管理ツールです。LINEやメールで届くリンクから提出でき、エクセル管理をラクにします。",
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
  component: IndexPage,
});

function IndexPage() {
  const { isSignedIn, isLoaded } = useAuth();

  // Clerk のロード完了を待たず LP を返す。
  // - prerender 時も、初回 hydrate 時も、同じ <LandingPage /> を返すので hydration mismatch しない
  // - ログイン済み判定が取れた瞬間にだけ /dashboard へリダイレクト
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" />;
  }

  return <LandingPage />;
}
