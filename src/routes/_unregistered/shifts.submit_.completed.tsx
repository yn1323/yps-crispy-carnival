import { createFileRoute } from "@tanstack/react-router";
import { parseRecruitmentSearchId } from "@/src/domains/staffAccess";
import { StaffShiftSubmitCompletedPage } from "@/src/pages/staff-shift-submit-completed";
import { buildStaffShiftSubmitCompletedPageHead } from "@/src/pages/staff-shift-submit-completed/meta";

export const Route = createFileRoute("/_unregistered/shifts/submit_/completed")({
  validateSearch: (search: Record<string, unknown>) => ({
    recruitmentId: parseRecruitmentSearchId(search.recruitmentId),
  }),
  head: buildStaffShiftSubmitCompletedPageHead,
  component: ShiftSubmitCompletedRoute,
});

function ShiftSubmitCompletedRoute() {
  const { recruitmentId } = Route.useSearch();
  return <StaffShiftSubmitCompletedPage recruitmentId={recruitmentId} />;
}
