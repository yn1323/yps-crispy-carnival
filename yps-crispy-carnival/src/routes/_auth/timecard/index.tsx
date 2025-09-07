import { createFileRoute } from "@tanstack/react-router";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/timecard/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Animation>Hello "/(auth)/timecard/"!</Animation>;
}
