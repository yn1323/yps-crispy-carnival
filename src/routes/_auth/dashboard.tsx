import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { DashboardPage } from "@/src/pages/dashboard";

export const Route = createFileRoute("/_auth/dashboard")({
  head: () => ({
    meta: buildMeta({ title: "ダッシュボード", noindex: true }),
  }),
  component: DashboardPage,
});
