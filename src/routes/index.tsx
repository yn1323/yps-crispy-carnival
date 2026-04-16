import { useAuth } from "@clerk/clerk-react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { LandingPage } from "@/src/components/features/LandingPage";
import { faqs } from "@/src/components/features/LandingPage/faqs";
import { buildMeta, jsonLdMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      ...buildMeta({
        title: "シフトリ",
        description:
          "少人数のお店のシフト作成をもっとラクに リンクを送るだけで希望シフトを収集 スタッフのアカウント登録も不要 無料ではじめられるシフト管理ツール",
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

  // ビルド時 prerender 中は Clerk の初期化を待たず LP を描画する
  // (scripts/prerender.ts が addInitScript で window.__PRERENDER__ を注入する)
  if (typeof window !== "undefined" && (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__) {
    return <LandingPage />;
  }

  if (!isLoaded) return null;

  if (isSignedIn) {
    return <Navigate to="/dashboard" />;
  }

  return <LandingPage />;
}
