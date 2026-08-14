import { createFileRoute } from "@tanstack/react-router";
import { AppManagePage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage")({
  head: () => buildAppPrototypePageHead("管理"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManagePage,
});
