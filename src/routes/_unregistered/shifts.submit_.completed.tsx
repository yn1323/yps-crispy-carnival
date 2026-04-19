import { createFileRoute } from "@tanstack/react-router";
import { SubmittedView } from "@/src/components/features/StaffSubmit/SubmittedView";
import { buildMeta } from "@/src/helpers/seo";

export const Route = createFileRoute("/_unregistered/shifts/submit_/completed")({
  head: () => ({
    meta: buildMeta({ title: "シフト希望の提出完了", noindex: true }),
  }),
  component: ShiftSubmitCompletedRoute,
});

function ShiftSubmitCompletedRoute() {
  return <SubmittedView />;
}
