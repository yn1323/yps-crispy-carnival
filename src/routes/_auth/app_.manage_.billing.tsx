import { createFileRoute } from "@tanstack/react-router";
import { AppManageBillingPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/manage_/billing")({
  head: () => buildAppPrototypePageHead("プランと支払い"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageBillingPage,
});
