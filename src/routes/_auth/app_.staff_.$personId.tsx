import { createFileRoute } from "@tanstack/react-router";
import { AppStaffDetailPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/staff_/$personId")({
  head: () => buildAppPrototypePageHead("スタッフ詳細"),
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: AppStaffDetailPage,
});
