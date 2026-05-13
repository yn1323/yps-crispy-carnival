import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { DemoFlowRoutePage } from "@/src/pages/demo-flow";

export const Route = createFileRoute("/_unregistered/demo/flow")({
  head: () => ({
    links: buildLinks({ canonical: "/demo/flow" }),
    meta: buildMeta({
      title: "ログインなしで試せるシフト管理デモ｜募集から確定通知まで",
      description:
        "シフトリのシフト管理フローをログインなしで体験できる無料デモです。募集作成、スタッフの希望提出、シフト調整、確定通知までをブラウザで試せます。",
      canonical: "/demo/flow",
    }),
  }),
  component: DemoFlowRoutePage,
});
