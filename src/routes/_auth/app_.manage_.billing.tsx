import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageBillingRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/app_/manage_/billing")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead("プランと支払い"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageBillingRoute,
});

function AppManageBillingRoute() {
  const organization = useAppOrganizationScope();
  return (
    <AppManageBillingRoutePage organizationId={organization.organizationId} memberStatus={organization.memberStatus} />
  );
}
