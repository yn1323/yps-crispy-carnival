import { createFileRoute } from "@tanstack/react-router";
import { parseRecruitmentSearchId } from "@/src/domains/staffAccess";
import { StaffShiftReissuePage } from "@/src/pages/staff-shift-reissue";
import { buildStaffShiftReissuePageHead } from "@/src/pages/staff-shift-reissue/meta";

export const Route = createFileRoute("/_unregistered/shifts/reissue")({
  validateSearch: (search: Record<string, unknown>) => ({
    recruitmentId: parseRecruitmentSearchId(search.recruitmentId),
  }),
  head: buildStaffShiftReissuePageHead,
  component: ReissueRoute,
});

function ReissueRoute() {
  const { recruitmentId } = Route.useSearch();
  return <StaffShiftReissuePage recruitmentId={recruitmentId} />;
}
