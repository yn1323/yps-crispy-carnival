import { createFileRoute } from "@tanstack/react-router";
import { AppShiftBoardPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/shifts_/$recruitmentId_/board")({
  head: () => buildAppPrototypePageHead("シフト表"),
  staticData: {
    appShell: {
      mode: "focused",
      title: "シフトを調整",
      backTo: "/app/shifts",
      backLabel: "シフト一覧へ戻る",
    },
  },
  component: AppShiftBoardPage,
});
