import { createFileRoute } from "@tanstack/react-router";
import { Welcome } from "@/src/components/pages/Welcome";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_unregistered/welcome")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <Welcome />
    </Animation>
  );
}
