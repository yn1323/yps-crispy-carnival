import { createFileRoute } from "@tanstack/react-router";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <div>Hello "/_auth/shops/"!</div>
    </Animation>
  );
}
