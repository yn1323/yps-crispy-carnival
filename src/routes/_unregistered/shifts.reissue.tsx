import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { StaffShiftReissuePage } from "@/src/pages/staff-shift-reissue";

export const Route = createFileRoute("/_unregistered/shifts/reissue")({
  validateSearch: (search: Record<string, unknown>) => ({
    recruitmentId: search.recruitmentId as string,
  }),
  head: () => ({
    meta: buildMeta({ title: "シフト閲覧リンクの再発行", noindex: true }),
  }),
  component: ReissueRoute,
});

function ReissueRoute() {
  const { recruitmentId } = Route.useSearch();
  return <StaffShiftReissuePage recruitmentId={recruitmentId} />;
}
