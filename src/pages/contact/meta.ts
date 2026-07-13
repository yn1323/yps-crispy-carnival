import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildContactPageHead() {
  return {
    links: buildLinks({ canonical: "/contact" }),
    meta: buildMeta({
      title: "お問い合わせ｜シフトリ",
      description: "シフトリの利用開始、機能や使い方、不具合やトラブルについてのお問い合わせを受け付けています。",
      canonical: "/contact",
    }),
  };
}
