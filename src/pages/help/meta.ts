import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildHelpIndexPageHead() {
  return {
    links: buildLinks({ canonical: "/help" }),
    meta: buildMeta({
      title: "ヘルプ｜シフトリ",
      description: "シフトリの操作方法、よくある質問、通知やトラブルへの対処を検索できます。",
      canonical: "/help",
    }),
  };
}
