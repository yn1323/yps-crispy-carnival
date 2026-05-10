import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { FaqPage } from "@/src/pages/faq";

export const Route = createFileRoute("/faq")({
  head: () => ({
    links: buildLinks({ canonical: "/faq" }),
    meta: buildMeta({
      title: "よくある質問｜シフトリの使い方と導入前の確認",
      description:
        "シフトリの導入前によくある質問をまとめました。料金、登録なしデモ、スタッフのアカウント登録、LINE公式アカウントの準備、スマホ利用について確認できます。",
      canonical: "/faq",
    }),
  }),
  component: FaqPage,
});
