import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppManageInviteNewRoutePage } from "@/src/pages/app-manage";
import { buildAppManagePageHead } from "@/src/pages/app-manage/meta";

export const Route = createFileRoute("/_auth/manage_/managers_/invite-new")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: () => buildAppManagePageHead("新しい管理者を招待"),
  staticData: {
    appShell: {
      mode: "focused",
      title: "新しい管理者を招待",
      backLabel: "前の画面へ戻る",
    },
  },
  component: AppManageInviteNewRoute,
});

function AppManageInviteNewRoute() {
  const organization = useAppOrganizationScope();
  return (
    <AppManageInviteNewRoutePage
      organizationId={organization.organizationId}
      memberStatus={organization.memberStatus}
    />
  );
}
