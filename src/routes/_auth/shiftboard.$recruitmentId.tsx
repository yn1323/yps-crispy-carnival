import { createFileRoute } from "@tanstack/react-router";
import { ShiftBoardRoutePage } from "@/src/pages/shift-board";
import { buildShiftBoardPageHead } from "@/src/pages/shift-board/meta";

export const Route = createFileRoute("/_auth/shiftboard/$recruitmentId")({
  head: buildShiftBoardPageHead,
  component: ShiftBoardRoute,
});

function ShiftBoardRoute() {
  const { recruitmentId } = Route.useParams();
  return <ShiftBoardRoutePage recruitmentId={recruitmentId} />;
}
