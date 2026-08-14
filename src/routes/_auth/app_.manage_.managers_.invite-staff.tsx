import { createFileRoute } from "@tanstack/react-router";
import { AppManageInviteStaffPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/managers_/invite-staff")({
  head: () => buildAppPrototypePageHead("既存スタッフを管理者として招待"),
  staticData: {
    appShell: {
      mode: "focused",
      title: "既存スタッフを招待",
      backTo: "/app/manage/managers",
      backLabel: "管理者と権限へ戻る",
    },
  },
  component: AppManageInviteStaffPage,
});
