import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/src/pages/dashboard";
import { buildDashboardPageHead } from "@/src/pages/dashboard/meta";

export const Route = createFileRoute("/_auth/dashboard")({
  head: buildDashboardPageHead,
  component: DashboardPage,
});
