import { createFileRoute } from "@tanstack/react-router";
import { WelcomePage } from "@/src/components/pages/WelcomePage";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_unregistered/welcome")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <WelcomePage />
    </Animation>
  );
}
