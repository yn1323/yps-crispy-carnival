import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffShiftSubmitCompletedPage } from "@/src/pages/staff-shift-submit-completed";

export const Route = createFileRoute("/_unregistered/shifts/submit_/completed")({
  validateSearch: (search: Record<string, unknown>) => ({
    shopName: typeof search.shopName === "string" && search.shopName.trim() !== "" ? search.shopName : undefined,
  }),
  head: () => ({
    meta: buildMeta({ title: "シフト希望の提出完了", noindex: true }),
  }),
  component: ShiftSubmitCompletedRoute,
});

function ShiftSubmitCompletedRoute() {
  const { shopName } = Route.useSearch();
  return <StaffShiftSubmitCompletedPage shopName={shopName} />;
}
