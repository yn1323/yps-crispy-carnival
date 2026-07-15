import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildHowToPageHead() {
  return {
    links: buildLinks({ canonical: "/howto" }),
    meta: buildMeta({
      title: "使い方・ヘルプ｜シフトリ",
      description: "シフトリの操作方法、通知の仕組み、困ったときの対処方法を確認できます。",
      canonical: "/howto",
    }),
  };
}
