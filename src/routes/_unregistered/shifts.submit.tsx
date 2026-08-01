import { createFileRoute } from "@tanstack/react-router";
import { StaffShiftSubmitPage } from "@/src/pages/staff-shift-submit";
import { buildStaffShiftSubmitPageHead } from "@/src/pages/staff-shift-submit/meta";

export const Route = createFileRoute("/_unregistered/shifts/submit")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: buildStaffShiftSubmitPageHead,
  component: ShiftSubmitRoute,
});

function ShiftSubmitRoute() {
  const { token } = Route.useSearch();
  return <StaffShiftSubmitPage token={token} />;
}
