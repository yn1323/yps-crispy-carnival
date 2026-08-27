import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageInviteStaffRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/manage_/managers_/invite-staff")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead("既存スタッフを管理者として招待"),
  staticData: {
    appShell: {
      mode: "focused",
      title: "既存スタッフを招待",
      backLabel: "前の画面へ戻る",
    },
  },
  component: AppManageInviteStaffRoute,
});

function AppManageInviteStaffRoute() {
  const organization = useAppOrganizationScope();
  return <AppManageInviteStaffRoutePage organizationId={organization.organizationId} />;
}
