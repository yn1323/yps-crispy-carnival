import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildDemoFlowPageHead() {
  return {
    links: buildLinks({ canonical: "/demo/flow" }),
    meta: buildMeta({
      title: "ログインなしで試せるシフト管理デモ｜募集から確定通知まで",
      description:
        "シフトリのシフト管理フローを、ログインなしで体験できる無料デモです。\nシフト募集、スタッフによる希望シフトの提出、シフト調整、確定通知までをブラウザで試せます。",
      canonical: "/demo/flow",
    }),
  };
}
