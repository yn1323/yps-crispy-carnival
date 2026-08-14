import { createFileRoute } from "@tanstack/react-router";
import { AppManageInviteNewPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/managers_/invite-new")({
  head: () => buildAppPrototypePageHead("新しい管理者を招待"),
  staticData: {
    appShell: {
      mode: "focused",
      title: "新しい管理者を招待",
      backTo: "/app/manage/managers",
      backLabel: "管理者と権限へ戻る",
    },
  },
  component: AppManageInviteNewPage,
});
