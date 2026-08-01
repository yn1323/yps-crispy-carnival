import { buildLinks, buildMeta } from "@/src/lib/seo";

export function buildDemoShiftBoardPageHead() {
  return {
    links: buildLinks({ canonical: "/demo/shiftboard" }),
    meta: buildMeta({
      title: "勤務時間入力デモ",
      description:
        "スタッフの勤務時間をドラッグして追加、変更する操作をPCで試せるデモです。変更は保存されず、スタッフへシフトは送信されません。",
      canonical: "/demo/shiftboard",
    }),
  };
}
