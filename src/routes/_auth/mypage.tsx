import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/src/components/features/Dashboard";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/mypage")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <Dashboard />
    </Animation>
  );
}
