import { createFileRoute } from "@tanstack/react-router";
import { TimecardPage } from "@/src/components/pages/TimecardPage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/timecard")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <TimecardPage />
    </Animation>
  );
}
