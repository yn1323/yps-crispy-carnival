import { createFileRoute } from "@tanstack/react-router";
import { buildMeta } from "@/src/helpers/seo";
import { ShiftBoardRoutePage } from "@/src/pages/shift-board";

export const Route = createFileRoute("/_auth/shiftboard/$recruitmentId")({
  head: () => ({
    meta: buildMeta({ title: "シフト表", noindex: true }),
  }),
  component: ShiftBoardRoute,
});

function ShiftBoardRoute() {
  const { recruitmentId } = Route.useParams();
  return <ShiftBoardRoutePage recruitmentId={recruitmentId} />;
}
