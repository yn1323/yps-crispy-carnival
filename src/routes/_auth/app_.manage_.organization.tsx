import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageOrganizationRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/app_/manage_/organization")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead("組織情報"),
  staticData: { appShell: { mode: "navigation", activeKey: "manage" } },
  component: AppManageOrganizationRoute,
});

function AppManageOrganizationRoute() {
  const organization = useAppOrganizationScope();
  return (
    <AppManageOrganizationRoutePage
      organizationId={organization.organizationId}
      memberStatus={organization.memberStatus}
    />
  );
}
