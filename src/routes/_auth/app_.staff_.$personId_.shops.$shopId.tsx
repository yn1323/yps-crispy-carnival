import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { UserShopDetailPage } from "@/src/pages/user-shop-detail";
import { buildUserShopDetailPageHead } from "@/src/pages/user-shop-detail/meta";

export const Route = createFileRoute("/_auth/app_/staff_/$personId_/shops/$shopId")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildUserShopDetailPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: StaffShopDetailRoutePage,
});

function StaffShopDetailRoutePage() {
  const { personId, shopId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();

  return <UserShopDetailPage personId={personId} targetShopId={shopId} appOrganizationId={organizationId} />;
}
