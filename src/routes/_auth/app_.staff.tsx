import { createFileRoute } from "@tanstack/react-router";
import { AppStaffPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/staff")({
  head: () => buildAppPrototypePageHead("スタッフ"),
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: AppStaffPage,
});
