import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffShiftSubmitPage } from "@/src/pages/staff-shift-submit";

export const Route = createFileRoute("/_unregistered/shifts/submit")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "希望シフト提出", noindex: true }),
  }),
  component: ShiftSubmitRoute,
});

function ShiftSubmitRoute() {
  const { token } = Route.useSearch();
  return <StaffShiftSubmitPage token={token} />;
}
