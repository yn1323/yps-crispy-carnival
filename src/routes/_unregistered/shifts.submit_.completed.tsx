import { createFileRoute } from "@tanstack/react-router";
import { StaffShiftSubmitCompletedPage } from "@/src/pages/staff-shift-submit-completed";
import { buildStaffShiftSubmitCompletedPageHead } from "@/src/pages/staff-shift-submit-completed/meta";

export const Route = createFileRoute("/_unregistered/shifts/submit_/completed")({
  validateSearch: (search: Record<string, unknown>) => ({
    shopName: typeof search.shopName === "string" && search.shopName.trim() !== "" ? search.shopName : undefined,
  }),
  head: buildStaffShiftSubmitCompletedPageHead,
  component: ShiftSubmitCompletedRoute,
});

function ShiftSubmitCompletedRoute() {
  const { shopName } = Route.useSearch();
  return <StaffShiftSubmitCompletedPage shopName={shopName} />;
}
