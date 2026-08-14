import { createFileRoute } from "@tanstack/react-router";
import { AppAccountPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/account")({
  head: () => buildAppPrototypePageHead("アカウント"),
  staticData: { appShell: { mode: "navigation", activeKey: null } },
  component: AppAccountPage,
});
