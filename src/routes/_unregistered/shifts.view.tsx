import { createFileRoute } from "@tanstack/react-router";
import { StaffShiftViewRoutePage } from "@/src/pages/staff-shift-view";
import { buildStaffShiftViewPageHead } from "@/src/pages/staff-shift-view/meta";

export const Route = createFileRoute("/_unregistered/shifts/view")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: buildStaffShiftViewPageHead,
  component: ShiftViewRoute,
});

function ShiftViewRoute() {
  const { token } = Route.useSearch();
  return <StaffShiftViewRoutePage token={token} />;
}
