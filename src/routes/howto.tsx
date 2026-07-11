import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { HowToPage } from "@/src/pages/howto";

export const Route = createFileRoute("/howto")({
  head: () => ({
    links: buildLinks({ canonical: "/howto" }),
    meta: buildMeta({
      title: "使い方・ヘルプ｜シフトリ",
      description: "シフトリの操作方法、通知の仕組み、困ったときの対処方法を確認できます。",
      canonical: "/howto",
    }),
  }),
  component: HowToPage,
});
