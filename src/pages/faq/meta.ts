import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildFaqPageHead() {
  return {
    links: buildLinks({ canonical: "/faq" }),
    meta: [
      ...buildMeta({
        title: "よくある質問｜シフトリの使い方・料金・トラブル解決",
        description:
          "シフトリの導入、スタッフ登録、シフト募集・作成、LINE・メール通知、料金、よくあるトラブルへの対処をカテゴリ別に確認できます。",
        canonical: "/faq",
      }),
    ],
  };
}
