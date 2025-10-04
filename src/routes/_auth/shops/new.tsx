import { createFileRoute } from "@tanstack/react-router";
import { ShopsNew } from "@/src/components/pages/Shops/New";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/new")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShopsNew />
    </Animation>
  );
}
