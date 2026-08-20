import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppFilteredListRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppStaffOrderRoutePage } from "@/src/pages/app-staff-order";
import { buildAppStaffOrderPageHead } from "@/src/pages/app-staff-order/meta";

export const Route = createFileRoute("/_auth/staff_/order")({
  validateSearch: validateAppFilteredListRouteSearch,
  head: buildAppStaffOrderPageHead,
  staticData: {
    appShell: {
      mode: "focused",
      title: "スタッフの並び順",
      backLabel: "スタッフ一覧へ戻る",
    },
  },
  component: AppStaffOrderRoute,
});

function AppStaffOrderRoute() {
  const { shopFilter } = Route.useSearch();
  const organization = useAppOrganizationScope();

  return (
    <AppStaffOrderRoutePage
      organizationId={organization.organizationId}
      requestedShopFilter={shopFilter}
      activeShops={organization.activeShops}
    />
  );
}
