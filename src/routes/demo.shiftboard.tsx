import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { DemoShiftBoardRoutePage } from "@/src/pages/demo-shift-board";

export const Route = createFileRoute("/demo/shiftboard")({
  head: () => ({
    links: buildLinks({ canonical: "/demo/shiftboard" }),
    meta: buildMeta({
      title: "勤務時間入力デモ",
      description:
        "スタッフの勤務時間をドラッグして追加、変更する操作をPCで試せるデモです。変更は保存されず、スタッフへシフトは送信されません。",
      canonical: "/demo/shiftboard",
    }),
  }),
  component: DemoShiftBoardRoutePage,
});
