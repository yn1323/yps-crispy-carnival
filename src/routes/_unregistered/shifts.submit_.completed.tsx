import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffShiftSubmitCompletedPage } from "@/src/pages/staff-shift-submit-completed";

export const Route = createFileRoute("/_unregistered/shifts/submit_/completed")({
  head: () => ({
    meta: buildMeta({ title: "シフト希望の提出完了", noindex: true }),
  }),
  component: ShiftSubmitCompletedRoute,
});

function ShiftSubmitCompletedRoute() {
  return <StaffShiftSubmitCompletedPage />;
}
