import { createFaqPageJsonLd } from "@/src/components/features/LandingPage/faqs";
import { buildLinks, buildMeta, jsonLdMeta } from "@/src/lib/seo";

export function buildFaqPageHead() {
  return {
    links: buildLinks({ canonical: "/faq" }),
    meta: [
      ...buildMeta({
        title: "よくある質問｜シフトリの使い方と導入前の確認",
        description:
          "シフトリの導入前によくある質問をまとめました。LINEでのシフト提出、無料利用、スタッフのアプリ登録、メール通知、スマホ利用、自動リマインドについて確認できます。",
        canonical: "/faq",
      }),
      ...jsonLdMeta(createFaqPageJsonLd()),
    ],
  };
}
