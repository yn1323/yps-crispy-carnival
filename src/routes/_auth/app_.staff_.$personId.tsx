import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppUserDetailPage } from "@/src/pages/user-detail";
import { buildUserDetailPageHead } from "@/src/pages/user-detail/meta";

export const Route = createFileRoute("/_auth/app_/staff_/$personId")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildUserDetailPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "staff" } },
  component: AppStaffDetailRoute,
});

function AppStaffDetailRoute() {
  const { personId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();
  return <AppUserDetailPage personId={personId} organizationId={organizationId} />;
}
