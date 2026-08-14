import { createFileRoute } from "@tanstack/react-router";
import { AppActionsPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/actions")({
  head: () => buildAppPrototypePageHead("対応"),
  staticData: { appShell: { mode: "navigation", activeKey: "actions" } },
  component: AppActionsPage,
});
