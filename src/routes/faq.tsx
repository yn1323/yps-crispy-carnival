import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { FaqPage } from "@/src/pages/faq";

export const Route = createFileRoute("/faq")({
  head: () => ({
    links: buildLinks({ canonical: "/faq" }),
    meta: buildMeta({
      title: "よくある質問｜シフトリの使い方と導入前の確認",
      description:
        "シフトリの導入前によくある質問をまとめました。LINEでのシフト提出、無料利用、スタッフのアプリ登録、メール通知、スマホ利用、自動リマインドについて確認できます。",
      canonical: "/faq",
    }),
  }),
  component: FaqPage,
});
