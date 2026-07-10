import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { ContactPage } from "@/src/pages/contact";

export const Route = createFileRoute("/contact")({
  head: () => ({
    links: buildLinks({ canonical: "/contact" }),
    meta: buildMeta({
      title: "お問い合わせ｜シフトリ",
      description: "シフトリの利用開始、機能や使い方、不具合やトラブルについてのお問い合わせを受け付けています。",
      canonical: "/contact",
    }),
  }),
  component: ContactPage,
});
