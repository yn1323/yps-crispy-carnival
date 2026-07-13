import { createFileRoute } from "@tanstack/react-router";
import { StaffShiftReissuePage } from "@/src/pages/staff-shift-reissue";
import { buildStaffShiftReissuePageHead } from "@/src/pages/staff-shift-reissue/meta";

export const Route = createFileRoute("/_unregistered/shifts/reissue")({
  validateSearch: (search: Record<string, unknown>) => ({
    recruitmentId: search.recruitmentId as string,
  }),
  head: buildStaffShiftReissuePageHead,
  component: ReissueRoute,
});

function ReissueRoute() {
  const { recruitmentId } = Route.useSearch();
  return <StaffShiftReissuePage recruitmentId={recruitmentId} />;
}
