import { useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LandingPage } from "@/src/components/features/LandingPage";
import { faqs } from "@/src/components/features/LandingPage/faqs";
import { buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      // 採用案: メール一通でシフト集まる｜少人数のお店のシフト管理
      //   狙い: 「シフト 集める メール」「メール一通 シフト」「少人数 シフト管理」
      // 候補A: スタッフはアプリ登録不要｜飲食店向けシフト管理シフトリ（KAKERUと競合）
      // 候補B: シフトの希望はメールで集める｜少人数店向けシフト管理（自然だがやや弱い）
      ...buildMeta({
        title: "メール一通でシフト集まる｜少人数のお店のシフト管理",
        description:
          "メールで届くリンクから、スタッフがシフト希望を提出できます。アプリ登録もアカウント作成も不要。LINEやエクセルでのシフト管理に限界を感じている飲食店・カフェ・少人数店向けの無料ツールです。",
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
