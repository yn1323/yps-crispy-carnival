import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppFilteredListRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppStaffRoutePage } from "@/src/pages/app-staff";
import { buildAppStaffPageHead } from "@/src/pages/app-staff/meta";

export const Route = createFileRoute("/_auth/staff")({
  validateSearch: validateAppFilteredListRouteSearch,
  head: buildAppStaffPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: AppStaffRoute,
});

function AppStaffRoute() {
  const { shopFilter } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <AppStaffRoutePage
      organizationId={organization.organizationId}
      memberStatus={organization.memberStatus}
      activeShops={organization.activeShops}
      requestedShopFilter={shopFilter}
    />
  );
}
