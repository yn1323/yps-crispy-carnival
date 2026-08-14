import { createFileRoute } from "@tanstack/react-router";
import { AppHomePage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/home")({
  head: () => buildAppPrototypePageHead("ホーム"),
  staticData: { appShell: { mode: "navigation", activeKey: "home" } },
  component: AppHomePage,
});
