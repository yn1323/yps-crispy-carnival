import { createFileRoute } from "@tanstack/react-router";
import { AppManageManagersPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/managers")({
  head: () => buildAppPrototypePageHead("管理者と権限"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageManagersPage,
});
