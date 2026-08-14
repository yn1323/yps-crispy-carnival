import { createFileRoute } from "@tanstack/react-router";
import { useAppOrganizationScope, validateDashboardRouteSearch } from "@/src/components/features/AuthenticatedApp";
import { DashboardRoutePage } from "@/src/pages/dashboard";
import { buildDashboardPageHead } from "@/src/pages/dashboard/meta";

export const Route = createFileRoute("/_auth/dashboard")({
  head: buildDashboardPageHead,
  validateSearch: validateDashboardRouteSearch,
  staticData: { appShell: { mode: "navigation", activeKey: "home" } },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { shop } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <DashboardRoutePage
      organizationId={organization.organizationId}
      organizationName={organization.organizationName}
      memberStatus={organization.memberStatus}
      activeShops={organization.activeShops}
      requestedShopId={shop}
    />
  );
}
