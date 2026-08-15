import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { AppShiftBoardRoutePage } from "@/src/pages/app-shift-board";
import { buildAppShiftBoardPageHead } from "@/src/pages/app-shift-board/meta";

export const Route = createFileRoute("/_auth/app_/shifts_/$recruitmentId_/board")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildAppShiftBoardPageHead,
  staticData: {
    appShell: {
      mode: "navigation",
      activeKey: "shifts",
    },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { recruitmentId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();

  return <AppShiftBoardRoutePage organizationId={organizationId} recruitmentId={recruitmentId} />;
}
