import { createFileRoute } from "@tanstack/react-router";
import {
  useAppOrganizationScope,
  validateAppOrganizationRouteSearch,
} from "@/src/components/features/AuthenticatedApp";
import { ShiftExportRoutePage } from "@/src/pages/shift-export";
import { buildShiftExportPageHead } from "@/src/pages/shift-export/meta";

export const Route = createFileRoute("/_auth/shifts_/$recruitmentId_/export")({
  validateSearch: validateAppOrganizationRouteSearch,
  head: buildShiftExportPageHead,
  staticData: {
    appShell: { mode: "bare" },
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { recruitmentId } = Route.useParams();
  const { organizationId } = useAppOrganizationScope();

  return <ShiftExportRoutePage organizationId={organizationId} recruitmentId={recruitmentId} />;
}
