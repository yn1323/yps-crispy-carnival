import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/app_/manage")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead(),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageRoute,
});

function AppManageRoute() {
  const organization = useAppOrganizationScope();
  return <AppManageRoutePage organizationId={organization.organizationId} memberStatus={organization.memberStatus} />;
}
