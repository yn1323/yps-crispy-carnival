import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppFilteredListRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppShiftsRoutePage } from "@/src/pages/app-shifts";
import { buildAppShiftsPageHead } from "@/src/pages/app-shifts/meta";

export const Route = createFileRoute("/_auth/app_/shifts")({
  validateSearch: validateAppFilteredListRouteSearch,
  head: buildAppShiftsPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "shifts" } },
  component: AppShiftsRoute,
});

function AppShiftsRoute() {
  const { shopFilter } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <AppShiftsRoutePage
      organizationId={organization.organizationId}
      memberStatus={organization.memberStatus}
      activeShops={organization.activeShops}
      requestedShopFilter={shopFilter}
    />
  );
}
