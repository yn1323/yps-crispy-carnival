import { createFileRoute } from "@tanstack/react-router";
import { AppManageOrganizationPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/organization")({
  head: () => buildAppPrototypePageHead("組織情報"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageOrganizationPage,
});
