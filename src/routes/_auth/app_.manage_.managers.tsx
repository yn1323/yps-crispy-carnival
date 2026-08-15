import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageManagersRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/app_/manage_/managers")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead("管理者と権限"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageManagersRoute,
});

function AppManageManagersRoute() {
  const organization = useAppOrganizationScope();
  return (
    <AppManageManagersRoutePage organizationId={organization.organizationId} memberStatus={organization.memberStatus} />
  );
}
