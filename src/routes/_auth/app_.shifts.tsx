import { createFileRoute } from "@tanstack/react-router";
import { AppShiftsPage } from "@/src/pages/app-navigation-prototype";
import { buildAppPrototypePageHead } from "@/src/pages/app-navigation-prototype/meta";

export const Route = createFileRoute("/_auth/app_/shifts")({
  head: () => buildAppPrototypePageHead("シフト"),
  staticData: { appShell: { mode: "navigation", activeKey: "shifts" } },
  component: AppShiftsPage,
});
