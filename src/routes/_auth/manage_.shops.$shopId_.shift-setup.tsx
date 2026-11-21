import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppShiftSetupPage } from "@/src/pages/shift-setup";
import { buildShiftSetupPageHead } from "@/src/pages/shift-setup/meta";

export const Route = createFileRoute("/_auth/manage_/shops/$shopId_/shift-setup")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildShiftSetupPageHead,
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageShiftSetupRoute,
});

function AppManageShiftSetupRoute() {
  const { shopId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();
  return <AppShiftSetupPage shopId={shopId} organizationId={organizationId} />;
}
