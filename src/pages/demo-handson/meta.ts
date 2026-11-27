import { buildLinks, buildMeta } from "@/src/lib/seo";

// 入口のボタンを置くまでは、検索結果に出さない。
export function buildDemoSimplePageHead() {
  return {
    links: buildLinks({ canonical: "/demo/simple" }),
    meta: buildMeta({
      title: "シフトを作ってみよう！",
      description: "登録なしで、希望シフトを集め、シフトを作って確定するまでを、実際の画面で試せます。",
      canonical: "/demo/simple",
      noindex: true,
    }),
  };
}

export function buildDemoDetailPageHead() {
  return {
    links: buildLinks({ canonical: "/demo/detail" }),
    meta: buildMeta({
      title: "ポジションごとのシフトを作ってみよう！",
      description: "登録なしで、ポジションごとに勤務を入れ、自動作成でシフトを作るまでを、実際の画面で試せます。",
      canonical: "/demo/detail",
      noindex: true,
    }),
  };
}
