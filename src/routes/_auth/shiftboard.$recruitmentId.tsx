import { createFileRoute } from "@tanstack/react-router";
import { ShiftBoardPage } from "@/src/components/features/ShiftBoard/ShiftBoardPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shiftboard/$recruitmentId")({
  component: ShiftBoardRoute,
});

function ShiftBoardRoute() {
  return (
    <Animation>
      <ShiftBoardPage />
    </Animation>
  );
}
