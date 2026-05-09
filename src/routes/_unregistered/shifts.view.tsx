import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffShiftViewRoutePage } from "@/src/pages/staff-shift-view";

export const Route = createFileRoute("/_unregistered/shifts/view")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "シフト確認", noindex: true }),
  }),
  component: ShiftViewRoute,
});

function ShiftViewRoute() {
  const { token } = Route.useSearch();
  return <StaffShiftViewRoutePage token={token} />;
}
