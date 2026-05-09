import { createFileRoute } from "@tanstack/react-router";
import { buildLinks, buildMeta } from "@/src/helpers/seo";
import { DemoShiftBoardRoutePage } from "@/src/pages/demo-shift-board";

export const Route = createFileRoute("/_unregistered/demo/shiftboard")({
  head: () => ({
    // 採用案: 登録なしで試せる無料デモ｜店長視点でシフト管理を体験
    //   狙い: 「シフト管理 デモ」「シフト管理 試す」「シフト管理 登録なし」
    // 候補A: 無料デモ｜店長視点で操作できるシフト管理サンドボックス（伝わりにくい）
    // 候補B: 資料請求なしで触れる｜飲食店向けシフト管理シフトリのデモ（差別化明確だが検索数小）
    links: buildLinks({ canonical: "/demo/shiftboard" }),
    meta: buildMeta({
      title: "登録なしで試せる無料デモ｜店長視点でシフト管理を体験",
      description:
        "シフトリの店長画面を会員登録なしで試せる無料デモです。希望の集約から確定通知までブラウザで2分で体験できます。資料請求も商談も不要、すぐ触れます。",
      canonical: "/demo/shiftboard",
    }),
  }),
  component: DemoShiftBoardRoutePage,
});
