import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppFilteredListRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppActionsRoutePage } from "@/src/pages/app-actions";
import { buildAppActionsPageHead } from "@/src/pages/app-actions/meta";

export const Route = createFileRoute("/_auth/actions")({
  validateSearch: validateAppFilteredListRouteSearch,
  head: buildAppActionsPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "actions" } },
  component: AppActionsRoute,
});

function AppActionsRoute() {
  const { shopFilter } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <AppActionsRoutePage
      organizationId={organization.organizationId}
      shops={organization.shops}
      requestedShopFilter={shopFilter}
    />
  );
}
