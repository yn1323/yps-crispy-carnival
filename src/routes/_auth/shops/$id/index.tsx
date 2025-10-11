import { createFileRoute } from "@tanstack/react-router";
import { ShopDetail } from "@/src/components/features/Shop/ShopDetail";
import { Animation } from "@/src/components/templates/Animation";

export const Route = createFileRoute("/_auth/shops/$id/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Animation>
      <ShopDetail />
    </Animation>
  );
}
