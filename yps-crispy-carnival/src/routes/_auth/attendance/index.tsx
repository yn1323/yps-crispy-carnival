import { createFileRoute } from "@tanstack/react-router";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/attendance/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <Animation>Hello "/(auth)/attendance/"!</Animation>;
}
