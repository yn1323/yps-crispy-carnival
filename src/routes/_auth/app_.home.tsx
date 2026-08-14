import { createFileRoute } from "@tanstack/react-router";
import { useAppOrganizationScope, validateAppHomeRouteSearch } from "@/src/components/features/AuthenticatedApp";
import { AppHomeRoutePage } from "@/src/pages/app-home";
import { buildAppHomePageHead } from "@/src/pages/app-home/meta";

export const Route = createFileRoute("/_auth/app_/home")({
  validateSearch: validateAppHomeRouteSearch,
  head: buildAppHomePageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "home" } },
  component: AppHomeRoute,
});

function AppHomeRoute() {
  const { shop } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <AppHomeRoutePage
      organizationId={organization.organizationId}
      organizationName={organization.organizationName}
      memberStatus={organization.memberStatus}
      activeShops={organization.activeShops}
      requestedShopId={shop}
    />
  );
}
